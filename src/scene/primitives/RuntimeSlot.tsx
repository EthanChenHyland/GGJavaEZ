import type { RuntimeValue } from '../../contracts/runtime'
import type { SceneSlot } from '../../contracts/world'
import { colors } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'

export function formatRuntimeValue(value: RuntimeValue): string {
  switch (value.kind) {
    case 'uninitialized': return '—'
    case 'null': return 'null'
    case 'primitive': return String(value.value)
    case 'stringSummary': return `"${value.value}"`
    case 'reference': return `→ ${value.objectId}`
  }
}

export interface RuntimeSlotProps {
  slot: SceneSlot
  width: number
  y: number
  z: number
  compact?: boolean
  accent: string
  active?: boolean
}

/** A named, typed value set into the information face of a runtime solid. */
export function RuntimeSlot({ slot, width, y, z, compact = false, accent, active = false }: RuntimeSlotProps) {
  const height = compact ? 0.29 : 0.39
  const left = -width / 2 + 0.18
  const typeX = compact ? -0.13 : -0.02
  const valueX = compact ? width / 2 - 1.04 : width / 2 - 0.98
  const textZ = z + 0.014
  const value = slot.displayValue ?? formatRuntimeValue(slot.value)
  const valueColor = active ? colors.mutation : slot.value.kind === 'null' || slot.value.kind === 'uninitialized'
    ? colors.null
    : slot.value.kind === 'reference' ? accent : colors.text

  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0, z]}>
        <boxGeometry args={[width - 0.28, height, 0.018]} />
        <meshBasicMaterial color={colors.panel} />
      </mesh>
      {active && (
        <mesh position={[-width / 2 + 0.16, 0, z + 0.012]}>
          <boxGeometry args={[0.025, height - 0.055, 0.012]} />
          <meshBasicMaterial color={colors.mutation} />
        </mesh>
      )}
      <RuntimeLabel text={slot.name} position={[left, 0, textZ]} size={compact ? 0.17 : 0.2} color={colors.textSecondary} maxWidth={compact ? 1.45 : 0.9} />
      <RuntimeLabel text={slot.javaType} position={[typeX, 0, textZ]} size={compact ? 0.15 : 0.17} color={colors.textMuted} maxWidth={compact ? 1.1 : 0.75} />
      <RuntimeLabel text={value} position={[valueX, 0, textZ]} size={compact ? 0.17 : 0.2} color={valueColor} maxWidth={compact ? 0.88 : 0.8} />
    </group>
  )
}
