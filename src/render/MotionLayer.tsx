import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Color, Frustum, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import type { WorldRenderSnapshot } from './worldRenderSnapshot'
import type { TraceDocument } from '../contracts/runtime'
import type { TimelineStore } from '../timeline/timelineStore'
import { useQualityStore } from './quality/qualityStore'
import { historyForTrace } from '../runtime/history'
import { createTransitionPlayer } from '../motion/transitionPlayer'
import { createTimelineMotionBinding } from '../motion/timelineMotion'
import { motionSubjects, motionCurve, motionRole, overlayEmphasis, type MotionSubject } from '../motion/overlayGeometry'
import { productionClock } from '../motion/clock'
import { roleColor, unitEdges } from './RuntimeMaterials'
import {requestAnimationFrameRender} from './renderActivity'
export const motionReadiness = { animating: false }
const noRaycast = () => undefined

function outlineBatch(capacity: number) {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', unitEdges.getAttribute('position').clone())
  const offset = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  const size = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  const tint = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
  geometry.setAttribute('motionOffset', offset)
  geometry.setAttribute('motionSize', size)
  geometry.setAttribute('motionTint', tint)
  geometry.instanceCount = 0
  const material = new ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `attribute vec3 motionOffset; attribute vec3 motionSize; attribute vec4 motionTint;
varying vec4 emphasis; void main(){ emphasis=motionTint; gl_Position=projectionMatrix*modelViewMatrix*vec4(motionOffset+position*motionSize,1.0); }`,
    fragmentShader: `varying vec4 emphasis;
void main(){ gl_FragColor=emphasis;
#include <colorspace_fragment>
}` })
  return { geometry, material, offset, size, tint }
}
function tokenBatch(capacity: number) {
  const geometry = new SphereGeometry(.10, 8, 6)
  const alpha = new InstancedBufferAttribute(new Float32Array(capacity), 1)
  geometry.setAttribute('motionAlpha', alpha)
  const material = new MeshBasicMaterial({ color: 'white', toneMapped: false, transparent: true, depthWrite: false })
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float motionAlpha; varying float tokenAlpha;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntokenAlpha = motionAlpha;')
    shader.fragmentShader = 'varying float tokenAlpha;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= tokenAlpha;')
  }
  material.customProgramCacheKey = () => 'recorded-motion-token-alpha-v1'
  return { geometry, material, alpha }
}

