import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneModel, Vec3 } from '../contracts/world'
import { motionMs } from '../theme/tokens'
import {
  detailLevelAtDistance, distance, homePose, midpoint, selectionPoint, useNavigationStore,
} from './navigation'

export interface NavigationControllerProps {
  sceneModel: SceneModel
  /** The current normalized trace event. Only major events can move Guided Follow. */
  event?: TraceEvent | null
  /** Optional explicit target for a major event when it is not directly named by the event. */
  activeEntityId?: string | null
  homeTarget?: Vec3
  reducedMotion?: boolean
}

type Controls = ComponentRef<typeof OrbitControls>
type Move = { from: CameraPose; to: CameraPose; elapsedMs: number; durationMs: number }
type Gesture = { start: CameraPose; moved: boolean }

function readPose(position: Vector3, target: Vector3): CameraPose {
  return {
    position: [position.x, position.y, position.z],
    target: [target.x, target.y, target.z],
  }
}

function targetForEvent(event: TraceEvent, activeEntityId?: string | null): string | null {
  if (activeEntityId) return activeEntityId
  switch (event.type) {
    case 'ENTER_METHOD':
    case 'EXIT_METHOD':
    case 'LINE_EXECUTE':
    case 'DECLARE_LOCAL':
    case 'ASSIGN_LOCAL':
      return event.frameId
    case 'ALLOCATE_OBJECT':
    case 'SET_FIELD':
      return event.objectId
    case 'CREATE_REFERENCE':
      return event.targetObjectId
    default:
      return null
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Must be mounted inside Canvas. Camera changes are centralized and user input always interrupts them. */
export function NavigationController({ sceneModel, event, activeEntityId, homeTarget, reducedMotion }: NavigationControllerProps) {
  const { camera, size, invalidate } = useThree()
  const controlsRef = useRef<Controls>(null)
  const moveRef = useRef<Move | null>(null)
  const guidedEventRef = useRef<string | null>(null)
  const processedIntentRef = useRef(-1)
  const gestureRef = useRef<Gesture | null>(null)
  const preferredReducedMotion = usePrefersReducedMotion()
  const motionReduced = reducedMotion ?? preferredReducedMotion
  const intentRevision = useNavigationStore((state) => state.intentRevision)
  const followEnabled = useNavigationStore((state) => state.followEnabled)
  const world = useMemo(() => ({
    anchors: Object.fromEntries([
      ...sceneModel.frames.map((node) => [node.id, node.anchor] as const),
      ...sceneModel.objects.map((node) => [node.id, node.anchor] as const),
    ]),
    references: sceneModel.references,
    homeTarget,
  }), [sceneModel, homeTarget])

  const currentPose = () => {
    const controls = controlsRef.current
    return controls ? readPose(camera.position, controls.target) : useNavigationStore.getState().pose
  }

  const updateDetail = () => {
    const controls = controlsRef.current
    if (!controls) return
    const store = useNavigationStore.getState()
    const next = detailLevelAtDistance(camera.position.distanceTo(controls.target), store.detailLevel)
    if (next !== store.detailLevel) store.setDetailLevel(next)
  }

  const applyPose = (pose: CameraPose) => {
    const controls = controlsRef.current
    if (!controls) return
    camera.position.set(...pose.position)
    controls.target.set(...pose.target)
    controls.update()
    updateDetail()
    invalidate()
  }

  const startMove = (to: CameraPose, durationMs: number) => {
    const from = currentPose()
    if (motionReduced || durationMs <= 0) {
      moveRef.current = null
      applyPose(to)
      useNavigationStore.getState().setPose(to)
      return
    }
    moveRef.current = { from, to, elapsedMs: 0, durationMs }
    invalidate()
  }

  const framePoint = (point: Vec3, extent: Vec3, minimumDistance = 3.2): CameraPose => {
    const pose = currentPose()
    const direction = new Vector3(
      pose.position[0] - pose.target[0],
      pose.position[1] - pose.target[1],
      pose.position[2] - pose.target[2],
    ).normalize()
    if (direction.lengthSq() === 0) direction.set(0.35, 0.25, 1).normalize()
    const perspective = camera instanceof PerspectiveCamera ? camera : null
    const verticalFov = perspective ? (perspective.fov * Math.PI) / 180 : Math.PI / 4
    const aspect = size.width / Math.max(size.height, 1)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect)
    const fit = Math.max(
      extent[0] / (2 * Math.tan(horizontalFov / 2)),
      extent[1] / (2 * Math.tan(verticalFov / 2)),
      extent[2],
    ) * 1.45
    const range = Math.max(minimumDistance, fit)
    return {
      target: point,
      position: [point[0] + direction.x * range, point[1] + direction.y * range, point[2] + direction.z * range],
    }
  }

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const store = useNavigationStore.getState()
    const initialPose = store.mode === 'HOME' ? homePose(world.homeTarget) : store.pose
    applyPose(initialPose)
    store.setPose(initialPose)
    // Initial camera placement only; later moves are driven by intents and events.
  }, [])

  useEffect(() => {
    const move = moveRef.current
    if (!motionReduced || !move) return
    moveRef.current = null
    applyPose(move.to)
    useNavigationStore.getState().setPose(move.to)
  }, [motionReduced])

  useEffect(() => {
    const store = useNavigationStore.getState()
    const intent = store.intent
    if (!intent || !controlsRef.current) return
    if (processedIntentRef.current === intentRevision) return
    if (intent.kind === 'home') {
      startMove(homePose(world.homeTarget), motionMs.deliberate)
    } else if (intent.kind === 'focus') {
      const anchor = selectionPoint(intent.selection, world)
      if (!anchor) return
      store.rememberPrevious(currentPose(), store.previousMode ?? 'HOME')
      startMove(framePoint(anchor.position, anchor.size), motionMs.deliberate)
    } else if (intent.kind === 'tracePath') {
      const edge = world.references.find((reference) => reference.id === intent.referenceId)
      if (!edge) return
      store.rememberPrevious(currentPose(), store.previousMode ?? 'HOME')
      const length = distance(edge.from, edge.to)
      startMove(framePoint(midpoint(edge.from, edge.to), [length, length, length], 5), motionMs.cinematic)
    } else if (intent.kind === 'returnToPrevious') {
      guidedEventRef.current = event?.eventId ?? null
      startMove(store.previousPose ?? homePose(world.homeTarget), motionMs.deliberate)
    } else if (intent.kind === 'followExecution') {
      guidedEventRef.current = null
    }
    processedIntentRef.current = intentRevision
    // The revision marks a new toolbar command; world changes also retry unresolved targets.
  }, [intentRevision, world])

  useEffect(() => {
    if (!followEnabled || !event || event.importance !== 'major') return
    if (guidedEventRef.current === event.eventId) return
    const id = targetForEvent(event, activeEntityId)
    const anchor = id ? world.anchors[id] : null
    if (!anchor) return
    guidedEventRef.current = event.eventId
    startMove(framePoint(anchor.position, anchor.size, 6), motionMs.standard)
    // A major event may arrive with its anchor on a later scene-model render.
  }, [event?.eventId, event?.importance, activeEntityId, followEnabled, world])

  useFrame((_, delta) => {
    const move = moveRef.current
    if (!move || !controlsRef.current) return
    move.elapsedMs += delta * 1000
    const t = Math.min(1, move.elapsedMs / move.durationMs)
    const eased = 1 - Math.pow(1 - t, 3)
    const lerp = (a: Vec3, b: Vec3): Vec3 => [
      a[0] + (b[0] - a[0]) * eased,
      a[1] + (b[1] - a[1]) * eased,
      a[2] + (b[2] - a[2]) * eased,
    ]
    applyPose({ position: lerp(move.from.position, move.to.position), target: lerp(move.from.target, move.to.target) })
    if (t === 1) {
      moveRef.current = null
      useNavigationStore.getState().setPose(move.to)
    }
  })

  const onUserStart = () => {
    moveRef.current = null
    const pose = currentPose()
    useNavigationStore.getState().setPose(pose)
    gestureRef.current = { start: pose, moved: false }
  }

  const onControlsChange = () => {
    updateDetail()
    const gesture = gestureRef.current
    if (!gesture || gesture.moved) return
    const pose = currentPose()
    if (distance(pose.position, gesture.start.position) + distance(pose.target, gesture.start.target) < 0.001) return
    gesture.moved = true
    useNavigationStore.getState().freeExplore(pose)
  }

  const onUserEnd = () => {
    if (gestureRef.current?.moved) useNavigationStore.getState().setPose(currentPose())
    gestureRef.current = null
  }

  return <OrbitControls
    ref={controlsRef}
    makeDefault
    enableRotate
    enablePan
    enableZoom
    enableDamping={false}
    minDistance={1.7}
    maxDistance={90}
    minPolarAngle={0.08}
    maxPolarAngle={Math.PI * 0.9}
    onStart={onUserStart}
    onEnd={onUserEnd}
    onChange={onControlsChange}
  />
}
