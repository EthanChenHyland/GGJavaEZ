import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Billboard, Line, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { CubicBezierCurve3, Quaternion, TubeGeometry, Vector3 } from 'three'
import type { Line2, LineSegments2 } from 'three-stdlib'
import type { ReferenceId } from '../../contracts/runtime'
import type { SceneReferenceEdge } from '../../contracts/world'
import { colors, line, motionMs, runtimeFont } from '../../theme/tokens'
import { useMountSettle, useReducedMotion } from './presentationMotion'

export interface ReferenceCurveProps {
  edge: SceneReferenceEdge
  selected: boolean
  related: boolean
  label: string
  onSelect: (id: ReferenceId) => void
  labelSize?: number
  reducedMotion?: boolean
}

export function ReferenceCurve({ edge, selected, related, label, onSelect, labelSize = 0.19, reducedMotion }: ReferenceCurveProps) {
  const motionReduced = useReducedMotion(reducedMotion)
  const lineRef = useRef<Line2 | LineSegments2>(null)
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
  useEffect(() => () => hitGeometry.dispose(), [hitGeometry])
  const arrow = useMemo(() => {
    const tangent = curve.getTangent(1).normalize()
    return { rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tangent), position: curve.getPoint(1).addScaledVector(tangent, -0.12) }
  }, [curve])
  const opacity = selected ? 1 : related ? 0.86 : 0.62
  useLayoutEffect(() => {
    if (lineRef.current && !motionReduced) lineRef.current.material.opacity = opacity * 0.55
    // Entry opacity is set only on mount; later selection changes use the normal prop.
  }, [])
  useMountSettle(motionMs.quick, motionReduced, (progress) => {
    if (lineRef.current) lineRef.current.material.opacity = opacity * (0.55 + 0.45 * progress)
  })

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(edge.id)
  }

  return (
    <group onClick={select}>
      <Line ref={lineRef} points={points} color={colors.execution} lineWidth={selected ? line.referenceMaxPx : line.referenceDefaultPx} transparent opacity={opacity} />
      <mesh geometry={hitGeometry}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} color={colors.execution} />
      </mesh>
      <mesh position={[...edge.from]}>
        <sphereGeometry args={[selected ? 0.085 : 0.06, 10, 8]} />
        <meshBasicMaterial color={colors.execution} transparent opacity={opacity} />
      </mesh>
      <mesh position={arrow.position} quaternion={arrow.rotation}>
        <coneGeometry args={[0.11, 0.24, 12]} />
        <meshBasicMaterial color={colors.execution} toneMapped={false} transparent opacity={opacity} />
      </mesh>
      <Billboard position={curve.getPoint(0.48).add(new Vector3(0, 0.18, 0))}>
        <Text font={runtimeFont} fontSize={labelSize} color={colors.execution} outlineWidth={0.014} outlineColor={colors.canvas} anchorX="center">{label}</Text>
      </Billboard>
      <mesh position={[...edge.to]}>
        <sphereGeometry args={[selected ? 0.09 : 0.065, 10, 8]} />
        <meshBasicMaterial color={colors.execution} transparent opacity={opacity} />
      </mesh>
    </group>
  )
}
