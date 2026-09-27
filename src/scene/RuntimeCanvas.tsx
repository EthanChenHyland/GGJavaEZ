import { Canvas } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import type { Selection } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneModel } from '../contracts/world'
import { NavigationController } from '../navigation'
import { FrameSolid, ObjectSolid, ReferenceCurve } from './primitives'
import { colors, worldUnits } from '../theme/tokens'

interface RuntimeCanvasProps {
  scene: SceneModel
  event: TraceEvent | null
  selection: Selection
  onSelect: (selection: NonNullable<Selection>) => void
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
  return <Text
    position={[x, y + object.anchor.size[1] / 2 + 0.44, z + 0.45]}
    fontSize={0.25}
    color={colors.mutation}
    anchorX="center"
    anchorY="middle"
    outlineWidth={0.007}
    outlineColor={colors.canvas}
  >
    {field.name === 'age' ? 'age  0 → 18' : `${field.name} updated`}
  </Text>
}

export function RuntimeCanvas({ scene, event, selection, onSelect }: RuntimeCanvasProps) {
  const activeSlotId = event?.type === 'SET_FIELD' || event?.type === 'ASSIGN_LOCAL' ? event.slotId : undefined
  return <div className="world-canvas" aria-label="Three-dimensional Java runtime world">
    <Canvas
      shadows
      dpr={[1, 1.7]}
      camera={{ position: [...worldUnits.homePosition], fov: 43, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[colors.canvas]} />
      <fog attach="fog" args={[colors.canvas, 22, 55]} />
      <ambientLight intensity={1.2} color="#A8C5E4" />
      <hemisphereLight intensity={1.1} color="#D6E7FF" groundColor="#0B1018" />
      <directionalLight position={[-3.5, 8, 8]} intensity={2.3} color="#E2F1FF" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <pointLight position={[5, 3, 2]} intensity={11} distance={14} color={colors.heap} />
      <pointLight position={[-5, 3, 4]} intensity={10} distance={13} color={colors.stack} />
      <mesh position={[0, -1.58, -1.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 16]} />
        <meshStandardMaterial color={colors.canvasRaised} roughness={0.9} metalness={0.05} />
      </mesh>
      <group>
        {scene.references.map((edge) => <ReferenceCurve key={edge.id} edge={edge}
          selected={selection?.kind === 'reference' && selection.id === edge.id}
          related={selection?.kind === 'object' && edge.targetObjectId === selection.id}
          onSelect={(id) => onSelect({ kind: 'reference', id })} />)}
        {scene.frames.map((node) => <FrameSolid key={node.id} node={node}
          selected={selection?.kind === 'frame' && selection.id === node.id}
          related={isRelated(selection, node.id, scene)} detailLevel={scene.detailLevel}
          activeSlotId={activeSlotId}
          onSelect={(id) => onSelect({ kind: 'frame', id })} />)}
        {scene.objects.map((node) => <ObjectSolid key={node.id} node={node}
          selected={selection?.kind === 'object' && selection.id === node.id}
          related={isRelated(selection, node.id, scene)} detailLevel={scene.detailLevel}
          activeSlotId={activeSlotId}
          onSelect={(id) => onSelect({ kind: 'object', id })} />)}
        <MutationCue scene={scene} event={event} />
      </group>
      <NavigationController sceneModel={scene} event={event} homeTarget={worldUnits.homeTarget} />
    </Canvas>
  </div>
}
