import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Billboard, Line, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { CubicBezierCurve3, CurvePath, LineCurve3, Mesh, Quaternion, TubeGeometry, Vector3, type Intersection, type Raycaster } from 'three'
import type { Line2, LineSegments2 } from 'three-stdlib'
import type { ReferenceId } from '../../contracts/runtime'
import type { SceneReferenceEdge, WorldAnchor } from '../../contracts/world'
import { surfaceConnectorPoints } from '../../world/connectorRouting'
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
  /** Macro views retain topology without mounting every source label. */
  detailLevel?: 'macro' | 'meso' | 'micro'
  sourceAnchor?: WorldAnchor
  targetAnchor?: WorldAnchor
}

/** Presentation routing only; endpoint identities/anchors are never rewritten. */
export function referenceFaceCurve(edge: SceneReferenceEdge) {
  const from = new Vector3(...(edge.fromFace ?? edge.from))
  const to = new Vector3(...(edge.toFace ?? edge.to))
  const span = to.x - from.x
  const distance = from.distanceTo(to)
  const lift = Math.min(distance * 0.04, 0.28)
  // Approach both information faces from their visible side. A short proud
  // arch avoids the previous path disappearing behind two opaque bodies.
  const clearZ = Math.max(from.z, to.z) + Math.min(0.55, Math.max(0.18, distance * 0.045))
  return new CubicBezierCurve3(from,
    new Vector3(from.x + span * 0.32, from.y + lift, clearZ),
    new Vector3(to.x - span * 0.32, to.y + lift, clearZ), to)
}

/** Keep the invisible picking sleeve away from field text at both attachments. */
function pickCurveInterior(this: Mesh, raycaster: Raycaster, intersections: Intersection[]) {
  const hits: Intersection[] = []
  Mesh.prototype.raycast.call(this, raycaster, hits)
  intersections.push(...hits.filter(hit => hit.uv && hit.uv.x > 0.08 && hit.uv.x < 0.92))
}

export function ReferenceCurve({ edge, selected, related, label, onSelect, labelSize = 0.19, reducedMotion, detailLevel = 'meso', sourceAnchor, targetAnchor }: ReferenceCurveProps) {
  const motionReduced = useReducedMotion(reducedMotion)
  const lineRef = useRef<Line2 | LineSegments2>(null)
  const curve = useMemo(() => {
    if (!sourceAnchor || !targetAnchor) return referenceFaceCurve(edge)
    const points = surfaceConnectorPoints(edge.fromFace ?? edge.from, edge.toFace ?? edge.to, sourceAnchor, targetAnchor).map(point => new Vector3(...point))
    const path = new CurvePath<Vector3>()
    for (let i = 1; i < points.length; i++) path.add(new LineCurve3(points[i - 1], points[i]))
    return path
  }, [edge.from, edge.to, edge.fromFace, edge.toFace, sourceAnchor, targetAnchor])
  const points = useMemo(() => curve.getPoints(24), [curve])
  // The visible line stays hairline; the transparent hit tube gives a stable
  // target while the camera orbits and keeps reference picking practical.
  const hitGeometry = useMemo(() => new TubeGeometry(curve, 24, 0.18, 5, false), [curve])
  useEffect(() => () => hitGeometry.dispose(), [hitGeometry])
  const arrow = useMemo(() => {
    const tangent = curve.getTangent(1).normalize()
    const height = Math.min(0.24, Math.max(0.08, curve.getPoint(0).distanceTo(curve.getPoint(1)) * 0.16))
    return { rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tangent), position: curve.getPoint(1).addScaledVector(tangent, -height / 2), height }
  }, [curve])
  const opacity = selected ? 1 : related ? 0.86 : edge.historical ? 0.43 : 0.62
  const color = edge.historical && !selected && !related ? colors.textMuted : colors.execution
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
      <Line ref={lineRef} points={points} color={color} lineWidth={selected ? line.referenceMaxPx : line.referenceDefaultPx} transparent opacity={opacity} />
      <mesh geometry={hitGeometry} raycast={pickCurveInterior} userData={import.meta.env.DEV ? { referenceId: edge.id, pickPoint: curve.getPoint(0.5).toArray() } : undefined}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} color={colors.execution} />
      </mesh>
      <mesh position={[...(edge.fromFace ?? edge.from)]}>
        <sphereGeometry args={[selected ? 0.07 : 0.045, 10, 8]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh position={arrow.position} quaternion={arrow.rotation}>
        <coneGeometry args={[arrow.height * 0.35, arrow.height, 10]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={opacity} />
      </mesh>
      {label && (detailLevel !== 'macro' || selected || related) && <Billboard position={curve.getPoint(0.48).add(new Vector3(0, 0.18, 0))}>
        <Text font={runtimeFont} fontSize={labelSize} color={color} outlineWidth={0.014} outlineColor={colors.canvas} anchorX="center">{label}</Text>
      </Billboard>}
      <mesh position={[...(edge.toFace ?? edge.to)]}>
        <sphereGeometry args={[selected ? 0.07 : 0.05, 10, 8]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </group>
  )
}
