import type { ThreeEvent } from '@react-three/fiber'
import type { ObjectId } from '../../contracts/runtime'
import type { DetailLevel, SceneObjectNode } from '../../contracts/world'
import { colors } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'
import { RuntimeSlot } from './RuntimeSlot'
import { SolidBody } from './SolidBody'

export interface ObjectSolidProps {
  node: SceneObjectNode
  selected: boolean
  related: boolean
  onSelect: (id: ObjectId) => void
  detailLevel?: DetailLevel
  activeSlotId?: string
}

export function ObjectSolid({ node, selected, related, onSelect, detailLevel = 'meso', activeSlotId }: ObjectSolidProps) {
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
      <SolidBody size={size} accent={colors.heap} selected={selected} related={related} />
      <mesh position={[0, 0, front]}>
        <boxGeometry args={[width - 0.16, height - 0.16, 0.018]} />
        <meshBasicMaterial color={colors.panel} />
      </mesh>
      <RuntimeLabel text="HEAP OBJECT" position={[-width / 2 + 0.2, height / 2 - 0.21, textZ]} size={0.13} color={colors.heap} maxWidth={1.6} />
      <RuntimeLabel text={node.className} position={[-width / 2 + 0.2, height / 2 - 0.52, textZ]} size={0.32} maxWidth={width - 1.13} />
      <RuntimeLabel text={`#${node.displayId}`} position={[width / 2 - 0.2, height / 2 - 0.52, textZ]} size={0.25} color={colors.textSecondary} align="right" maxWidth={0.75} />
      <mesh position={[0, height / 2 - 0.72, textZ]}>
        <boxGeometry args={[width - 0.36, 0.012, 0.012]} />
        <meshBasicMaterial color={colors.borderStrong} />
      </mesh>
      {rows.map((field, index) => (
        <RuntimeSlot key={field.id} slot={field} width={width} y={height / 2 - 0.96 - index * 0.46} z={textZ} accent={colors.heap} active={field.id === activeSlotId} />
      ))}
    </group>
  )
}
