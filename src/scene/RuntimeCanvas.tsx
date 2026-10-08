import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Line, Text } from '@react-three/drei'
import type { Selection } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import { sceneSourceId, type LayoutState, type SceneModel, type Vec3, type WorldAnchor } from '../contracts/world'
import { Object3D } from 'three'
import type { FlowEndpoint, SemanticTransition } from '../motion/semanticTransition'
import { NavigationController, navigationActions, useNavigationStore } from '../navigation'
import { ArraySolid } from './primitives/ArraySolid'
import { ClassSolid } from './primitives/ClassSolid'
import { RendererMetrics } from './RendererMetrics'
import { FrameProfiler } from './FrameProfiler'
import { ConnectorCaptionLayer } from './primitives/ConnectorCaptions'
import { RuntimeFaceLabels } from './primitives/RuntimeLabel'
import { WorldOverviewLabels } from './primitives/WorldOverviewLabels'
import { ClusterSolid, IdentitySolid } from './primitives/ClusterSolid'
import { ReturnFlow } from './primitives/ReturnFlow'
import { FrameSolid, ObjectSolid, ReferenceCurve } from './primitives'
import { HistoricalFlow, IoEndpoint, SemanticFlowMotion } from './primitives/SemanticFlow'
import { colors, renderQuality, runtimeFont, worldMaterial, worldUnits } from '../theme/tokens'
import { callEdgesForScene, connectorBackPlane } from '../world/callStructure'
import { ArchiveSolids } from './primitives/ArchiveSolids'
import { arrayHeaderAnchor } from '../world/arrayGeometry'
import { planSpatialPresentation, presentationBounds, spatialBudgets, type FlowDisplay } from '../world/spatialPresentation'

interface RuntimeCanvasProps {
  visible: boolean
  fitShallow?: boolean
  guided: boolean
  playing: boolean
  quality: keyof typeof renderQuality
  scene: SceneModel
  layout: LayoutState
  event: TraceEvent | null
  transition?: SemanticTransition | null
  flowHistory?: readonly SemanticTransition[]
  flowDisplay?: FlowDisplay
  selection: Selection
  onSelect: (selection: NonNullable<Selection>) => void
  selectedFlowId?: string | null
  onSelectFlow?: (id: string) => void
  inspectorVisible?: boolean
  onFocusSelected: (selection: NonNullable<Selection>) => void
}

function isRelated(selection: Selection, entityId: string, scene: SceneModel): boolean {
  if (!selection) return false
  if (selection.kind === 'object' || selection.kind === 'frame' || selection.kind === 'class') return scene.references.some((edge) =>
    edge.targetObjectId === selection.id && sceneSourceId(edge.source) === entityId || sceneSourceId(edge.source) === selection.id && edge.targetObjectId === entityId)
  if (selection.kind === 'reference') {
    const edge = scene.references.find((item) => item.id === selection.id)
    return edge?.targetObjectId === entityId || Boolean(edge && sceneSourceId(edge.source) === entityId)
  }
  return false
}

function headingPosition(anchors: readonly WorldAnchor[]): Vec3 | null {
  const bounds = presentationBounds(anchors, false)
  return bounds ? [bounds.center[0] - bounds.size[0] / 2, bounds.center[1] + bounds.size[1] / 2 + 0.65, bounds.center[2]] : null
}

function MutationCue({ scene, event }: { scene: SceneModel; event: TraceEvent | null }) {
  if (event?.type !== 'SET_FIELD') return null
  const object = scene.objects.find((node) => node.id === event.objectId)
  if (!object) return null
  const field = object.fields.find((item) => item.id === event.slotId)
  if (!field) return null
  const [x, y, z] = object.anchor.position
  return <Text font={runtimeFont}
    position={[x, y + object.anchor.size[1] / 2 + 0.82, z + 0.45]}
    fontSize={0.25}
    color={colors.mutation}
    anchorX="center"
    anchorY="middle"
    outlineWidth={0.007}
    outlineColor={colors.canvas}
  >
    {event.label}
  </Text>
}

