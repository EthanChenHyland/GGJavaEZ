import { Edges, RoundedBox } from '@react-three/drei'
import { colors } from '../../theme/tokens'

interface SolidBodyProps {
  size: readonly [number, number, number]
  accent: string
  selected: boolean
  related: boolean
  active?: boolean
}

/** Shared neutral volume: semantic color stays on the boundary. */
export function SolidBody({ size, accent, selected, related, active = false }: SolidBodyProps) {
  const edgeOpacity = selected ? 1 : active ? 0.9 : related ? 0.76 : 0.55

  return (
    <RoundedBox args={[...size]} radius={0.055} smoothness={3} castShadow receiveShadow>
      <meshStandardMaterial
        color={colors.panelRaised}
        roughness={0.48}
        metalness={0.18}
        emissive={colors.panel}
        emissiveIntensity={0.32}
      />
      <Edges scale={1.003} threshold={15} color={accent} transparent opacity={edgeOpacity} />
    </RoundedBox>
  )
}
