import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneModel, Vec3 } from '../contracts/world'
import { motionMs } from '../theme/tokens'
import { contextPose, guidedCameraAction, inspectorFocusPose, responsiveHomePose, sampleCameraMove, traceWaypoints } from './cameraMotion'
import type { CameraMove, CameraWaypoint } from './cameraMotion'
import { cameraBounds, cameraCollisionBoxes, collisionSafeRoute, constrainCameraPose, zoomPose } from './cameraConstraints'
import {
  detailLevelAtDistance, midpoint, selectionPoint, useNavigationStore,
} from './navigation'

export interface NavigationControllerProps {
  sceneModel: SceneModel
  /** Hidden renderers consume commands without changing the shared navigation pose. */
  visible?: boolean
  /** Major events reframe Guided Follow; PROGRAM_END settles at Home while follow is enabled. */
  event?: TraceEvent | null
  /** Optional explicit target for a major event when it is not directly named by the event. */
  activeEntityId?: string | null
  homeTarget?: Vec3
  reducedMotion?: boolean
}

type Controls = ComponentRef<typeof OrbitControls>

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
export function NavigationController({ sceneModel, event, activeEntityId, homeTarget, reducedMotion, visible = true }: NavigationControllerProps) {
  const { camera, size, invalidate } = useThree()
  const controlsRef = useRef<Controls>(null)
  const initiallyPlacedRef = useRef(false)
  const moveRef = useRef<CameraMove | null>(null)
  const guidedEventRef = useRef<string | null>(null)
  const processedIntentRef = useRef(-1)
  const userInteractingRef = useRef(false)
  const applyingPoseRef = useRef(false)
  const lastSafePoseRef = useRef<CameraPose | null>(null)
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

  const collisionBoxes = useMemo(() => cameraCollisionBoxes(Object.values(world.anchors),
    camera.near, camera instanceof PerspectiveCamera ? camera.getEffectiveFOV() * Math.PI / 180 : Math.PI / 4,
    size.width / Math.max(size.height, 1)), [world.anchors, camera, size.width, size.height])

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

  const applyPose = (pose: CameraPose, sweep = true) => {
    const controls = controlsRef.current
    if (!controls) return
    const safe = constrainCameraPose(pose, sweep ? lastSafePoseRef.current ?? pose : pose, collisionBoxes, world.homeTarget)
    applyingPoseRef.current = true
    camera.position.set(...safe.position)
    controls.target.set(...safe.target)
    controls.update()
    // OrbitControls may apply angular limits during update; constrain its result too.
    const finalPose = constrainCameraPose(currentPose(), sweep ? lastSafePoseRef.current ?? safe : safe,
      collisionBoxes, world.homeTarget)
    camera.position.set(...finalPose.position)
    controls.target.set(...finalPose.target)
    camera.lookAt(controls.target)
    applyingPoseRef.current = false
    lastSafePoseRef.current = finalPose
    updateDetail()
    invalidate()
    return lastSafePoseRef.current
  }

  const startSequence = (waypoints: readonly CameraWaypoint[]) => {
    const from = currentPose()
    const routed: CameraWaypoint[] = []
    let prior = from
    for (const waypoint of waypoints) {
      // Bound endpoints before routing; no swept test until the route is sampled.
      const destination = constrainCameraPose(waypoint.pose, waypoint.pose, collisionBoxes, world.homeTarget)
      const route = collisionSafeRoute(prior, destination, collisionBoxes)
      for (const pose of route) routed.push({ pose, durationMs: waypoint.durationMs / route.length })
      prior = destination
    }
    const to = routed[routed.length - 1].pose
    if (motionReduced) {
      moveRef.current = null
      const applied = applyPose(to, false)
      if (applied) useNavigationStore.getState().setPose(applied)
      return
    }
    moveRef.current = { from, to, elapsedMs: 0, waypoints: routed, revision: useNavigationStore.getState().intentRevision }
    invalidate()
  }

  const startMove = (to: CameraPose, durationMs: number) => startSequence([{ pose: to, durationMs }])

  const viewFraming = () => ({
    verticalFov: camera instanceof PerspectiveCamera ? camera.getEffectiveFOV() * Math.PI / 180 : Math.PI / 4,
    aspect: size.width / Math.max(size.height, 1),
  })

  const overviewPose = () => responsiveHomePose(world.homeTarget, size.width / Math.max(size.height, 1))

  useEffect(() => {
    if (!visible || initiallyPlacedRef.current) return
    const controls = controlsRef.current
    if (!controls) return
    initiallyPlacedRef.current = true
    const store = useNavigationStore.getState()
    const initialPose = store.mode === 'HOME' ? overviewPose() : store.pose
    const applied = applyPose(initialPose)
    if (applied) store.setPose(applied)
    // Initial camera placement only; later moves are driven by intents and events.
  }, [visible])

  useEffect(() => {
    if (!visible) return
    if (useNavigationStore.getState().mode === 'HOME') startMove(overviewPose(), motionMs.standard)
  }, [size.width, size.height, visible])

  useEffect(() => {
    if (!visible) return
    const move = moveRef.current
    if (!motionReduced || !move) return
    moveRef.current = null
    if (move.revision !== useNavigationStore.getState().intentRevision) return
    const applied = applyPose(move.to, false)
    if (applied) useNavigationStore.getState().setPose(applied)
  }, [motionReduced, visible])

  useEffect(() => {
    const store = useNavigationStore.getState()
    if (!visible) {
      moveRef.current = null
      processedIntentRef.current = intentRevision
      guidedEventRef.current = event?.eventId ?? null
      return
    }
    const intent = store.intent
    if (!intent || !controlsRef.current) return
    if (processedIntentRef.current === intentRevision) return
    if (intent.kind === 'home' || intent.kind === 'resetView') {
      startMove(overviewPose(), motionMs.deliberate)
    } else if (intent.kind === 'zoom') {
      startMove(zoomPose(currentPose(), intent.direction), motionMs.quick)
    } else if (intent.kind === 'focus') {
      const anchor = selectionPoint(intent.selection, world)
      if (!anchor) return
      store.rememberPrevious(currentPose(), store.previousMode ?? 'HOME')
      const pose = currentPose()
      const cameraRight = new Vector3(0, 1, 0).cross(
        new Vector3(...pose.position).sub(new Vector3(...pose.target)),
      ).normalize()
      const center = midpoint(overviewPose().target, anchor.position)
      const pivot: Vec3 = [center[0] - cameraRight.x, center[1] - cameraRight.y, center[2] - cameraRight.z]
      startMove(inspectorFocusPose(pivot, anchor.size, currentPose(), [], viewFraming(), {
        width: size.width, height: size.height,
      }, anchor.position), motionMs.deliberate)
    } else if (intent.kind === 'tracePath') {
      const edge = world.references.find((reference) => reference.id === intent.referenceId)
      if (!edge) return
      store.rememberPrevious(currentPose(), store.previousMode ?? 'HOME')
      startSequence(traceWaypoints(edge, currentPose(), world.anchors, viewFraming(), size))
    } else if (intent.kind === 'returnToPrevious') {
      guidedEventRef.current = event?.eventId ?? null
      startMove(store.previousPose ?? overviewPose(), motionMs.deliberate)
    } else if (intent.kind === 'followExecution') {
      guidedEventRef.current = null
    }
    processedIntentRef.current = intentRevision
    // The revision marks a new toolbar command; world changes also retry unresolved targets.
  }, [intentRevision, world, visible])

  useEffect(() => {
    if (!visible) {
      guidedEventRef.current = event?.eventId ?? null
      return
    }
    const action = guidedCameraAction(event, useNavigationStore.getState().followEnabled)
    if (!action || !event || userInteractingRef.current) return
    if (guidedEventRef.current === event.eventId) return
    if (action === 'home') {
      guidedEventRef.current = event.eventId
      startMove(overviewPose(), motionMs.deliberate)
      return
    }
    const id = targetForEvent(event, activeEntityId)
    const anchor = id ? world.anchors[id] : null
    if (!anchor) return
    guidedEventRef.current = event.eventId
    const overview = overviewPose()
    // Bias attention toward the event without replacing the world overview with a close-up.
    const pivot = midpoint(overview.target, anchor.position)
    startMove(contextPose(pivot, currentPose(), Object.values(world.anchors),
      world.references.flatMap((edge) => [edge.from, edge.to]), viewFraming()), motionMs.standard)
    // A major event may arrive with its anchor on a later scene-model render.
  }, [event?.eventId, event?.importance, activeEntityId, followEnabled, world, visible])

  useFrame((_, delta) => {
    if (!visible) return
    const move = moveRef.current
    if (!move || !controlsRef.current) return
    if (move.revision !== useNavigationStore.getState().intentRevision) {
      moveRef.current = null
      return
    }
    move.elapsedMs += delta * 1000
    const sample = sampleCameraMove(move)
    const applied = applyPose(sample.pose)
    if (sample.done) {
      moveRef.current = null
      if (applied) useNavigationStore.getState().setPose(applied)
    }
  })

  const onUserStart = () => {
    if (!visible) return
    moveRef.current = null
    const pose = currentPose()
    useNavigationStore.getState().freeExplore(pose)
    userInteractingRef.current = true
  }

  const onControlsChange = () => {
    if (!visible || applyingPoseRef.current || moveRef.current) return
    applyPose(currentPose())
  }

  useEffect(() => {
    if (!visible) return
    // Allocation during free exploration can enclose the eye: recover immediately.
    const applied = applyPose(currentPose())
    if (applied) useNavigationStore.getState().setPose(applied)
  }, [collisionBoxes, visible])

  const onUserEnd = () => {
    if (!visible) return
    useNavigationStore.getState().setPose(currentPose())
    userInteractingRef.current = false
  }

  return <OrbitControls
    ref={controlsRef}
    makeDefault
    enabled={visible}
    enableRotate
    enablePan
    enableZoom
    enableDamping={false}
    minDistance={cameraBounds.minDistance}
    maxDistance={cameraBounds.maxDistance}
    rotateSpeed={0.55}
    minPolarAngle={0.72}
    maxPolarAngle={1.52}
    onStart={onUserStart}
    onEnd={onUserEnd}
    onChange={onControlsChange}
  />
}
