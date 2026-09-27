import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { CubicBezierCurve3, TubeGeometry, Vector3 } from 'three'
import type { ReferenceId } from '../../contracts/runtime'
import type { SceneReferenceEdge } from '../../contracts/world'
import { colors, line } from '../../theme/tokens'

export interface ReferenceCurveProps {
  edge: SceneReferenceEdge
  selected: boolean
  related: boolean
  onSelect: (id: ReferenceId) => void
}

export function ReferenceCurve({ edge, selected, related, onSelect }: ReferenceCurveProps) {
  const curve = useMemo(() => {
    const from = new Vector3(...edge.from)
    const to = new Vector3(...edge.to)
    const span = to.x - from.x
    const lift = Math.min(Math.abs(span) * 0.055, 0.28)
    return new CubicBezierCurve3(
      from,
      new Vector3(from.x + span * 0.38, from.y + lift, from.z - 0.24),
      new Vector3(to.x - span * 0.38, to.y + lift, to.z - 0.24),
      to,
    )
  }, [edge.from, edge.to])
  const points = useMemo(() => curve.getPoints(24), [curve])
  const hitGeometry = useMemo(() => new TubeGeometry(curve, 24, 0.11, 5, false), [curve])
  const opacity = selected ? 1 : related ? 0.86 : 0.62

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(edge.id)
  }

  return (
    <group onClick={select}>
      <Line points={points} color={colors.execution} lineWidth={selected ? line.referenceMaxPx : line.referenceDefaultPx} transparent opacity={opacity} />
      <mesh geometry={hitGeometry}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} color={colors.execution} />
      </mesh>
      <mesh position={[...edge.from]}>
        <sphereGeometry args={[selected ? 0.085 : 0.06, 10, 8]} />
        <meshBasicMaterial color={colors.execution} transparent opacity={opacity} />
      </mesh>
      <mesh position={[...edge.to]}>
        <sphereGeometry args={[selected ? 0.09 : 0.065, 10, 8]} />
        <meshBasicMaterial color={colors.execution} transparent opacity={opacity} />
      </mesh>
    </group>
  )
}
