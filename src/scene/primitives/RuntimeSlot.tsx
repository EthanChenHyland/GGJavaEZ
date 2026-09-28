import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import type { RuntimeValue } from '../../contracts/runtime'
import type { SceneSlot } from '../../contracts/world'
import { colors, motionMs } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'
import { easeOutCubic, useReducedMotion } from './presentationMotion'

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
  background: string
  active?: boolean
  reducedMotion?: boolean
  readable?: boolean
}

/** A named, typed value set into the information face of a runtime solid. */
export function RuntimeSlot({ slot, width, y, z, compact = false, accent, background, active = false, reducedMotion, readable = false }: RuntimeSlotProps) {
  const motionReduced = useReducedMotion(reducedMotion)
  const valueRef = useRef<Group>(null)
  const previousValue = useRef<string | null>(null)
  const elapsedMs = useRef<number | null>(null)
  const invalidate = useThree((state) => state.invalidate)
  const height = compact ? 0.31 : 0.44
  const left = -width / 2 + 0.18
  const typeX = compact ? -0.13 : -0.42
  const valueX = compact ? width / 2 - 1.04 : width / 2 - 1.4
  const textZ = z + 0.014
  const value = slot.displayValue ?? formatRuntimeValue(slot.value)
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
    <group position={[0, y, 0]}>
      <mesh position={[0, 0, z]}>
        <boxGeometry args={[width - 0.28, height, 0.018]} />
        <meshBasicMaterial color={background} />
      </mesh>
      {active && (
        <mesh position={[-width / 2 + 0.16, 0, z + 0.012]}>
          <boxGeometry args={[0.025, height - 0.055, 0.012]} />
          <meshBasicMaterial color={colors.mutation} />
        </mesh>
      )}
      <RuntimeLabel text={slot.role === 'operand' ? 'call result' : slot.name} position={[left, 0, textZ]} size={readable ? 0.29 : compact ? 0.22 : 0.24} color={colors.textSecondary} maxWidth={compact ? 1.65 : 0.9} />
      <RuntimeLabel text={slot.javaType} position={[typeX, 0, textZ]} size={readable ? 0.24 : compact ? 0.18 : 0.2} color={colors.textSecondary} maxWidth={compact ? 1.1 : 0.75} />
      <group ref={valueRef} position={[0, 0, 0]}>
        <RuntimeLabel text={value} position={[valueX, 0, textZ]} size={readable ? 0.29 : compact ? 0.22 : 0.24} color={valueColor} maxWidth={compact ? 1.1 : 1.2} />
      </group>
    </group>
  )
}
