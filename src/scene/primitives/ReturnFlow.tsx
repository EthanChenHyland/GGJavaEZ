import { Billboard, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CubicBezierCurve3, Quaternion, Vector3, type Group } from 'three'
import type { SceneModel } from '../../contracts/world'
import { colors, easeOutCubic, line, motionMs } from '../../theme/tokens'
import { useReducedMotion } from './presentationMotion'
import { fitFaceValue } from './faceText'
import { RuntimeLabel } from './RuntimeLabel'

type Flow = NonNullable<SceneModel['returnFlow']>

/** Actual semantic return endpoints; motion only emphasizes the already applied transfer. */
export function ReturnFlow({ flow, guided, playing }: { flow: Flow; guided: boolean; playing: boolean }) {
  const reduced = useReducedMotion()
  const marker = useRef<Group>(null)
  const elapsed = useRef<number>(motionMs.deliberate)
  const invalidate = useThree((state) => state.invalidate)
  const [fromX, fromY, fromZ] = flow.from
  const [toX, toY, toZ] = flow.to ?? flow.from
  const curve = useMemo(() => {
    const from = new Vector3(fromX, fromY, fromZ)
    const to = new Vector3(toX, toY, toZ)
    return new CubicBezierCurve3(from, from.clone().add(new Vector3(1.4, 0, 0.45)), to.clone().add(new Vector3(1.4, 0, 0.45)), to)
  }, [fromX, fromY, fromZ, toX, toY, toZ])
  const points = useMemo(() => curve.getPoints(32), [curve])
  const arrow = useMemo(() => ({ position: curve.getPoint(1).addScaledVector(curve.getTangent(1).normalize(), -0.12), rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), curve.getTangent(1).normalize()) }), [curve])
  const captionPosition = useMemo(() => curve.getPoint(0.5).add(new Vector3(0.4, 0, 0)), [curve])
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
  const caption = fitFaceValue(`return ${value}`, 0.23, 2.6)
  const markerCaption = fitFaceValue(value, 0.28, 2.6)
  return <group>
    <Line points={points} color={colors.success} lineWidth={line.referenceDefaultPx} transparent opacity={0.8} />
    <mesh position={arrow.position} quaternion={arrow.rotation}><coneGeometry args={[0.1, 0.24, 12]}/><meshBasicMaterial color={colors.success}/></mesh>
    <Billboard position={captionPosition}><RuntimeLabel text={caption.text} position={[0, 0, 0]} size={caption.size} maxWidth={2.6} align="center" color={colors.success} /></Billboard>
    <group ref={marker} visible={false}><Billboard><RuntimeLabel text={markerCaption.text} position={[0, 0, 0]} size={markerCaption.size} maxWidth={2.6} align="center" color={colors.success} /></Billboard></group>
  </group>
}
