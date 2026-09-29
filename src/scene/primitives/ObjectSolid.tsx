import { useLayoutEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import type { ObjectId } from '../../contracts/runtime'
import type { DetailLevel, SceneObjectNode } from '../../contracts/world'
import { colors, motionMs, worldMaterial } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'
import { RuntimeSlot } from './RuntimeSlot'
import { SolidBody } from './SolidBody'
import { useMountSettle, useReducedMotion } from './presentationMotion'

export interface ObjectSolidProps {
  node: SceneObjectNode
  selected: boolean
  related: boolean
  onSelect: (id: ObjectId) => void
  detailLevel?: DetailLevel
  activeSlotId?: string
  reducedMotion?: boolean
}

export function ObjectSolid({ node, selected, related, onSelect, detailLevel = 'meso', activeSlotId, reducedMotion }: ObjectSolidProps) {
  const motionReduced = useReducedMotion(reducedMotion)
  const entranceRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!entranceRef.current || motionReduced) return
    entranceRef.current.scale.set(1, 1, 0.88)
    // Entry state is set only on mount; later semantic updates keep the settled volume.
  }, [])
  useMountSettle(motionMs.quick, motionReduced, (progress) => {
    if (!entranceRef.current) return
    entranceRef.current.scale.z = 0.88 + 0.12 * progress
  })
  const { position, size } = node.anchor
  const [width, height, depth] = size
  const front = depth / 2 + 0.012
  const textZ = front + 0.018
  const rows = detailLevel === 'macro' ? [] : node.fields

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(node.id)
  }

  return (
    <group position={[...position]} onClick={select}>
      <group ref={entranceRef}>
      <SolidBody size={size} accent={colors.heap} bodyColor={worldMaterial.heapBody} selected={selected} related={related} />
      <mesh position={[0, 0, front]}>
        <boxGeometry args={[width - 0.16, height - 0.16, 0.018]} />
        <meshBasicMaterial color={worldMaterial.heapFace} />
      </mesh>
      <RuntimeLabel text="HEAP OBJECT" position={[-width / 2 + 0.22, height / 2 - 0.24, textZ]} size={0.17} color={colors.heap} maxWidth={1.7} />
      <RuntimeLabel text={node.className.split('.').at(-1) ?? node.className} position={[-width / 2 + 0.22, height / 2 - 0.58, textZ]} size={0.37} maxWidth={width - 1.13} />
      <RuntimeLabel text={`#${node.displayId}`} position={[width / 2 - 0.22, height / 2 - 0.58, textZ]} size={0.3} color={colors.textSecondary} align="right" maxWidth={0.8} />
      <mesh position={[0, height / 2 - 0.8, textZ]}>
        <boxGeometry args={[width - 0.36, 0.012, 0.012]} />
        <meshBasicMaterial color={colors.borderStrong} />
      </mesh>
      {rows.map((field, index) => (
        <RuntimeSlot key={field.id} slot={field} width={width} y={height / 2 - 1.07 - index * 0.52} z={textZ} accent={colors.heap} background={worldMaterial.heapSlot} active={field.id === activeSlotId} reducedMotion={motionReduced} />
      ))}
      </group>
    </group>
  )
}
