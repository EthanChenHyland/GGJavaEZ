import { Edges, RoundedBox } from '@react-three/drei'
import { BackSide } from 'three'
import { colors } from '../../theme/tokens'

interface SolidBodyProps {
  size: readonly [number, number, number]
  accent: string
  bodyColor: string
  selected: boolean
  related: boolean
  active?: boolean
}

/** Shared neutral volume: semantic color stays on the boundary. */
export function SolidBody({ size, accent, bodyColor, selected, related, active = false }: SolidBodyProps) {
  const edgeOpacity = selected ? 1 : active ? 0.96 : related ? 0.89 : 0.76

  return <group>
    <RoundedBox args={[...size]} radius={0.075} smoothness={3} castShadow receiveShadow>
      <meshStandardMaterial
        color={bodyColor}
        roughness={0.34}
        metalness={0.2}
        emissive={colors.panelRaised}
        emissiveIntensity={0.25}
      />
      <Edges scale={1.007} threshold={15} color={accent} transparent opacity={edgeOpacity} />
    </RoundedBox>
    {selected && <RoundedBox args={[...size]} scale={[1.035, 1.05, 1.055]} radius={0.075} smoothness={3}>
      <meshBasicMaterial color={accent} side={BackSide} transparent opacity={0.82} depthWrite={false} />
    </RoundedBox>}
  </group>
}
