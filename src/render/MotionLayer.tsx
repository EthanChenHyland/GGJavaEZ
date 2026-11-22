import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Color, DynamicDrawUsage, Frustum, InstancedBufferAttribute, InstancedInterleavedBuffer, InterleavedBufferAttribute, Matrix4 } from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import type { WorldRenderSnapshot } from './worldRenderSnapshot'
import type { TraceDocument } from '../contracts/runtime'
import type { TimelineStore } from '../timeline/timelineStore'
import type { ConnectorWidth, Vec3 } from '../contracts/world'
import { useQualityStore } from './quality/qualityStore'
import { historyForTrace } from '../runtime/history'
import { createTransitionPlayer, type OverlayFrame, type SettleFrame } from '../motion/transitionPlayer'
import { createTimelineMotionBinding } from '../motion/timelineMotion'
import { motionSubjects, motionCurve, motionRole, motionMarks, motionTravel, visitMotionMark, visitMotionTravel, type MotionSubject } from '../motion/overlayGeometry'
import { productionClock } from '../motion/clock'
import { motion as motionBudget, world } from '../theme/tokens'
import { connectorMaterial, roleColor } from './RuntimeMaterials'
import { requestAnimationFrameRender } from './renderActivity'

type MotionCue = Pick<OverlayFrame['step'], 'eventId' | 'seq' | 'kind' | 'flowId' | 'direction'> & {
  progress: number
  static: boolean
  from: string | null
  to: string | null
  evidence: OverlayFrame['step']['transition']['evidence']
  renderedRouteId: string | null
  marks: { id: string; shape: string }[]
}

export const motionReadiness = {
  animating: false,
  cursor: 0,
  pending: 0,
  drawnSegments: 0,
  cues: [] as MotionCue[],
  settle: null as SettleFrame | null,
}
const qa = import.meta.env.DEV || import.meta.env.VITE_QA === '1'
const segmentCapacity = motionBudget.maxPending * 24 + 128

function createMotionBatch() {
  const geometry = new LineSegmentsGeometry()
  const positions = new Float32Array(segmentCapacity * 6), colors = new Float32Array(segmentCapacity * 6)
  const opacity = new InstancedBufferAttribute(new Float32Array(segmentCapacity), 1).setUsage(DynamicDrawUsage)
  const positionBuffer = new InstancedInterleavedBuffer(positions, 6).setUsage(DynamicDrawUsage)
  const colorBuffer = new InstancedInterleavedBuffer(colors, 6).setUsage(DynamicDrawUsage)
  geometry.setAttribute('instanceStart', new InterleavedBufferAttribute(positionBuffer, 3, 0))
  geometry.setAttribute('instanceEnd', new InterleavedBufferAttribute(positionBuffer, 3, 3))
  geometry.setAttribute('instanceColorStart', new InterleavedBufferAttribute(colorBuffer, 3, 0))
  geometry.setAttribute('instanceColorEnd', new InterleavedBufferAttribute(colorBuffer, 3, 3))
  geometry.setAttribute('instanceCurveOpacity', opacity)
  const material = connectorMaterial(false, world.connector.corePx as ConnectorWidth)
  const lines = new LineSegments2(geometry, material)
  lines.name = 'runtime-motion-cues'
  lines.userData.runtimeBloomRole = 'emitter'
  lines.frustumCulled = false
  lines.visible = false
  lines.raycast = () => undefined
  let count = 0
  return {
    lines,
    add(a: Vec3, b: Vec3, color: Color, alpha: number) {
      if (count >= segmentCapacity || alpha <= 0 || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2])) return
      const i = count * 6
      positions.set(a, i)
      positions.set(b, i + 3)
      colors[i] = colors[i + 3] = color.r
      colors[i + 1] = colors[i + 4] = color.g
      colors[i + 2] = colors[i + 5] = color.b
      opacity.setX(count++, alpha)
    },
    publish() {
      const drawn = count
      geometry.instanceCount = count
      lines.visible = count > 0
      if (count) {
        positionBuffer.needsUpdate = true
        colorBuffer.needsUpdate = true
        opacity.needsUpdate = true
      }
      count = 0
      return drawn
    },
    dispose() { geometry.dispose(); material.dispose() },
  }
}

/** One bounded overlay batch. Runtime solids, glyphs, picking and camera
 * retain their canonical state throughout playback and arbitrary seeks. */
