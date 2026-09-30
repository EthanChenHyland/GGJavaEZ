import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Line, Text } from '@react-three/drei'
import type { Selection } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { LayoutState, SceneFrameNode, SceneModel } from '../contracts/world'
import type { SemanticTransition } from '../motion/semanticTransition'
import { endpointPosition, ioPosition } from '../motion/flowPresentation'
import { NavigationController, navigationActions } from '../navigation'
import { ArraySolid } from './primitives/ArraySolid'
import { ReturningFrame } from './primitives/ReturningFrame'
import { ReturnFlow } from './primitives/ReturnFlow'
import { useReducedMotion } from './primitives/presentationMotion'
import { FrameSolid, ObjectSolid, ReferenceCurve } from './primitives'
import { HistoricalFlow, IoEndpoint, SemanticFlowMotion } from './primitives/SemanticFlow'
import { colors, motionMs, renderQuality, runtimeFont, worldMaterial, worldUnits } from '../theme/tokens'
import { stackHeadingPosition } from '../world/runtimeHeadings'
import { callEdgesForScene, connectorBackPlane } from '../world/callStructure'

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
  selection: Selection
  onSelect: (selection: NonNullable<Selection>) => void
  selectedFlowId?: string | null
  onSelectFlow?: (id: string) => void
  inspectorVisible?: boolean
  onFocusSelected: (selection: NonNullable<Selection>) => void
}

