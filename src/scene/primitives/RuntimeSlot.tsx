import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import type { RuntimeValue } from '../../contracts/runtime'
import type { SceneSlot } from '../../contracts/world'
import { colors, motionMs } from '../../theme/tokens'
import { displayJavaType } from '../../runtime/displayType'
import { fitFaceTextHeight, summarizeFaceValue } from './faceText'
import { RuntimeLabel } from './RuntimeLabel'
import { easeOutCubic, useReducedMotion } from './presentationMotion'

export function formatRuntimeValue(value: RuntimeValue): string {
  switch (value.kind) {
    case 'unavailable': return `unavailable (${value.reason})`
    case 'uninitialized': return '—'
    case 'null': return 'null'
    case 'primitive': return value.javaType === 'char' ? JSON.stringify(value.value) : String(value.value)
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
  background: string
  selected?: boolean
  active?: boolean
  reducedMotion?: boolean
  textScale?: number
  onSelect?: () => void
  readable?: boolean
  fitText?: boolean
}

/** A named, typed value set into the information face of a runtime solid. */
export function RuntimeSlot({ slot, width, y, z, compact = false, accent, background, active = false, selected = false, reducedMotion, onSelect, textScale = 1, readable = false, fitText = false }: RuntimeSlotProps) {
  const motionReduced = useReducedMotion(reducedMotion)
  const valueRef = useRef<Group>(null)
  const previousValue = useRef<string | null>(null)
  const elapsedMs = useRef<number | null>(null)
  const invalidate = useThree((state) => state.invalidate)
  const height = compact ? 0.31 : 0.44
  const left = -width / 2 + 0.18
  const typeLabel = displayJavaType(slot.javaType)
  const typeX = compact && typeLabel.length <= 8 ? -0.13 : -0.42
  const valueX = fitText ? width / 2 - 1.44 : compact ? width / 2 - 1.04 : width / 2 - 1.4
  const textZ = z + 0.014
  const value = slot.displayValue ?? formatRuntimeValue(slot.value)
  const preferredValueSize = fitFaceTextHeight((readable ? 0.29 : compact ? 0.22 : 0.24) * textScale, height)
  // A marked summary stays legible; full observed data remains in Inspector.
  const valueText = fitText && slot.value.kind === 'stringSummary' ? summarizeFaceValue(value, Math.max(4, Math.floor(1.2 / (preferredValueSize * 0.6)))) : value
  const valueSize = fitText ? Math.min(preferredValueSize, 1.22 / Math.max(1, Array.from(valueText).length * 0.6)) : preferredValueSize
  const valueColor = active ? colors.mutation : slot.value.kind === 'null' || slot.value.kind === 'uninitialized'
    ? colors.null
    : slot.role === 'return' ? colors.success : slot.value.kind === 'reference' ? accent : colors.text

  useEffect(() => {
    const changed = previousValue.current !== null && previousValue.current !== value
    previousValue.current = value
    if (!valueRef.current) return
    if (changed && active && !motionReduced) {
      elapsedMs.current = 0
      valueRef.current.scale.setScalar(1.06)
      valueRef.current.position.z = 0.035
      invalidate()
    } else {
      elapsedMs.current = null
      valueRef.current.scale.setScalar(1)
      valueRef.current.position.z = 0
    }
  }, [active, invalidate, motionReduced, value])

  useFrame((_, delta) => {
    if (elapsedMs.current === null || !valueRef.current) return
    const next = Math.min(motionMs.quick, elapsedMs.current + Math.min(delta * 1000, 50))
    elapsedMs.current = next === motionMs.quick ? null : next
    const remaining = 1 - easeOutCubic(next / motionMs.quick)
    valueRef.current.scale.setScalar(1 + 0.06 * remaining)
    valueRef.current.position.z = 0.035 * remaining
    if (elapsedMs.current !== null) invalidate()
  })

  return (
    <group position={[0, y, 0]} onClick={onSelect ? (event) => { event.stopPropagation(); onSelect() } : undefined}>
      <mesh position={[0, 0, z]}>
        <boxGeometry args={[width - 0.28, height, 0.018]} />
        <meshBasicMaterial color={background} />
      </mesh>
      {(active || selected) && (
        <mesh position={[-width / 2 + 0.16, 0, z + 0.012]}>
          <boxGeometry args={[selected ? 0.06 : 0.025, height - 0.055, 0.012]} />
          <meshBasicMaterial color={selected ? colors.execution : colors.mutation} />
        </mesh>
      )}
      <RuntimeLabel text={slot.role === 'operand' ? 'call result' : slot.name} position={[left, 0, textZ]} size={preferredValueSize} color={colors.textSecondary} maxWidth={compact ? 1.65 : 0.9} />
      <RuntimeLabel text={typeLabel} position={[typeX, 0, textZ]} size={fitFaceTextHeight((readable ? 0.24 : compact ? 0.18 : 0.2) * textScale, height)} color={colors.textSecondary} maxWidth={compact ? 1.1 : 0.75} />
      <group ref={valueRef} position={[0, 0, 0]}>
        <RuntimeLabel text={valueText} position={[valueX, 0, textZ]} size={valueSize} color={valueColor} maxWidth={compact ? 1.1 : 1.2} />
      </group>
    </group>
  )
}