/** Transient cuboid emphasis and tokens; canonical solids, faces and camera stay untouched. */
export function MotionLayer({ trace, timeline, snapshot }: { trace: TraceDocument; timeline: TimelineStore; snapshot: WorldRenderSnapshot }) {
  const { scene, plan } = snapshot.read()
  const tokens = useRef<InstancedMesh>(null), { camera,invalidate } = useThree()
  useEffect(()=>productionClock.subscribe(invalidate),[invalidate])
  const preference = useQualityStore(state => state.reducedMotion), reduced = preference.inApp || preference.os
  const latestReduced = useRef(reduced)
  const motion = useMemo(() => {
    const player = createTransitionPlayer({ trace, history: historyForTrace(trace) }, productionClock)
    return { player, attach: createTimelineMotionBinding(player, timeline, () => latestReduced.current) }
  }, [timeline])
  const subjects = useMemo(() => motionSubjects(scene, plan), [scene, plan])
  const curves = useMemo(() => new Map(plan.curves.map(curve => [curve.id, curve])), [plan])
  const capacity = Math.max(8, 2 ** Math.ceil(Math.log2(subjects.size || 1)))
  const batch = useMemo(() => outlineBatch(capacity), [capacity])
  const tokenCapacity = Math.max(8, 2 ** Math.ceil(Math.log2(curves.size || 1)))
  const token = useMemo(() => tokenBatch(tokenCapacity), [tokenCapacity])
  const scratch = useMemo(() => ({ transform: new Object3D(), color: new Color(), first: new Vector3(), second: new Vector3(), box: new Box3(), frustum: new Frustum(), viewProjection: new Matrix4() }), [])

  // Runs before paint and before the parent's next host reconciliation.
  useLayoutEffect(() => {
    latestReduced.current = reduced
    if (reduced) {
      const state = timeline.getSnapshot().state
      motion.player.cursorChanged({ from: state.cursor, to: state.cursor, reason: 'seek', speed: state.speed, reducedMotion: true })
    } else {
      // Turning motion back on never replays the previous Cursor change.
      const state = timeline.getSnapshot().state
      motion.player.cursorChanged({ from: state.cursor, to: state.cursor, reason: 'seek', speed: state.speed, reducedMotion: false })
    }
  }, [reduced, motion, timeline])
  useLayoutEffect(() => motion.attach(), [motion])
  useEffect(() => () => { batch.geometry.dispose(); batch.material.dispose() }, [batch])
  useEffect(() => () => { token.geometry.dispose(); token.material.dispose() }, [token])
  useEffect(() => () => { motionReadiness.animating = false }, [])

  useFrame(() => {
    const mesh = tokens.current
    if (!mesh) return
    if (scene.cursor !== timeline.getSnapshot().state.cursor) {
      // React may not yet have published the new scene to R3F. Never consume or
      // cull the new steps against the old prefix, or draw before truth commits.
      mesh.count = 0; batch.geometry.instanceCount = 0; motionReadiness.animating = true
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
    const sample = motion.player.sample(productionClock.now(), ids => ids.some(id => { const subject = subjects.get(id); return !!subject && visible(subject) }))
    motionReadiness.animating = sample.animating
    if(sample.animating)requestAnimationFrameRender(invalidate)
    let outlineCount = 0, tokenCount = 0
    const outlined = new Set<string>(), markedCurves = new Set<string>()
    const outline = (id: string, scale: number, alpha: number, color: string) => {
      const subject = subjects.get(id)
      if (!subject || outlined.has(id) || !visible(subject) || alpha <= 0 || outlineCount >= capacity) return
      outlined.add(id)
      const [x, y, z] = subject.anchor.position, [w, h, d] = subject.anchor.size
      // Front edge stays just ahead of the committed face while only this transient
      // volume scales. Faces/text/picking continue to use the canonical anchor.
      batch.offset.setXYZ(outlineCount, x, y, z + d * (1 - scale) / 2 + .006)
      batch.size.setXYZ(outlineCount, w * scale + .012, h * scale + .012, d * scale + .012)
      scratch.color.set(color)
      batch.tint.setXYZW(outlineCount, scratch.color.r, scratch.color.g, scratch.color.b, alpha * subject.opacity)
      outlineCount++
    }
    for (const frame of sample.overlays) {
      const emphasis = overlayEmphasis(frame), color = roleColor[motionRole(frame.step)]
      for (const id of frame.step.subjects) outline(id, emphasis.scale, emphasis.alpha, color)
      const curve = motionCurve(frame.step, subjects, curves)
      if (!curve || markedCurves.has(curve.id) || curve.points.length < 2 || tokenCount >= tokenCapacity) continue
      markedCurves.add(curve.id)
      const progress = frame.static ? 1 : frame.step.direction === 'reverse' ? 1 - frame.progress : frame.progress
      const position = progress * (curve.points.length - 1), index = Math.min(curve.points.length - 2, Math.floor(position)), fraction = position - index
      scratch.first.set(...curve.points[index]); scratch.second.set(...curve.points[index + 1])
      scratch.transform.position.lerpVectors(scratch.first, scratch.second, fraction)
      scratch.transform.updateMatrix()
      mesh.setMatrixAt(tokenCount, scratch.transform.matrix)
      mesh.setColorAt(tokenCount, scratch.color.set(roleColor[curve.colorRole]))
      token.alpha.setX(tokenCount, curve.opacity * (frame.static ? .55 : 1))
      tokenCount++
    }
    if (sample.settle && sample.settle.cursor === scene.cursor) {
      for (const id of scene.cursorEvent?.subjects ?? []) outline(id, 1, .30 * (1 - sample.settle.progress), roleColor.reference)
    }
    batch.geometry.instanceCount = outlineCount
    batch.offset.needsUpdate = true; batch.size.needsUpdate = true; batch.tint.needsUpdate = true
    mesh.count = tokenCount
    token.alpha.needsUpdate = true
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <>
    <lineSegments userData={{runtimeBloomRole:'emitter'}} geometry={batch.geometry} material={batch.material} dispose={null} frustumCulled={false} raycast={noRaycast}/>
    <instancedMesh userData={{runtimeBloomRole:'emitter'}} ref={tokens} args={[undefined, undefined, tokenCapacity]} geometry={token.geometry} material={token.material} dispose={null} frustumCulled={false} raycast={noRaycast}/>
  </>
}
