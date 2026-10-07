import { Edges, RoundedBox } from '@react-three/drei'
import { colors } from '../../theme/tokens'

interface SolidBodyProps {
  size: readonly [number, number, number]
  accent: string
  bodyColor: string
  selected: boolean
  related: boolean
  active?: boolean
  historical?: boolean
}

/** Shared neutral volume: semantic color stays on the boundary. */
export function SolidBody({ size, accent, bodyColor, selected, related, active = false, historical = false }: SolidBodyProps) {
  const edgeOpacity = selected ? 1 : active ? 0.96 : related ? 0.89 : historical ? 0.36 : 0.76

  return <group>
    <RoundedBox args={[...size]} radius={Math.min(0.075, Math.min(...size) / 4)} smoothness={3} castShadow receiveShadow>
      <meshStandardMaterial
        color={bodyColor}
        roughness={0.3}
        metalness={0.24}
        emissive={colors.panelRaised}
        emissiveIntensity={historical && !selected ? 0.06 : 0.12}
      />
      <Edges scale={selected ? 1.012 : 1.007} threshold={15} color={selected ? colors.execution : accent} transparent opacity={edgeOpacity} />
    </RoundedBox>
  </group>
}

/** Opaque inset face and a fine perimeter; emphasis never overlays the text. */
export function SolidFace({ size, color, accent, selected = false, dividerY }: {
  size: readonly [number, number, number]
  color: string
  accent: string
  selected?: boolean
  dividerY?: number
}) {
  const [width, height, depth] = size
  const front = depth / 2 + 0.012
  return <group name="solid-information-face">
    <mesh position={[0, 0, front - 0.003]}>
      <boxGeometry args={[width - 0.14, height - 0.14, 0.018]} />
      <meshBasicMaterial color={selected ? colors.execution : colors.borderStrong} />
    </mesh>
    <mesh position={[0, 0, front]}>
      <boxGeometry args={[width - 0.18, height - 0.18, 0.018]} />
      <meshBasicMaterial color={color} />
    </mesh>
    {dividerY !== undefined && <mesh position={[0, dividerY, front + 0.012]}>
      <boxGeometry args={[width - 0.44, 0.012, 0.008]} />
      <meshBasicMaterial color={selected ? accent : colors.borderStrong} />
    </mesh>}
  </group>
}
