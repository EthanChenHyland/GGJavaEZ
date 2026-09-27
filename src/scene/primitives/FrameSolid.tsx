import type { ThreeEvent } from '@react-three/fiber'
import type { FrameId } from '../../contracts/runtime'
import type { DetailLevel, SceneFrameNode } from '../../contracts/world'
import { colors } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'
import { RuntimeSlot } from './RuntimeSlot'
import { SolidBody } from './SolidBody'

export interface FrameSolidProps {
  node: SceneFrameNode
  selected: boolean
  related: boolean
  onSelect: (id: FrameId) => void
  detailLevel?: DetailLevel
  activeSlotId?: string
}

export function FrameSolid({ node, selected, related, onSelect, detailLevel = 'meso', activeSlotId }: FrameSolidProps) {
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
      <SolidBody size={size} accent={colors.stack} selected={selected} related={related} active={node.active} />
      <mesh position={[0, 0, front]}>
        <boxGeometry args={[width - 0.14, height - 0.14, 0.018]} />
        <meshBasicMaterial color={colors.panel} />
      </mesh>
      <RuntimeLabel text="STACK FRAME" position={[-width / 2 + 0.2, height / 2 - 0.17, textZ]} size={0.12} color={colors.stack} maxWidth={1.55} />
      <RuntimeLabel text={node.label} position={[-width / 2 + 0.2, height / 2 - 0.41, textZ]} size={0.25} maxWidth={width - 0.78} />
      {node.active && (
        <mesh position={[-width / 2 + 0.095, height / 2 - 0.41, textZ]}>
          <boxGeometry args={[0.035, 0.26, 0.012]} />
          <meshBasicMaterial color={colors.execution} />
        </mesh>
      )}
      {rows.map((slot, index) => (
        <RuntimeSlot key={slot.id} slot={slot} width={width} y={height / 2 - 0.64 - index * 0.32} z={textZ} compact accent={colors.stack} active={slot.id === activeSlotId} />
      ))}
    </group>
  )
}