export function MotionLayer({ trace, timeline, snapshot }: { trace: TraceDocument; timeline: TimelineStore; snapshot: WorldRenderSnapshot }) {
  const { scene, plan } = snapshot.read()
  const { camera, invalidate } = useThree()
  useEffect(() => productionClock.subscribe(invalidate), [invalidate])
  const preference = useQualityStore(state => state.reducedMotion), reduced = preference.inApp || preference.os
  const latestReduced = useRef(reduced)
  const motion = useMemo(() => {
    const player = createTransitionPlayer({ trace, history: historyForTrace(trace) }, productionClock)
    return { player, attach: createTimelineMotionBinding(player, timeline, () => latestReduced.current) }
  }, [timeline])
  const subjects = useMemo(() => motionSubjects(scene, plan), [scene, plan])
  const curves = useMemo(() => new Map(plan.curves.map(curve => [curve.id, curve])), [plan])
  const batch = useMemo(createMotionBatch, [])
  const scratch = useMemo(() => ({ color: new Color(), box: new Box3(), frustum: new Frustum(), viewProjection: new Matrix4() }), [])

  useLayoutEffect(() => {
    latestReduced.current = reduced
    const state = timeline.getSnapshot().state
    motion.player.cursorChanged({ from: state.cursor, to: state.cursor, reason: 'seek', speed: state.speed, reducedMotion: reduced })
  }, [reduced, motion, timeline])
  useLayoutEffect(() => motion.attach(), [motion])
  useEffect(() => () => {
    batch.dispose()
    Object.assign(motionReadiness, { animating: false, cursor: 0, pending: 0, drawnSegments: 0, cues: [], settle: null })
  }, [batch])

  useFrame(() => {
    if (scene.cursor !== timeline.getSnapshot().state.cursor) {
      // Never consume a new cue against the old prefix before React commits.
      batch.publish()
      Object.assign(motionReadiness, { animating: true, drawnSegments: 0, cues: [], settle: null })
      requestAnimationFrameRender(invalidate)
      return
    }
    scratch.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    scratch.frustum.setFromProjectionMatrix(scratch.viewProjection)
    const visible = (subject: MotionSubject) => {
      const [x, y, z] = subject.anchor.position, [w, h, d] = subject.anchor.size
      scratch.box.min.set(x - w / 2, y - h / 2, z - d / 2)
      scratch.box.max.set(x + w / 2, y + h / 2, z + d / 2)
      return scratch.frustum.intersectsBox(scratch.box)
    }
    const sample = motion.player.sample(productionClock.now(), ids => ids.some(id => {
      const subject = subjects.get(id)
      return !!subject && visible(subject)
    }))
    motionReadiness.animating = sample.animating
    if (sample.animating) requestAnimationFrameRender(invalidate)
    const marked = new Set<string>(), cues: MotionCue[] = []
    for (const frame of sample.overlays) {
      const { step } = frame, { from, to, evidence } = step.transition
      const tint = scratch.color.set(roleColor[motionRole(step)])
      const curve = motionCurve(step, subjects, curves)
      const marks: MotionCue['marks'] = []
      for (const mark of motionMarks(frame)) {
        const subject = subjects.get(mark.id)
        if (!subject || marked.has(mark.id) || !visible(subject)) continue
        marked.add(mark.id)
        visitMotionMark(subject.anchor, mark, (a, b) => batch.add(a, b, tint, mark.opacity * subject.opacity))
        if (qa) marks.push({ id: mark.id, shape: mark.shape })
      }
      const travel = motionTravel(frame)
      let renderedRouteId: string | null = null
      if (curve && curve.opacity > 0 && travel) {
        const receiverRef = step.kind === 'receiver' && curve.kind === 'connector' && from?.kind === 'object'
        const reversed = receiverRef !== (step.direction === 'reverse')
        if (visitMotionTravel(curve.points, travel, reversed, (a, b) => batch.add(a, b, tint, travel.opacity * curve.opacity))) renderedRouteId = curve.id
      }
      if (qa) cues.push({ eventId: step.eventId, seq: step.seq, kind: step.kind, direction: step.direction,
        flowId: step.flowId, renderedRouteId, progress: frame.progress, static: frame.static, from: from?.id ?? null, to: to?.id ?? null, evidence, marks })
    }
    if (sample.settle?.cursor === scene.cursor) {
      const tint = scratch.color.set(roleColor.reference)
      const ids = scene.cursorEvent?.subjects ?? []
      for (let i = 0; i < Math.min(ids.length, motionBudget.maxPending); i++) {
        const subject = subjects.get(ids[i])
        if (subject && visible(subject)) visitMotionMark(subject.anchor, { id: subject.id, shape: 'bracket', progress: 1, opacity: 1 },
          (a, b) => batch.add(a, b, tint, .24 * (1 - sample.settle!.progress) * subject.opacity))
      }
    }
    const drawnSegments = batch.publish()
    if (qa) Object.assign(motionReadiness, { cursor: scene.cursor, drawnSegments, pending: motion.player.pendingCount, cues, settle: sample.settle })
  })
  return <primitive object={batch.lines} dispose={null}/>
}
