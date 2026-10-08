import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import type { RuntimeValue } from '../../contracts/runtime'
import type { SceneSlot } from '../../contracts/world'
import { colors, motionMs } from '../../theme/tokens'
import { displayJavaType } from '../../runtime/displayType'
import { faceColumns, fitFaceTextHeight, fitFaceValue } from './faceText'
import { RuntimeLabel } from './RuntimeLabel'
import { easeOutCubic, useReducedMotion } from './presentationMotion'

export function formatRuntimeValue(value: RuntimeValue): string {
  switch (value.kind) {
    case 'unavailable': return `unavailable (${value.reason})`
    case 'uninitialized': return '—'
    case 'null': return 'null'
    case 'primitive': return value.javaType === 'char' ? JSON.stringify(value.value) : String(value.value)
    case 'stringSummary': return JSON.stringify(value.value)
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
  const { left, nameWidth, typeX, typeWidth, valueX, valueWidth } = faceColumns(width)
  const typeLabel = displayJavaType(slot.javaType)
  const textZ = z + 0.014
  const value = slot.displayValue ?? formatRuntimeValue(slot.value)
  const preferredValueSize = fitFaceTextHeight((readable ? 0.29 : compact ? 0.22 : 0.24) * textScale, height)
  const fittedName = fitFaceValue(slot.role === 'operand' ? 'call result' : slot.name, preferredValueSize, nameWidth)
  const fittedType = fitFaceValue(typeLabel, fitFaceTextHeight((readable ? 0.24 : compact ? 0.18 : 0.2) * textScale, height), typeWidth)
  // A marked summary stays legible; full observed data remains in Inspector.
  const fittedValue = fitText ? fitFaceValue(value, preferredValueSize, valueWidth - 0.1) : { text: value, size: preferredValueSize }
  const valueColor = active ? colors.mutation : slot.value.kind === 'null' || slot.value.kind === 'uninitialized'
    ? colors.null
    : slot.role === 'return' ? colors.mutation : slot.value.kind === 'reference' ? accent : colors.text

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
      <mesh position={[valueX + valueWidth / 2, 0, z + 0.006]}>
        <boxGeometry args={[valueWidth, height - 0.06, 0.012]} />
        <meshBasicMaterial color={colors.panelRaised} />
      </mesh>
      {(active || selected) && (
        <mesh position={[-width / 2 + 0.16, 0, z + 0.012]}>
          <boxGeometry args={[selected ? 0.06 : 0.025, height - 0.055, 0.012]} />
          <meshBasicMaterial color={selected ? colors.execution : colors.mutation} />
        </mesh>
      )}
      <RuntimeLabel text={fittedName.text} position={[left, 0, textZ]} size={fittedName.size} color={colors.text} maxWidth={nameWidth} />
      <RuntimeLabel text={fittedType.text} position={[typeX, 0, textZ]} size={fittedType.size} color={colors.textSecondary} maxWidth={typeWidth} />
      <group ref={valueRef} position={[valueX + valueWidth / 2, 0, 0]}>
        <RuntimeLabel text={fittedValue.text} position={[-valueWidth / 2 + 0.05, 0, textZ]} size={fittedValue.size} color={valueColor} maxWidth={valueWidth - 0.1} />
      </group>
    </group>
  )
}