export function RuntimeCanvas({ visible, fitShallow = false, guided, playing, quality, scene: fullScene, layout, event, transition, flowHistory = [], flowDisplay = 'relevant', selection, selectedFlowId, onSelectFlow, inspectorVisible = false, onSelect, onFocusSelected }: RuntimeCanvasProps) {
  const isolatedSelection = useNavigationStore(state => state.isolatedSelection)
  const detailLevel = useNavigationStore(state => state.detailLevel)
  const viewRevision = useNavigationStore(state => state.viewRevision)
  const intentRevision = useNavigationStore(state => state.intentRevision)
  // Read the camera snapshot only when presentation inputs/LOD change; never
  // subscribe React to continuously changing orbit poses.
  const plan = useMemo(() => planSpatialPresentation(fullScene, selection ?? isolatedSelection, {
    detailLevel, event, transition, flowHistory, flowDisplay, selectedFlowId,
    viewTarget: useNavigationStore.getState().pose.target, focus: Boolean(isolatedSelection),
    viewPosition: useNavigationStore.getState().pose.position,
  }), [fullScene, selection, isolatedSelection, detailLevel, intentRevision, viewRevision, event, transition, flowHistory, flowDisplay, selectedFlowId])
  const scene = plan.scene
  const archive = useMemo(() => {
    const clusterBodies = new Set(plan.labelledClusters.filter(cluster => cluster.body).map(cluster => cluster.representative.id))
    const picking = plan.pickableQuiet.filter(node => !clusterBodies.has(node.id))
    const pickedIds = new Set(picking.map(node => node.id))
    const passive = detailLevel === 'macro' ? []
      : plan.quietVolumes.filter(node => !clusterBodies.has(node.id) && !pickedIds.has(node.id))
    return { passive, picking }
  }, [plan, detailLevel])
  const slotNames = useMemo(() => new Map([...scene.frames.flatMap(node => node.slots), ...scene.objects.flatMap(node => node.fields), ...(scene.classes ?? []).flatMap(node => node.fields)].map(slot => [slot.id, slot.name])), [scene])
  const environment = useMemo(() => {
    const anchors = detailLevel === 'macro' ? [...scene.frames, ...scene.objects, ...(scene.classes ?? []), ...plan.labelledClusters.filter(cluster => cluster.body).map(cluster => cluster.representative)].map(node => node.anchor)
      : [...scene.frames, ...scene.objects, ...(scene.classes ?? []), ...plan.quietVolumes, ...plan.labelledClusters.filter(cluster => cluster.body).map(cluster => cluster.representative)].map(node => node.anchor)
    const bounds = presentationBounds([...anchors, ...(scene.io ?? []).map(item => item.anchor)], false) ?? fullScene.bounds
    const center = bounds?.center ?? worldUnits.homeTarget
    const size = bounds?.size ?? [12, 8, 12]
    const range = Math.max(12, ...size)
    const lightTarget = new Object3D()
    lightTarget.position.set(...center)
    return { center, size, range, lightTarget, floorY: center[1] - size[1] / 2 - 0.22,
      stackHeading: headingPosition(plan.homeScene.frames.map(node => node.anchor)),
      heapHeading: headingPosition(plan.homeScene.objects.map(node => node.anchor)),
      classHeading: headingPosition((plan.homeScene.classes ?? []).map(node => node.anchor)) }
  }, [scene, plan, detailLevel, fullScene.bounds])
  const worldRange = Math.max(32, environment.range)
  const [motionCancelled, setMotionCancelled] = useState(false)
  useEffect(() => { setMotionCancelled(false) }, [transition?.id])
  const tier = renderQuality[quality]
  const pointerStart = useRef<{ id: number; x: number; y: number; wasFollowing: boolean } | null>(null)
  const dragged = useRef(false)
  const lastSelected = useRef<NonNullable<Selection> | null>(null)
  const select = (item: NonNullable<Selection>) => {
    if (dragged.current) return
    lastSelected.current = item
    onSelect(item)
  }
  const activeSlotId = !guided ? undefined : event?.type === 'RETURN_VALUE' ? `return:${event.frameId}`
    : transition?.to?.kind === 'slot' ? transition.to.id : event?.type === 'SET_FIELD' || event?.type === 'SET_STATIC' || event?.type === 'ASSIGN_LOCAL' ? event.slotId : event?.type === 'ARRAY_READ' || event?.type === 'INPUT_READ' ? event.destinationSlotId : event?.type === 'DECLARE_LOCAL' ? event.slot.id : undefined
  const scopedWorld = scene.layoutKind === 'scoped'
  const arrayWorld = scene.layoutKind === 'array'
  const origins = Object.assign({}, ...scene.frames.map((node) => node.anchor.ports))
  const deepStack = (scene.stackDepth ?? 0) > 1
  const endpoints = useMemo(() => {
    const positions = new Map<string, Vec3>()
    const stage = scene.presentation === 'theater' && layout.theater ? layout.theater : layout
    for (const node of [...scene.frames, ...scene.objects, ...(scene.classes ?? [])]) {
      const anchor = stage.anchors[node.id] ?? node.anchor
      positions.set(node.id, fullScene.layoutKind === 'spatial2' && node.kind === 'object' && node.array ? arrayHeaderAnchor(anchor).bodyPort : anchor.bodyPort)
      const visibleCells = node.kind === 'object' && node.array ? new Set((plan.cellWindows.get(node.id) ?? []).map(cell => cell.id)) : null
      for (const [id, position] of Object.entries(anchor.ports)) if (!visibleCells || visibleCells.has(id) || node.kind === 'object' && node.fields.some(field => field.id === id)) positions.set(id, position)
      if (node.kind === 'object' && node.array) for (const cell of plan.cellWindows.get(node.id) ?? []) positions.set(cell.id, cell.port)
    }
    return positions
  }, [scene, layout, plan.cellWindows, fullScene.layoutKind])
  const surfaceAnchors = useMemo(() => {
    const result = new Map<string, WorldAnchor>()
    for (const node of [...fullScene.frames, ...fullScene.objects, ...(fullScene.classes ?? [])]) {
      result.set(node.id, node.kind === 'object' && node.array ? arrayHeaderAnchor(node.anchor) : node.anchor)
      for (const id of Object.keys(node.anchor.ports)) result.set(id, node.anchor)
      if (node.kind === 'object') for (const cell of node.array?.cells ?? []) result.set(cell.id, cell.anchor)
    }
    return result
  }, [fullScene])
  const referenceObstacles = useMemo(() => [...scene.frames.map(node => node.anchor), ...(scene.classes ?? []).map(node => node.anchor),
    ...scene.objects.flatMap(node => node.array ? [arrayHeaderAnchor(node.anchor), ...(plan.cellWindows.get(node.id) ?? []).map(cell => cell.anchor)] : [node.anchor])], [scene, plan.cellWindows])
  const surfaceAnchor = (point: FlowEndpoint | undefined) => {
    if (!point) return undefined
    if (point.kind === 'io') return scene.io?.find(item => item.id === point.id)?.anchor
    const body = surfaceAnchors.get(point.id)
    if (body) return body
    if (layout.anchors[point.id]) return layout.anchors[point.id]
    for (const node of [...scene.frames, ...scene.objects, ...(scene.classes ?? [])]) if (node.anchor.ports[point.id]) return node.anchor
    return undefined
  }
  const endpoint = (point: FlowEndpoint | undefined): Vec3 | null => !point ? null : point.kind === 'io'
    ? scene.io?.find(item => item.id === point.id)?.anchor.bodyPort ?? null : endpoints.get(point.id) ?? null
  const motionTo = transition ? endpoint(transition.to) : null
  const motionFrom = transition ? endpoint(transition.from) : null
  const connectorBackZ = connectorBackPlane(scene)
  const callEdges = useMemo(() => callEdgesForScene(scene, connectorBackZ).sort((a, b) =>
    Number(plan.priorityIds.has(b.callerId) || plan.priorityIds.has(b.calleeId)) - Number(plan.priorityIds.has(a.callerId) || plan.priorityIds.has(a.calleeId))).slice(0, spatialBudgets[detailLevel].calls), [scene, connectorBackZ, plan.priorityIds, detailLevel])
  const fullFace = (id: string) => plan.faceIds.has(id)
  return <div className="world-canvas" aria-label="Three-dimensional Java runtime world"
    onPointerDownCapture={(event) => {
      if (pointerStart.current && pointerStart.current.id !== event.pointerId) {
        dragged.current = true
        setMotionCancelled(true)
        if (visible) navigationActions.freeExplore()
      } else {
        pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
          wasFollowing: useNavigationStore.getState().followEnabled }
        dragged.current = false
      }
    }}
    onPointerMoveCapture={(event) => {
      const start = pointerStart.current
      if (start?.id === event.pointerId && !dragged.current && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
        dragged.current = true
        setMotionCancelled(true)
        if (visible) navigationActions.freeExplore()
      }
    }}
    onPointerUpCapture={(event) => {
      const start = pointerStart.current
      if (start?.id !== event.pointerId) return
      const moved = dragged.current || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
      pointerStart.current = null
      if (!moved && visible && start.wasFollowing) navigationActions.followExecution()
    }}
    onPointerCancelCapture={() => { pointerStart.current = null }}
    onWheelCapture={() => { setMotionCancelled(true); if (visible) navigationActions.freeExplore() }}
    onDoubleClick={() => { if (lastSelected.current) onFocusSelected(lastSelected.current) }}>
    {plan.quiet.length > 0 && <div className="world-detail-summary" role="status">{fullScene.frames.length} invocations · {fullScene.objects.length} objects{fullScene.classes?.length ? ` · ${fullScene.classes.length} classes` : ''} · {plan.quiet.length} quiet records · {detailLevel} detail. Select a represented volume to inspect.</div>}
    <Canvas
      shadows={tier.shadows ? "soft" : false}
      frameloop={visible ? "demand" : "never"}
      dpr={[1, tier.dpr]}
      camera={{ position: [...worldUnits.homePosition], fov: 41, near: 0.1, far: worldRange * 12 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      {import.meta.env.DEV && <RendererMetrics plan={plan} />}
      {import.meta.env.DEV && <FrameProfiler />}
      <color attach="background" args={[colors.canvas]} />
      <fog attach="fog" args={[colors.canvas, worldRange * 4, worldRange * 10]} />
      <ambientLight intensity={1.5} color={colors.textSecondary} />
      <hemisphereLight intensity={1.4} color={colors.text} groundColor={colors.panel} />
      <primitive object={environment.lightTarget} />
      <directionalLight position={[environment.center[0] - environment.range * 0.35, environment.center[1] + environment.range * 0.8, environment.center[2] + environment.range * 0.8]} target={environment.lightTarget}
        intensity={2.6} color={colors.text} castShadow={tier.shadows && environment.range < 120} shadow-mapSize={[tier.shadowSize, tier.shadowSize]}
        shadow-camera-left={-environment.range / 2} shadow-camera-right={environment.range / 2} shadow-camera-top={environment.range / 2} shadow-camera-bottom={-environment.range / 2}
        shadow-camera-far={environment.range * 4} shadow-radius={3} />
      {environment.heapHeading && <pointLight position={[environment.heapHeading[0], environment.heapHeading[1] + 1, environment.heapHeading[2] + 3]} intensity={11} distance={Math.min(32, environment.range)} color={colors.heap} />}
      {environment.stackHeading && <pointLight position={[environment.stackHeading[0], environment.stackHeading[1] + 1, environment.stackHeading[2] + 3]} intensity={10} distance={Math.min(32, environment.range)} color={colors.stack} />}
      {!isolatedSelection && <mesh position={[environment.center[0], environment.floorY, environment.center[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[Math.max(12, environment.size[0] + 8), Math.max(12, environment.size[2] + 8)]} />
        <meshStandardMaterial color={worldMaterial.floor} roughness={0.9} metalness={0.05} />
      </mesh>}
      <group>
        <ArchiveSolids nodes={archive.passive} onSelect={select} />
        <ArchiveSolids nodes={archive.picking} onSelect={select} pickable />
        {plan.labelledClusters.map(cluster => <ClusterSolid key={cluster.id} cluster={cluster} onSelect={select} showLabels={detailLevel !== 'macro'} />)}
        {detailLevel === 'macro' && <WorldOverviewLabels scene={scene} clusters={plan.labelledClusters} inspectorVisible={inspectorVisible} onSelect={select} />}
        {environment.stackHeading && !isolatedSelection && detailLevel !== 'macro' && <Text font={runtimeFont} position={[...environment.stackHeading]} fontSize={0.31} color={colors.stack} anchorX="left" anchorY="middle" letterSpacing={0.08}>STACK</Text>}
        {environment.heapHeading && !isolatedSelection && detailLevel !== 'macro' && <Text font={runtimeFont} position={[...environment.heapHeading]} fontSize={0.31} color={colors.heap} anchorX="left" anchorY="middle" letterSpacing={0.08}>HEAP</Text>}
        {environment.classHeading && !isolatedSelection && detailLevel !== 'macro' && <Text font={runtimeFont} position={[...environment.classHeading]} fontSize={0.31} color={colors.textSecondary} anchorX="left" anchorY="middle" letterSpacing={0.08}>CLASS STATE</Text>}
        {callEdges.map((edge) => <Line key={edge.id} points={edge.points} color={colors.stack} lineWidth={1.4} transparent opacity={0.46} />)}
        {scene.returnFlow && scene.frames.length > 0 && (!scopedWorld || event?.type === 'RETURN_VALUE' || event?.type === 'EXIT_METHOD') && <ReturnFlow flow={scene.returnFlow} guided={guided} playing={playing} />}
        <ConnectorCaptionLayer inspectorVisible={inspectorVisible}>
        {scene.references.map((edge) => <ReferenceCurve key={edge.id} edge={edge}
          label={slotNames.get(edge.source.slotId) ?? ''}
          detailLevel={detailLevel}
          sourceAnchor={fullScene.layoutKind === 'spatial2' ? surfaceAnchor({kind:'slot',id:edge.source.slotId}) : undefined}
          targetAnchor={fullScene.layoutKind === 'spatial2' ? surfaceAnchors.get(edge.targetObjectId) : undefined}
          obstacles={fullScene.layoutKind === 'spatial2' ? referenceObstacles : undefined}
          selected={selection?.kind === 'reference' && selection.id === edge.id}
          related={selection?.kind === 'object' && edge.targetObjectId === selection.id}
          labelSize={arrayWorld ? 0.28 : undefined}
          onSelect={(id) => select({ kind: 'reference', id })} />)}
        </ConnectorCaptionLayer>
        {plan.flows.map((item) => {
          const from = endpoint(item.from)
          const to = endpoint(item.to)
          return from && to ? <HistoricalFlow key={item.id} transition={item} from={from} to={to} behindZ={connectorBackZ} sourceAnchor={fullScene.layoutKind === 'spatial2' ? surfaceAnchor(item.from) : undefined} targetAnchor={fullScene.layoutKind === 'spatial2' ? surfaceAnchor(item.to) : undefined} obstacles={fullScene.layoutKind === 'spatial2' ? referenceObstacles : undefined} selected={selectedFlowId === item.id} onSelect={onSelectFlow} /> : null
        })}
        {(scene.io ?? []).map(item => <IoEndpoint key={item.id} id={item.id} position={item.anchor.position} preview={item.preview} observations={item.observations} />)}
        {guided && !motionCancelled && transition && motionTo && <SemanticFlowMotion key={transition.id} transition={transition} from={motionFrom} to={motionTo} behindZ={connectorBackZ} quality={quality} sourceAnchor={fullScene.layoutKind === 'spatial2' ? surfaceAnchor(transition.from) : undefined} targetAnchor={fullScene.layoutKind === 'spatial2' ? surfaceAnchor(transition.to) : undefined} obstacles={fullScene.layoutKind === 'spatial2' ? referenceObstacles : undefined} />}
        <RuntimeFaceLabels.Provider value={fullScene.layoutKind !== 'spatial2' || detailLevel !== 'macro' || Boolean(isolatedSelection)}>
        {scene.frames.map((node) => !fullFace(node.id) ? <IdentitySolid key={node.id} node={node} onSelect={select} showLabels={detailLevel !== 'macro'} /> : <FrameSolid key={node.id} node={node}
          inspection={Boolean(isolatedSelection)}
          readable={deepStack || arrayWorld || scopedWorld} spacious={arrayWorld || scopedWorld}
          selected={selection?.kind === 'frame' && selection.id === node.id}
          related={isRelated(selection, node.id, scene)} detailLevel={plan.selectedIds.has(node.id) ? 'micro' : scene.detailLevel === 'macro' ? 'meso' : scene.detailLevel}
          activeSlotId={guided && event?.type === 'RETURN_VALUE' && event.destination?.frameId === node.id ? event.destination.slotId : activeSlotId}
          selectedSlotId={selection?.kind === 'slot' ? selection.id : undefined}
          onSelectSlot={(id) => select({ kind: 'slot', id })}
          reducedMotion={node.historical ? true : undefined}
          onSelect={(id) => select({ kind: 'frame', id })} />)}
        {scene.objects.map((node) => !fullFace(node.id) ? <IdentitySolid key={node.id} node={node} onSelect={select} showLabels={detailLevel !== 'macro'} /> : node.array ? <ArraySolid key={node.id} node={{ ...node, array: { ...node.array, cells: plan.cellWindows.get(node.id) ?? [] } }} selection={selection} onSelect={select} guided={guided} playing={playing} activity={scene.arrayActivity} mutations={scene.arrayMutations} presentation={scene.presentation} detailLevel={plan.selectedIds.has(node.id) ? 'micro' : scene.detailLevel} origins={origins} /> : <ObjectSolid key={node.id} node={node}
          selected={selection?.kind === 'object' && selection.id === node.id}
          inspection={Boolean(isolatedSelection)}
          animateEntry={event?.type === 'ALLOCATE_OBJECT' && event.objectId === node.id}
          related={isRelated(selection, node.id, scene)} detailLevel={plan.selectedIds.has(node.id) ? 'micro' : scene.detailLevel === 'macro' ? 'meso' : scene.detailLevel}
          activeSlotId={activeSlotId}
          selectedSlotId={selection?.kind === 'slot' ? selection.id : undefined}
          onSelectSlot={(id) => select({ kind: 'slot', id })}
          onSelect={(id) => select({ kind: 'object', id })} />)}
        {(scene.classes ?? []).map(node => !fullFace(node.id) ? <IdentitySolid key={node.id} node={node} onSelect={select} showLabels={detailLevel !== 'macro'} /> : <ClassSolid key={node.id} node={node}
          selected={selection?.kind === 'class' && selection.id === node.id} related={isRelated(selection, node.id, scene)}
          inspection={Boolean(isolatedSelection)} detailLevel={plan.selectedIds.has(node.id) ? 'micro' : scene.detailLevel}
          activeSlotId={activeSlotId} selectedSlotId={selection?.kind === 'slot' ? selection.id : undefined}
          onSelectSlot={id => select({ kind: 'slot', id })} onSelect={id => select({ kind: 'class', id })} />)}
        </RuntimeFaceLabels.Provider>
        {guided && <MutationCue scene={scene} event={event} />}
      </group>
      <NavigationController visible={visible} fitShallow={fitShallow} inspectorVisible={inspectorVisible} sceneModel={fullScene}
        geometryScene={plan.geometryScene} homeScene={fullScene.layoutKind === 'spatial2' ? plan.homeScene : fullScene}
        event={event} homeTarget={(fullScene.layoutKind === 'spatial2' ? plan.homeBounds?.center : fullScene.bounds?.center) ?? worldUnits.homeTarget} />
    </Canvas>
  </div>
}
