import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { Group } from 'three'
import type { Vec3, WorldAnchor } from '../../contracts/world'
import type { SemanticTransition } from '../../motion/semanticTransition'
import { surfaceConnectorPoints } from '../../world/connectorRouting'
import { semanticFlowPoints } from '../../motion/flowPresentation'
import { colors, motionMs } from '../../theme/tokens'
import { useReducedMotion } from './presentationMotion'
import { fitFaceValue } from './faceText'
import { RuntimeLabel } from './RuntimeLabel'

function valueLabel(transition: SemanticTransition): string {
  const value = transition.value
  if (!value) return transition.kind.replace('-', ' ')
  if (value.kind === 'primitive' || value.kind === 'stringSummary') return String(value.value)
  if (value.kind === 'reference') return `→ ${value.javaType}`
  return value.kind === 'null' ? 'null' : transition.kind.replace('-', ' ')
}

function colorFor(transition: SemanticTransition): string {
  if (transition.kind === 'exception') return colors.exception
  if (transition.kind === 'allocation' || transition.kind === 'reference') return colors.heap
  if (transition.kind === 'field-write' || transition.kind === 'array-write') return colors.mutation
  return colors.execution
}

/** Scalar endpoints survive immutable snapshot array replacement. Routing
 * anchors remain the actual reserved objects; a changed anchor invalidates the path. */
function useFlowPath(from: Vec3 | null, to: Vec3, sourceAnchor?: WorldAnchor, targetAnchor?: WorldAnchor, obstacles?: readonly WorldAnchor[]) {
  const fromX = from?.[0], fromY = from?.[1], fromZ = from?.[2]
  const [toX, toY, toZ] = to
  const obstacleKey = obstacles?.map(anchor => `${anchor.entityId}:${anchor.position.join(',')}:${anchor.size.join(',')}`).join('|')
  return useMemo(() => {
    const origin: Vec3 = fromX === undefined || fromY === undefined || fromZ === undefined
      ? [toX + 0.55, toY + 0.2, toZ + 0.2] : [fromX, fromY, fromZ]
    const destination: Vec3 = [toX, toY, toZ]
    const points = fromX === undefined ? [origin, destination]
      : sourceAnchor && targetAnchor ? surfaceConnectorPoints(origin, destination, sourceAnchor, targetAnchor, obstacles)
        // semanticFlowPoints keeps this unused legacy argument for API compatibility.
        : semanticFlowPoints(origin, destination, 0)
    const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1], point[2] - points[index][2]))
    return { origin, points, lengths, totalLength: lengths.reduce((sum, length) => sum + length, 0) }
  }, [fromX, fromY, fromZ, toX, toY, toZ, sourceAnchor, targetAnchor, obstacleKey])
}

export function SemanticFlowMotion({ transition, from, to, quality, sourceAnchor, targetAnchor, obstacles }: { sourceAnchor?: WorldAnchor; targetAnchor?: WorldAnchor; obstacles?: readonly WorldAnchor[]; transition: SemanticTransition; from: Vec3 | null; to: Vec3; behindZ: number; quality: 'high' | 'balanced' | 'low' }) {
  const reduced = useReducedMotion()
  const token = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const elapsed = useRef(0)
  const duration = reduced || quality === 'low' ? motionMs.quick : quality === 'balanced' ? motionMs.standard : motionMs.deliberate
  const { origin, points, lengths, totalLength } = useFlowPath(from, to, sourceAnchor, targetAnchor, obstacles)
  const caption = fitFaceValue(valueLabel(transition), 0.25, 2.6)
  useEffect(() => { elapsed.current = 0; invalidate() }, [transition.id, invalidate])
  useFrame((_, delta) => {
    if (!token.current || elapsed.current >= duration) return
    elapsed.current = Math.min(duration, elapsed.current + Math.min(delta * 1000, 50))
    const progress = elapsed.current / duration
    const travel = reduced ? 1 : progress * progress * (3 - 2 * progress)
    let remaining = travel * totalLength
    let segment = 0
    while (segment < lengths.length - 1 && remaining > lengths[segment]) remaining -= lengths[segment++]
    const fraction = lengths[segment] ? remaining / lengths[segment] : 1
    const start = points[segment]
    const end = points[segment + 1]
    token.current.position.set(start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
      start[2] + (end[2] - start[2]) * fraction + 0.16)
    token.current.scale.setScalar(0.72 + 0.28 * Math.sin(Math.PI * progress))
    if (progress < 1) invalidate()
  })
  return <group>
    {from && !reduced && quality !== 'low' && <Line points={points} color={colorFor(transition)} lineWidth={quality === 'high' ? 2.2 : 1.5} transparent opacity={transition.evidence === 'correlated' ? 0.36 : 0.55} />}
    <group ref={token} position={origin}>
      <mesh><boxGeometry args={[0.25, 0.18, 0.09]} /><meshBasicMaterial color={colorFor(transition)} transparent opacity={0.87}/></mesh>
      <RuntimeLabel text={caption.text} position={[0, 0.28, 0.08]} size={caption.size} maxWidth={2.6} align="center" color={colorFor(transition)} />
    </group>
  </group>
}

export function HistoricalFlow({ transition, from, to, selected = false, onSelect, sourceAnchor, targetAnchor, obstacles }: { sourceAnchor?: WorldAnchor; targetAnchor?: WorldAnchor; obstacles?: readonly WorldAnchor[]; transition: SemanticTransition; from: Vec3; to: Vec3; behindZ?: number; selected?: boolean; onSelect?: (id: string) => void }) {
  const { points } = useFlowPath(from, to, sourceAnchor, targetAnchor, obstacles)
  return <group>
    <Line points={points} color={colorFor(transition)} lineWidth={selected ? 2.6 : 1.2} transparent opacity={selected ? 0.9 : transition.evidence === 'correlated' ? 0.16 : 0.25} dashed={transition.evidence === 'correlated'} dashSize={0.14} gapSize={0.12}/>
    {onSelect && <Line points={points} color={colorFor(transition)} lineWidth={12} transparent opacity={0.001}
      onClick={(event) => { event.stopPropagation(); onSelect(transition.id) }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }} />}
  </group>
}

export function IoEndpoint({ id, position, preview, observations }: { id: 'stdin' | 'stdout' | 'stderr'; position: Vec3; preview?: string; observations?: number }) {
  const color = id === 'stdin' ? colors.execution : id === 'stderr' ? colors.exception : colors.success
  const heading = fitFaceValue(`${id.toUpperCase()}${observations === undefined ? '' : ` · ${observations} recorded`}`, 0.19, 2.3)
  const caption = fitFaceValue(preview ?? '', 0.19, 2.3)
  return <group position={position} name={`observed-${id}`}>
    <mesh><boxGeometry args={[2.8, 0.8, 0.55]} /><meshStandardMaterial color={colors.panelRaised} roughness={0.5} metalness={0.15}/></mesh>
    <mesh position={[0, 0.32, 0.29]}><boxGeometry args={[2.55, 0.025, 0.015]}/><meshBasicMaterial color={color}/></mesh>
    <RuntimeLabel text={heading.text} position={[-1.15, 0.13, 0.3]} size={heading.size} maxWidth={2.3} color={color} />
    {preview && <RuntimeLabel text={caption.text} position={[-1.15, -0.15, 0.3]} size={caption.size} maxWidth={2.3} color={colors.text} />}
  </group>
}
