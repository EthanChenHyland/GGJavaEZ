import { useLayoutEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import type { FrameId } from '../../contracts/runtime'
import type { DetailLevel, SceneFrameNode } from '../../contracts/world'
import { colors, motionMs, worldMaterial } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'
import { RuntimeSlot } from './RuntimeSlot'
import { SolidBody } from './SolidBody'
import { useMountSettle, useReducedMotion } from './presentationMotion'

export interface FrameSolidProps {
  node: SceneFrameNode
  selected: boolean
  related: boolean
  onSelect: (id: FrameId) => void
  detailLevel?: DetailLevel
  activeSlotId?: string
  reducedMotion?: boolean
}

export function FrameSolid({ node, selected, related, onSelect, detailLevel = 'meso', activeSlotId, reducedMotion }: FrameSolidProps) {
  const motionReduced = useReducedMotion(reducedMotion)
  const entranceRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!entranceRef.current || motionReduced) return
    entranceRef.current.scale.set(1, 1, 0.9)
    // Entry state is set only on mount; later semantic updates keep the settled volume.
  }, [])
  useMountSettle(motionMs.quick, motionReduced, (progress) => {
    if (!entranceRef.current) return
    entranceRef.current.scale.z = 0.9 + 0.1 * progress
  })
  const { position, size } = node.anchor
  const [width, height, depth] = size
  const front = depth / 2 + 0.012
  const textZ = front + 0.018
  const rows = detailLevel === 'macro' ? [] : node.slots

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(node.id)
  }

  return (
    <group position={[...position]} onClick={select}>
      <group ref={entranceRef}>
      <SolidBody size={size} accent={colors.stack} bodyColor={worldMaterial.stackBody} selected={selected} related={related} active={node.active} />
      <mesh position={[0, 0, front]}>
        <boxGeometry args={[width - 0.14, height - 0.14, 0.018]} />
        <meshBasicMaterial color={worldMaterial.stackFace} />
      </mesh>
      <RuntimeLabel text="STACK FRAME" position={[-width / 2 + 0.22, height / 2 - 0.21, textZ]} size={0.16} color={colors.stack} maxWidth={1.7} />
      <RuntimeLabel text={node.label} position={[-width / 2 + 0.22, height / 2 - 0.5, textZ]} size={0.32} maxWidth={width - 0.85} />
      {node.active && (
        <mesh position={[-width / 2 + 0.1, height / 2 - 0.5, textZ]}>
          <boxGeometry args={[0.04, 0.33, 0.012]} />
          <meshBasicMaterial color={colors.execution} />
        </mesh>
      )}
      {rows.map((slot, index) => (
        <RuntimeSlot key={slot.id} slot={slot} width={width} y={height / 2 - 0.95 - index * 0.32} z={textZ} compact accent={colors.stack} background={worldMaterial.stackSlot} active={slot.id === activeSlotId} reducedMotion={motionReduced} />
      ))}
      </group>
    </group>
  )
}
