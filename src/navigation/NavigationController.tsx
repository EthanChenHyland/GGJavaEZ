import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import type { CameraPose, Selection } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneModel, Vec3 } from '../contracts/world'
import { sceneSourceId } from '../contracts/world'
import { motionMs } from '../theme/tokens'
import { arrayInspectionContext, contextPose, eventFocusAnchor, frontFacePoint, frontFaceViewingPose, guidedCameraAction, inspectorFocusPose, invocationContextPose, representationTransition, sampleCameraMove, sceneHomePose, traceWaypoints } from './cameraMotion'
import type { CameraMove, CameraWaypoint, RepresentationMemory } from './cameraMotion'
import { cameraCollisionBoxes, collisionSafeRoute, constrainCameraPose, limitsForOverview, zoomPose } from './cameraConstraints'
import { spatial2DetailExtent, spatial2DetailLevel, spatial2FocusPose, spatial2HomePose, spatial2Viewport } from './cameraSpatial2'
import {
  collisionAnchorsForScene, detailDistanceForScene, detailLevelAtDistance, midpoint, navigationWorldForScene, selectionPoint, useNavigationStore,
} from './navigation'

export interface NavigationControllerProps {
  sceneModel: SceneModel
  geometryScene?: SceneModel
  /** Renderer-supplied cluster/protected-volume bounds used by Home. */
  homeScene?: SceneModel
  fitShallow?: boolean
  inspectorVisible?: boolean
  /** Hidden renderers consume commands without changing the shared navigation pose. */
  visible?: boolean
  /** Major events reframe Guided Follow; PROGRAM_END fits the retained world while follow is enabled. */
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
export function NavigationController({ sceneModel, geometryScene = sceneModel, homeScene = sceneModel, event, activeEntityId, homeTarget, fitShallow = false, inspectorVisible = false, reducedMotion, visible = true }: NavigationControllerProps) {
  const { camera, size, invalidate } = useThree()
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.far = Math.max(100, ...(sceneModel.bounds?.size ?? [32])) * 12
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, sceneModel.bounds, invalidate])
  const controlsRef = useRef<Controls>(null)
  const initiallyPlacedRef = useRef(false)
  const moveRef = useRef<CameraMove | null>(null)
  const guidedEventRef = useRef<string | null>(null)
  const processedIntentRef = useRef(-1)
  const userInteractingRef = useRef(false)
  const applyingPoseRef = useRef(false)
  const automaticPoseKeyRef = useRef<string | null>(null)
  const firstInvocationFramedRef = useRef(false)
  const lastSafePoseRef = useRef<CameraPose | null>(null)
  const representationMemoryRef = useRef<RepresentationMemory>({ presentation: 'spatial', spatialPose: null })
  const preferredReducedMotion = usePrefersReducedMotion()
  const motionReduced = reducedMotion ?? preferredReducedMotion
  const intentRevision = useNavigationStore((state) => state.intentRevision)
  const followEnabled = useNavigationStore((state) => state.followEnabled)
  const spatial2 = sceneModel.layoutKind === 'spatial2'
  const deepStack = (sceneModel.stackDepth ?? 0) > 1 && !!sceneModel.bounds
  const reservedWorld = spatial2 || deepStack || (fitShallow && !!sceneModel.bounds) || ((sceneModel.layoutKind === 'array' || sceneModel.layoutKind === 'scoped') && !!sceneModel.bounds)
  const framing = {
    verticalFov: camera instanceof PerspectiveCamera ? camera.getEffectiveFOV() * Math.PI / 180 : Math.PI / 4,
    aspect: size.width / Math.max(size.height, 1),
  }
  const fittedOverview = useMemo(() => spatial2
    ? spatial2HomePose(homeScene.bounds, framing, spatial2Viewport(size.width, size.height, inspectorVisible))
    : sceneHomePose({
    bounds: homeScene.bounds, stackDepth: homeScene.stackDepth, layoutKind: sceneModel.layoutKind,
  }, homeTarget, framing, fitShallow), [homeScene.bounds, homeScene.stackDepth, sceneModel.layoutKind, homeTarget, framing.verticalFov, framing.aspect, fitShallow, spatial2, size.width, size.height, inspectorVisible])
  // The embedded inspector occupies the lower world shelf. Translate the
  // overview together with its orbit target, keeping the recorded XYZ anchors
  // fixed while placing the whole scene above the shelf.
  const shelfBias = !spatial2 && inspectorVisible && fitShallow ? Math.min(1.5, Math.max(0.4, size.height * 0.0024)) : 0
  const shelfScale = !spatial2 && inspectorVisible && fitShallow ? 1.08 : 1
  const canonicalOverview: CameraPose = shelfBias ? {
    position: [0, 1, 2].map((axis) => fittedOverview.target[axis]
      + (fittedOverview.position[axis] - fittedOverview.target[axis]) * shelfScale
      - (axis === 1 ? shelfBias : 0)) as unknown as Vec3,
    target: [fittedOverview.target[0], fittedOverview.target[1] - shelfBias, fittedOverview.target[2]],
  } : fittedOverview
  // Exploration remains available beyond a collapsed Home landscape. Collision
  // uses only represented solids; the full catalog is never a hidden obstacle.
  const limits = limitsForOverview(canonicalOverview, reservedWorld ? sceneModel.bounds?.size : undefined)
  const world = useMemo(() => navigationWorldForScene(geometryScene, spatial2 ? homeScene.bounds?.center : homeTarget),
    [geometryScene, spatial2, homeScene.bounds?.center, homeTarget])
  // LOD changes the represented population. Its median must not feed back into
  // the next LOD decision; only a new runtime catalog can change this scale.
  const detailExtent = useMemo(() => spatial2DetailExtent(sceneModel), [sceneModel.frames, sceneModel.objects, sceneModel.classes])

  const collisionBoxes = useMemo(() => cameraCollisionBoxes(collisionAnchorsForScene(geometryScene),
    camera.near, camera instanceof PerspectiveCamera ? camera.getEffectiveFOV() * Math.PI / 180 : Math.PI / 4,
    size.width / Math.max(size.height, 1)), [geometryScene, camera, size.width, size.height])

  const currentPose = () => {
    const controls = controlsRef.current
    return controls ? readPose(camera.position, controls.target) : useNavigationStore.getState().pose
  }

  const updateDetail = () => {
    const controls = controlsRef.current
    if (!controls) return
    const store = useNavigationStore.getState()
    const subject = store.isolatedSelection && selectionPoint(store.isolatedSelection, world)
    const next = spatial2
      ? spatial2DetailLevel(subject ? camera.position.distanceTo(new Vector3(...subject.position)) : camera.position.distanceTo(controls.target),
        subject ? Math.min(subject.size[1], 4) : detailExtent, framing, store.detailLevel)
      : detailLevelAtDistance(detailDistanceForScene(camera.position.distanceTo(controls.target), canonicalOverview, sceneModel), store.detailLevel)
    if (next !== store.detailLevel) store.setDetailLevel(next)
  }

  const applyPose = (pose: CameraPose, sweep = true) => {
    const controls = controlsRef.current
    if (!controls) return
    const safe = constrainCameraPose(pose, sweep ? lastSafePoseRef.current ?? pose : pose, collisionBoxes, world.homeTarget, limits)
    applyingPoseRef.current = true
    camera.position.set(...safe.position)
    controls.target.set(...safe.target)
    controls.update()
    // OrbitControls may apply angular limits during update; constrain its result too.
    const finalPose = constrainCameraPose(currentPose(), sweep ? lastSafePoseRef.current ?? safe : safe,
      collisionBoxes, world.homeTarget, limits)
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
    if (userInteractingRef.current || !waypoints.length) return
    const from = currentPose()
    const routed: CameraWaypoint[] = []
    let prior = from
    for (const waypoint of waypoints) {
      // Bound endpoints before routing; no swept test until the route is sampled.
      const destination = constrainCameraPose(waypoint.pose, waypoint.pose, collisionBoxes, world.homeTarget, limits)
      const route = collisionSafeRoute(prior, destination, collisionBoxes, world.homeTarget, limits)
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

  const overviewPose = () => canonicalOverview
  const focusViewport = () => spatial2 ? spatial2Viewport(size.width, size.height, inspectorVisible)
    : { width: size.width, height: size.height, topInset: 80, bottomInset: inspectorVisible ? 124 : 24 }
  const focusPose = (selection: NonNullable<Selection>, anchor: { position: Vec3; size: Vec3 }) => {
    if (spatial2) return spatial2FocusPose(selection, anchor, geometryScene, viewFraming(), focusViewport())
    const face = frontFacePoint(anchor)
    const pivot = reservedWorld ? face : midpoint(overviewPose().target, face)
    const context = arrayInspectionContext(selection, sceneModel)
    if (sceneModel.layoutKind === 'scoped' && selection.kind === 'slot') {
      const owner = sceneModel.frames.find(frame => frame.slots.some(slot => slot.id === selection.id))
      if (owner) context.push(owner.anchor)
    }
    return inspectorFocusPose(pivot, anchor.size, frontFaceViewingPose(face), context, viewFraming(), focusViewport(), face, 5.8, [0.5, 0.8, 0.3])
  }

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
    const store = useNavigationStore.getState()
    const firstInvocation = spatial2 && !firstInvocationFramedRef.current && sceneModel.frames.length > 0
    if (firstInvocation && (store.mode === 'HOME' || store.mode === 'GUIDED_FOLLOW')) {
      firstInvocationFramedRef.current = true
      const first=sceneModel.frames.find(frame=>frame.active) ?? sceneModel.frames[0]
      const destination=store.mode === 'GUIDED_FOLLOW'
        ? spatial2FocusPose({kind:'frame',id:first.id},first.anchor,geometryScene,viewFraming(),focusViewport())
        : overviewPose()
      startMove(destination, motionMs.standard)
      automaticPoseKeyRef.current = `home:${size.width}:${size.height}:${visible}:${inspectorVisible}`
      return
    }
    if (store.mode === 'HOME') {
      const key = `home:${size.width}:${size.height}:${visible}:${inspectorVisible}`
      // World growth/array allocation is not an implicit Home command.
      if (!spatial2 || automaticPoseKeyRef.current !== key) startMove(overviewPose(), motionMs.standard)
      automaticPoseKeyRef.current = key
    }
    else if (store.mode === 'FOCUS_ENTITY' && store.isolatedSelection && !userInteractingRef.current) {
      const anchor = selectionPoint(store.isolatedSelection, world)
      if (!anchor) {
        moveRef.current = null
        automaticPoseKeyRef.current = null
        return
      }
      const key = JSON.stringify([store.isolatedSelection, anchor.position, anchor.size, size.width, size.height, inspectorVisible])
      if (!spatial2 || automaticPoseKeyRef.current !== key) startMove(focusPose(store.isolatedSelection, anchor), motionMs.standard)
      automaticPoseKeyRef.current = key
    }
  }, [size.width, size.height, visible, homeTarget, sceneModel.bounds, sceneModel.stackDepth, sceneModel.layoutKind, fitShallow, inspectorVisible, world])

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
    if (intent.kind === 'representation') {
      // App projection may reach this controller one render after the intent.
      if ((sceneModel.presentation ?? 'spatial') !== intent.presentation) return
      const transition = representationTransition(intent.presentation, representationMemoryRef.current,
        currentPose(), sceneModel, world.homeTarget, viewFraming())
      representationMemoryRef.current = transition.memory
      guidedEventRef.current = event?.eventId ?? null
      if (transition.pose) startMove(transition.pose, motionMs.cinematic)
    } else if (intent.kind === 'home' || intent.kind === 'resetView') {
      startMove(overviewPose(), motionMs.deliberate)
    } else if (intent.kind === 'zoom') {
      startMove(zoomPose(currentPose(), intent.direction, limits), motionMs.quick)
    } else if (intent.kind === 'focus') {
      const anchor = selectionPoint(intent.selection, world)
      if (!anchor) return
      store.rememberPrevious(currentPose(), store.previousMode ?? 'HOME')
      startMove(focusPose(intent.selection, anchor), motionMs.deliberate)
      automaticPoseKeyRef.current = JSON.stringify([intent.selection, anchor.position, anchor.size, size.width, size.height, inspectorVisible])
    } else if (intent.kind === 'tracePath') {
      const edge = world.references.find((reference) => reference.id === intent.referenceId)
      if (!edge) return
      if (spatial2 && (!world.anchors[sceneSourceId(edge.source)] || !world.anchors[edge.targetObjectId])) return
      store.rememberPrevious(currentPose(), store.previousMode ?? 'HOME')
      startSequence(traceWaypoints(edge, currentPose(), world.anchors, viewFraming(), spatial2 ? focusViewport() : size))
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
    const action = guidedCameraAction(event, useNavigationStore.getState().followEnabled, sceneModel.layoutKind)
    if (!action || !event || userInteractingRef.current) return
    if (guidedEventRef.current === event.eventId) return
    if (action === 'home') {
      guidedEventRef.current = event.eventId
      startMove(overviewPose(), motionMs.deliberate)
      return
    }
    const anchor = eventFocusAnchor(event, geometryScene, activeEntityId)
    if (!anchor) return
    guidedEventRef.current = event.eventId
    const overview = overviewPose()
    // Bias attention toward the event without replacing the world overview with a close-up.
    const pivot = midpoint(overview.target, anchor.position)
    startMove(spatial2 ? spatial2FocusPose({ kind: anchor.region === 'class' ? 'class' : anchor.region === 'stack' ? 'frame' : 'object', id: anchor.entityId }, anchor, geometryScene, viewFraming(), focusViewport())
      : deepStack ? invocationContextPose(anchor, sceneModel, currentPose(), viewFraming())
      : contextPose(pivot, currentPose(), Object.values(world.anchors),
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
    minDistance={limits.minDistance}
    maxDistance={limits.maxDistance}
    rotateSpeed={0.55}
    minPolarAngle={0.72}
    maxPolarAngle={1.52}
    onStart={onUserStart}
    onEnd={onUserEnd}
    onChange={onControlsChange}
  />
}