function isRelated(selection: Selection, entityId: string, scene: SceneModel): boolean {
  if (!selection) return false
  if (selection.kind === 'object') return scene.references.some((edge) =>
    edge.targetObjectId === selection.id && (
      edge.source.kind === 'frame' ? edge.source.frameId === entityId : edge.source.objectId === entityId),
  )
  if (selection.kind === 'reference') {
    const edge = scene.references.find((item) => item.id === selection.id)
    return edge?.targetObjectId === entityId || (edge?.source.kind === 'frame' ? edge.source.frameId === entityId : edge?.source.objectId === entityId)
  }
  return false
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

export function RuntimeCanvas({ visible, fitShallow = false, guided, playing, quality, scene, layout, event, transition, flowHistory = [], selection, selectedFlowId, onSelectFlow, inspectorVisible = false, onSelect, onFocusSelected }: RuntimeCanvasProps) {
  const reducedMotion = useReducedMotion()
  const [motionCancelled, setMotionCancelled] = useState(false)
  useEffect(() => { setMotionCancelled(false) }, [transition?.id])
  const previousFrames = useRef(scene.frames)
  const [returning, setReturning] = useState<SceneFrameNode[]>([])
  useEffect(() => {
    const departed = playing && !reducedMotion ? previousFrames.current.filter((node) => !scene.frames.some((frame) => frame.id === node.id)) : []
    previousFrames.current = scene.frames
    setReturning(departed)
    if (!departed.length) return
    const timer = window.setTimeout(() => setReturning([]), motionMs.quick)
    return () => window.clearTimeout(timer)
  }, [playing, reducedMotion, scene.frames])
  const tier = renderQuality[quality]
  const pointerStart = useRef<[number, number] | null>(null)
  const dragged = useRef(false)
  const lastSelected = useRef<NonNullable<Selection> | null>(null)
  const select = (item: NonNullable<Selection>) => {
    if (dragged.current) return
    lastSelected.current = item
    onSelect(item)
  }
  const activeSlotId = !guided ? undefined : event?.type === 'RETURN_VALUE' ? `return:${event.frameId}`
    : event?.type === 'SET_FIELD' || event?.type === 'ASSIGN_LOCAL' ? event.slotId : event?.type === 'ARRAY_READ' || event?.type === 'INPUT_READ' ? event.destinationSlotId : event?.type === 'DECLARE_LOCAL' ? event.slot.id : undefined
  const scopedWorld = scene.layoutKind === 'scoped'
  const arrayWorld = scene.layoutKind === 'array'
  const origins = Object.assign({}, ...scene.frames.map((node) => node.anchor.ports))
  const deepStack = (scene.stackDepth ?? 0) > 1
  const floorY = scene.bounds ? scene.bounds.center[1] - scene.bounds.size[1] / 2 - 0.22 : -1.58
  const motionTo = transition ? endpointPosition(transition.to, layout, scene) : null
  const motionFrom = transition ? endpointPosition(transition.from, layout, scene) : null
  const ioKinds = new Set(flowHistory.flatMap((item) => [item.from, item.to]).filter((point) => point?.kind === 'io').map((point) => point!.id))
  if (transition?.from?.kind === 'io') ioKinds.add(transition.from.id)
  if (transition?.to?.kind === 'io') ioKinds.add(transition.to.id)
  const connectorBackZ = connectorBackPlane(scene)
  const callEdges = callEdgesForScene(scene, connectorBackZ)
  return <div className="world-canvas" aria-label="Three-dimensional Java runtime world"
    onPointerDownCapture={(event) => {
      pointerStart.current = [event.clientX, event.clientY]; dragged.current = false
      // Take ownership immediately, including while WebGL primitives are loading.
      if (visible) navigationActions.freeExplore()
      setMotionCancelled(true)
    }}
    onPointerMoveCapture={(event) => {
      if (pointerStart.current && Math.hypot(event.clientX - pointerStart.current[0], event.clientY - pointerStart.current[1]) > 5) dragged.current = true
    }}
    onDoubleClick={() => { if (lastSelected.current) onFocusSelected(lastSelected.current) }}>
    <Canvas
      shadows={tier.shadows ? "soft" : false}
      frameloop={visible ? "demand" : "never"}
      dpr={[1, tier.dpr]}
      camera={{ position: [...worldUnits.homePosition], fov: 41, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[colors.canvas]} />
      <fog attach="fog" args={[colors.canvas, 22, 55]} />
      <ambientLight intensity={1.5} color={colors.textSecondary} />
      <hemisphereLight intensity={1.4} color={colors.text} groundColor={colors.panel} />
      <directionalLight position={[-3.5, 8, 8]} intensity={2.6} color={colors.text} castShadow={tier.shadows} shadow-mapSize={[tier.shadowSize, tier.shadowSize]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-radius={3} />
      <pointLight position={[5, 3, 2]} intensity={11} distance={14} color={colors.heap} />
      <pointLight position={[-5, 3, 4]} intensity={10} distance={13} color={colors.stack} />
      <mesh position={[0, floorY, -1.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={deepStack || arrayWorld ? [24, 26] : [20, 16]} />
        <meshStandardMaterial color={worldMaterial.floor} roughness={0.9} metalness={0.05} />
      </mesh>
      <group>
        {scene.frames.length > 0 && !scopedWorld && <Text font={runtimeFont} position={[...stackHeadingPosition(scene)]} fontSize={0.31} color={colors.stack} anchorX="left" anchorY="middle" letterSpacing={0.08}>STACK</Text>}
        {scene.objects.length > 0 && !arrayWorld && <Text font={runtimeFont} position={[2.1, 2.18, -0.65]} fontSize={0.31} color={colors.heap} anchorX="left" anchorY="middle" letterSpacing={0.08}>HEAP</Text>}
        {callEdges.map((edge) => <Line key={edge.id} points={edge.points} color={colors.stack} lineWidth={1.4} transparent opacity={0.46} />)}
        {scene.returnFlow && scene.frames.length > 0 && (!scopedWorld || event?.type === 'RETURN_VALUE' || event?.type === 'EXIT_METHOD') && <ReturnFlow flow={scene.returnFlow} guided={guided} playing={playing} />}
        {scene.references.map((edge) => <ReferenceCurve key={edge.id} edge={edge}
          label={[...scene.frames.flatMap((node) => node.slots), ...scene.objects.flatMap((node) => node.fields)].find((slot) => slot.id === edge.source.slotId)?.name ?? ''}
          selected={selection?.kind === 'reference' && selection.id === edge.id}
          related={selection?.kind === 'object' && edge.targetObjectId === selection.id}
          labelSize={arrayWorld ? 0.28 : undefined}
          onSelect={(id) => select({ kind: 'reference', id })} />)}
        {flowHistory.map((item) => {
          const from = endpointPosition(item.from, layout, scene)
          const to = endpointPosition(item.to, layout, scene)
          return from && to ? <HistoricalFlow key={item.id} transition={item} from={from} to={to} behindZ={connectorBackZ} selected={selectedFlowId === item.id} onSelect={onSelectFlow} /> : null
        })}
        {[...ioKinds].filter((id): id is 'stdin' | 'stdout' | 'stderr' => id === 'stdin' || id === 'stdout' || id === 'stderr').map((id) => <IoEndpoint key={id} id={id} position={ioPosition(id, scene)} />)}
        {guided && !motionCancelled && transition && motionTo && <SemanticFlowMotion key={transition.id} transition={transition} from={motionFrom} to={motionTo} behindZ={connectorBackZ} quality={quality} />}
        {returning.map((node) => <ReturningFrame key={node.id} node={node} />)}
        {scene.frames.map((node) => <FrameSolid key={node.id} node={node}
          readable={deepStack || arrayWorld || scopedWorld} spacious={arrayWorld || scopedWorld}
          selected={selection?.kind === 'frame' && selection.id === node.id}
          related={isRelated(selection, node.id, scene)} detailLevel={selection?.id === node.id && scene.detailLevel === 'macro' ? 'meso' : scene.detailLevel}
          activeSlotId={guided && event?.type === 'RETURN_VALUE' && event.destination?.frameId === node.id ? event.destination.slotId : activeSlotId}
          selectedSlotId={selection?.kind === 'slot' ? selection.id : undefined}
          onSelectSlot={(id) => select({ kind: 'slot', id })}
          onSelect={(id) => select({ kind: 'frame', id })} />)}
        {scene.objects.map((node) => node.array ? <ArraySolid key={node.id} node={node} selection={selection} onSelect={select} guided={guided} playing={playing} activity={scene.arrayActivity} mutations={scene.arrayMutations} presentation={scene.presentation} detailLevel={scene.detailLevel} origins={origins} /> : <ObjectSolid key={node.id} node={node}
          selected={selection?.kind === 'object' && selection.id === node.id}
          related={isRelated(selection, node.id, scene)} detailLevel={selection?.id === node.id && scene.detailLevel === 'macro' ? 'meso' : scene.detailLevel}
          activeSlotId={activeSlotId}
          onSelect={(id) => select({ kind: 'object', id })} />)}
        {guided && <MutationCue scene={scene} event={event} />}
      </group>
      <NavigationController visible={visible} fitShallow={fitShallow} inspectorVisible={inspectorVisible} sceneModel={scene} event={event} homeTarget={scene.bounds?.center ?? worldUnits.homeTarget} />
    </Canvas>
  </div>
}
