import { Text } from '@react-three/drei'
import { useContext, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { colors, runtimeFont } from '../../theme/tokens'
import { identityLabelScale, preloadRuntimeText, RuntimeLabelPolicy, runtimeCharacters } from './runtimeText'

preloadRuntimeText()

export interface RuntimeLabelProps {
  text: string
  position: readonly [number, number, number]
  size?: number
  color?: string
  maxWidth?: number
  align?: 'left' | 'center' | 'right'
  role?: 'identity' | 'metadata' | 'detail'
}

/** Text lives on an entity's front face and remains in the 3D scene. */
export function RuntimeLabel({
  text,
  position,
  size = 0.21,
  color = colors.text,
  maxWidth,
  align = 'left',
  role = 'detail',
}: RuntimeLabelProps) {
  const policy = useContext(RuntimeLabelPolicy)
  const meshRef = useRef<Mesh & { textRenderInfo?: { visibleBounds: number[] } }>(null)
  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const bounds = mesh.textRenderInfo?.visibleBounds
    const width = bounds ? bounds[2] - bounds[0] : maxWidth ?? 1
    const fit = maxWidth ? Math.min(1, maxWidth / Math.max(0.001, width)) : 1
    if (!policy?.current.enabled) { mesh.visible = true; mesh.scale.setScalar(fit); return }
    const { density, pixelsPerUnit, priority } = policy.current
    mesh.visible = role === 'identity' || density === 'full'
    if (role === 'identity') {
      mesh.scale.setScalar(identityLabelScale(size, pixelsPerUnit, width, maxWidth ?? width, priority))
    } else mesh.scale.setScalar(fit)
  })
  return (
    <group position={[...position]} renderOrder={3}>
      <Text
        ref={meshRef}
        font={runtimeFont}
        characters={runtimeCharacters}
        color={color}
        fontSize={size}
        anchorX={align}
        anchorY="middle"
        maxWidth={maxWidth}
        whiteSpace="nowrap"
        overflowWrap="normal"
        renderOrder={3}
      >
        {text}
        <meshBasicMaterial color={color} toneMapped={false} depthTest depthWrite={false} />
      </Text>
    </group>
  )
}
