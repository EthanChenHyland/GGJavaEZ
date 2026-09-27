import { Text } from '@react-three/drei'
import { colors, runtimeFont } from '../../theme/tokens'

export interface RuntimeLabelProps {
  text: string
  position: readonly [number, number, number]
  size?: number
  color?: string
  maxWidth?: number
  align?: 'left' | 'center' | 'right'
}

/** Text lives on an entity's front face and remains in the 3D scene. */
export function RuntimeLabel({
  text,
  position,
  size = 0.21,
  color = colors.text,
  maxWidth,
  align = 'left',
}: RuntimeLabelProps) {
  return (
    <Text
      font={runtimeFont}
      position={[...position]}
      color={color}
      fontSize={size}
      anchorX={align}
      anchorY="middle"
      maxWidth={maxWidth}
      whiteSpace="nowrap"
      overflowWrap="normal"
      renderOrder={2}
    >
      {text}
      <meshBasicMaterial color={color} toneMapped={false} depthTest />
    </Text>
  )
}
