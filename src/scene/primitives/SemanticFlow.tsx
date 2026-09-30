import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line, Text } from '@react-three/drei'
import type { Group } from 'three'
import type { Vec3 } from '../../contracts/world'
import type { SemanticTransition } from '../../motion/semanticTransition'
import { semanticFlowPoints } from '../../motion/flowPresentation'
import { colors, motionMs, runtimeFont } from '../../theme/tokens'
import { useReducedMotion } from './presentationMotion'

function valueLabel(transition: SemanticTransition): string {
  const value = transition.value
  if (!value) return transition.kind.replace('-', ' ')
  if (value.kind === 'primitive' || value.kind === 'stringSummary') return String(value.value).trim().slice(0, 24)
  if (value.kind === 'reference') return `→ ${value.javaType}`
  return value.kind === 'null' ? 'null' : transition.kind.replace('-', ' ')
}

function colorFor(transition: SemanticTransition): string {
  if (transition.kind === 'exception') return colors.exception
  if (transition.kind === 'allocation' || transition.kind === 'reference') return colors.heap
  if (transition.kind === 'field-write' || transition.kind === 'array-write') return colors.mutation
  return colors.execution
}

export function SemanticFlowMotion({ transition, from, to, behindZ, quality }: { transition: SemanticTransition; from: Vec3 | null; to: Vec3; behindZ: number; quality: 'high' | 'balanced' | 'low' }) {
  const reduced = useReducedMotion()
  const token = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const elapsed = useRef(0)
  const duration = reduced || quality === 'low' ? motionMs.quick : quality === 'balanced' ? motionMs.standard : motionMs.deliberate
  const origin: Vec3 = from ?? [to[0] + 0.55, to[1] + 0.2, to[2] + 0.2]
  const points = from ? semanticFlowPoints(origin, to, behindZ) : [origin, to]
  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1], point[2] - points[index][2]))
  const totalLength = lengths.reduce((sum, length) => sum + length, 0)
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
      <Text font={runtimeFont} position={[0, 0.28, 0.08]} fontSize={0.25} color={colorFor(transition)} anchorX="center" outlineWidth={0.012} outlineColor={colors.canvas}>{valueLabel(transition)}</Text>
    </group>
  </group>
}

export function HistoricalFlow({ transition, from, to, behindZ, selected = false, onSelect }: { transition: SemanticTransition; from: Vec3; to: Vec3; behindZ?: number; selected?: boolean; onSelect?: (id: string) => void }) {
  const points = semanticFlowPoints(from, to, behindZ ?? Math.min(from[2], to[2]) - 0.5)
  return <group>
    <Line points={points} color={colorFor(transition)} lineWidth={selected ? 2.6 : 1.2} transparent opacity={selected ? 0.9 : transition.evidence === 'correlated' ? 0.16 : 0.25} dashed={transition.evidence === 'correlated'} dashSize={0.14} gapSize={0.12}/>
    {onSelect && <Line points={points} color={colorFor(transition)} lineWidth={12} transparent opacity={0.001}
      onClick={(event) => { event.stopPropagation(); onSelect(transition.id) }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }} />}
  </group>
}

export function IoEndpoint({ id, position }: { id: 'stdin' | 'stdout' | 'stderr'; position: Vec3 }) {
  const color = id === 'stdin' ? colors.execution : id === 'stderr' ? colors.exception : colors.success
  return <group position={position}>
    <mesh><boxGeometry args={[1.25, 0.28, 0.35]} /><meshStandardMaterial color={colors.panelRaised} roughness={0.5} metalness={0.15}/></mesh>
    <Text font={runtimeFont} position={[0, 0.22, 0.2]} fontSize={0.2} color={color} anchorX="center">{id.toUpperCase()}</Text>
  </group>
}
