import { Billboard, Line, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CubicBezierCurve3, Quaternion, Vector3, type Group } from 'three'
import type { SceneModel } from '../../contracts/world'
import { colors, easeOutCubic, line, motionMs, runtimeFont } from '../../theme/tokens'
import { useReducedMotion } from './presentationMotion'

type Flow = NonNullable<SceneModel['returnFlow']>

/** Actual semantic return endpoints; motion only emphasizes the already applied transfer. */
export function ReturnFlow({ flow, guided, playing }: { flow: Flow; guided: boolean; playing: boolean }) {
  const reduced = useReducedMotion()
  const marker = useRef<Group>(null)
  const elapsed = useRef<number>(motionMs.deliberate)
  const invalidate = useThree((state) => state.invalidate)
  const curve = useMemo(() => {
    const from = new Vector3(...flow.from)
    const to = new Vector3(...(flow.to ?? flow.from))
    return new CubicBezierCurve3(from, from.clone().add(new Vector3(1.4, 0, 0.45)), to.clone().add(new Vector3(1.4, 0, 0.45)), to)
  }, [flow.from, flow.to])
  const arrow = useMemo(() => ({ position: curve.getPoint(1).addScaledVector(curve.getTangent(1).normalize(), -0.12), rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), curve.getTangent(1).normalize()) }), [curve])
  useEffect(() => {
    elapsed.current = playing && guided && !reduced ? 0 : motionMs.deliberate
    if (marker.current) marker.current.visible = elapsed.current === 0
    if (elapsed.current === 0) invalidate()
  }, [flow.eventId, guided, playing, reduced, invalidate])
  useFrame((_, delta) => {
    if (!marker.current || elapsed.current >= motionMs.deliberate) return
    elapsed.current = Math.min(motionMs.deliberate, elapsed.current + Math.min(delta * 1000, 50))
    marker.current.position.copy(curve.getPoint(easeOutCubic(elapsed.current / motionMs.deliberate)))
    marker.current.visible = elapsed.current < motionMs.deliberate
    invalidate()
  })
  if (!flow.to) return null
  const value = flow.value.kind === 'primitive' ? String(flow.value.value) : ''
  return <group>
    <Line points={curve.getPoints(32)} color={colors.success} lineWidth={line.referenceDefaultPx} transparent opacity={0.8} />
    <mesh position={arrow.position} quaternion={arrow.rotation}><coneGeometry args={[0.1, 0.24, 12]}/><meshBasicMaterial color={colors.success}/></mesh>
    <Billboard position={curve.getPoint(0.5).add(new Vector3(0.4, 0, 0))}><Text font={runtimeFont} fontSize={0.23} color={colors.success} outlineWidth={0.014} outlineColor={colors.canvas}>return {value}</Text></Billboard>
    <group ref={marker} visible={false}><Billboard><Text font={runtimeFont} fontSize={0.28} color={colors.success} outlineWidth={0.025} outlineColor={colors.canvas}>{value}</Text></Billboard></group>
  </group>
}
