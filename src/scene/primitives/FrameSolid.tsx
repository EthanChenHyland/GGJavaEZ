import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import type { FrameId } from '../../contracts/runtime'
import type { DetailLevel, SceneFrameNode } from '../../contracts/world'
import { colors, motionMs, worldMaterial, worldUnits } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'
import { RuntimeSlot } from './RuntimeSlot'
import { SolidBody } from './SolidBody'
import { useMountSettle, useReducedMotion } from './presentationMotion'
import { frameLabelDensity, projectedTextPixels, RuntimeLabelPolicy, type FrameLabelPolicy } from './runtimeText'
import { frameFace, frameTerminalPosition } from './frameFace'

export interface FrameSolidProps {
  node: SceneFrameNode
  selected: boolean
  related: boolean
  onSelect: (id: FrameId) => void
  onSelectSlot?: (id: string) => void
  detailLevel?: DetailLevel
  selectedSlotId?: string
  activeSlotId?: string
  reducedMotion?: boolean
  spacious?: boolean
  readable?: boolean
  /** Focus inspection keeps all fitting face text visible at any distance. */
  inspection?: boolean
}

export function FrameSolid({ node, selected, related, onSelect, onSelectSlot, detailLevel = 'meso', activeSlotId, selectedSlotId, reducedMotion, readable = false, spacious = false, inspection = false }: FrameSolidProps) {
  const motionReduced = useReducedMotion(reducedMotion)
  const entranceRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!entranceRef.current || motionReduced) return
    entranceRef.current.scale.set(1, 1, 0.9)
    // Entry state is set only on mount; later semantic updates keep the settled volume.
  }, [])
  useMountSettle(motionMs.quick, motionReduced, (progress) => {
    if (!entranceRef.current) return
    entranceRef.current.scale.z = 0.9 + 0.1 * progress
  })
  const { position, size } = node.anchor
  const [width, height, depth] = size
  const front = depth / 2 + 0.012
  const textZ = front + 0.018
  // Bound only face plates. Full slots and their ports remain available to
  // Inspector, selection, motion, and reference geometry.
  const { rows, omitted, terminals } = frameFace(node, { readable, spacious, activeSlotId, selectedSlotId })
  const scoped = Boolean(node.scopes?.length)
  const scopes = node.scopes?.filter((scope) => scope.depth > 0) ?? []
  const innermostScopeDepth = Math.max(0, ...scopes.map((scope) => scope.depth))
  const exceptionCaption = node.exceptionState === 'origin' ? 'THROW'
    : node.exceptionState === 'caught' ? 'CATCH' : node.exceptionState === 'finally' ? 'FINALLY'
      : node.exceptionState === 'unwound' || node.invocationStatus === 'unwound' ? 'UNWOUND'
        : node.invocationStatus === 'failed' ? 'FAILED'
        : node.invocationStatus === 'stopped' ? 'LAST RECORDED'
        : node.invocationStatus === 'completed' ? 'COMPLETED' : null
  const historical = Boolean(node.historical)
  const accent = node.exceptionState || node.invocationStatus === 'unwound' || node.invocationStatus === 'failed'
    ? colors.exception : historical && !selected && !related ? colors.textMuted : colors.stack
  const metadata = exceptionCaption ? `${node.exceptionState ? 'STACK FRAME' : 'INVOCATION'} · ${exceptionCaption}` : readable && node.active ? 'STACK FRAME · ACTIVE' : 'STACK FRAME'
  // Focus inspection always exposes face text; free exploration retains the
  // existing projected label-density policy.
  const labelPolicy = useRef<FrameLabelPolicy>({ enabled: false, density: 'full', pixelsPerUnit: 0, priority: false })
  labelPolicy.current.enabled = !inspection && readable && !spacious && !scoped
  labelPolicy.current.priority = node.active || selected || node.slots.some(slot => slot.id === selectedSlotId)
  useFrame(({ camera, size: viewport, invalidate }) => {
    const policy = labelPolicy.current
    if (!policy.enabled) return
    const pixelsPerUnit = projectedTextPixels(camera, viewport, [position[0], position[1], position[2] + textZ], 1)
    const next = frameLabelDensity(pixelsPerUnit * 0.29, policy.density, policy.priority)
    if (next !== policy.density) { policy.density = next; invalidate() }
    policy.pixelsPerUnit = pixelsPerUnit
  })

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(node.id)
  }

  return (
    <RuntimeLabelPolicy.Provider value={labelPolicy}>
    <group position={[...position]} onClick={select}>
      <group ref={entranceRef}>
      <SolidBody size={size} accent={accent} bodyColor={historical ? worldMaterial.historyBody : worldMaterial.stackBody} selected={selected} related={related} active={node.active} historical={node.historical} />
      <mesh position={[0, 0, front]}>
        <boxGeometry args={[width - 0.14, height - 0.14, 0.018]} />
        <meshBasicMaterial color={historical ? worldMaterial.historyFace : worldMaterial.stackFace} />
      </mesh>
      <RuntimeLabelPolicy.Provider value={omitted.length ? null : labelPolicy}>
        <group name="frame-face-metadata" onClick={select}>
          <RuntimeLabel role="metadata" text={omitted.length ? `${metadata} · +${omitted.length} values · Inspector` : metadata} position={[-width / 2 + 0.22, height / 2 - (spacious ? 0.25 : 0.21), textZ]} size={spacious ? 0.25 : readable ? 0.22 : 0.16} color={node.exceptionState || node.invocationStatus === 'unwound' || node.invocationStatus === 'failed' ? colors.exception : node.active && readable ? colors.execution : colors.stack} maxWidth={omitted.length || readable || exceptionCaption ? width - 0.6 : 1.7} />
        </group>
      </RuntimeLabelPolicy.Provider>
      <RuntimeLabel role="identity" text={node.label} position={[-width / 2 + 0.22, height / 2 - (spacious ? 0.66 : 0.5), textZ]} size={spacious ? 0.44 : readable ? 0.38 : 0.32} maxWidth={width - 0.85} />
      {node.active && (
        <mesh position={[-width / 2 + 0.1, height / 2 - (spacious ? 0.66 : 0.5), textZ]}>
          <boxGeometry args={[readable ? 0.09 : 0.04, 0.33, 0.012]} />
          <meshBasicMaterial color={colors.execution} />
        </mesh>
      )}
      {(node.exceptionState || node.invocationStatus === 'unwound' || node.invocationStatus === 'failed') && <mesh position={[width / 2 - 0.18, height / 2 - 0.22, textZ]}>
        <boxGeometry args={[0.07, 0.22, 0.012]} />
        <meshBasicMaterial color={colors.exception} />
      </mesh>}
      {scopes.map((scope) => {
        const [scopeWidth, scopeHeight, plateDepth] = scope.anchor.size
        const localPosition = scope.anchor.position.map((value, axis) => value - position[axis]) as [number, number, number]
        return (
          <group key={scope.id} position={localPosition}>
            {/* Scale the shared body in Z so its bevel fits a shallow scope plate. */}
            <group scale={[1, 1, plateDepth / worldUnits.frame[2]]}>
              <SolidBody size={[scopeWidth, scopeHeight, worldUnits.frame[2]]} accent={colors.stack} bodyColor={historical ? worldMaterial.historyBody : worldMaterial.stackBody} selected={false} related={selected || related} />
            </group>
            {detailLevel !== 'macro' && (
              <RuntimeLabel text={scope.label} position={[-scopeWidth / 2 + worldUnits.scope.inset, scopeHeight / 2 - worldUnits.scope.inset, plateDepth / 2 + 0.014]} size={0.23} color={node.active && scope.depth === innermostScopeDepth ? colors.execution : colors.stack} maxWidth={scopeWidth - worldUnits.scope.inset * 2} />
            )}
          </group>
        )
      })}
      {rows.map((slot) => (
        <RuntimeSlot key={slot.id} slot={slot}
          width={width - (scoped ? (slot.scopeDepth ?? 0) * worldUnits.scope.inset * 2 : 0)}
          y={slot.port[1] - position[1]} z={scoped ? slot.port[2] - position[2] : textZ}
          compact fitText={scoped || inspection} readable={readable || scoped} textScale={inspection ? 1.45 : spacious ? 1.25 : 1}
          accent={colors.stack} background={historical ? worldMaterial.historySlot : worldMaterial.stackSlot}
          selected={slot.id === selectedSlotId} active={slot.id === activeSlotId}
          onSelect={onSelectSlot ? () => onSelectSlot(slot.id) : undefined} reducedMotion={motionReduced} />
      ))}
      {/* Named terminals stay at the exact reserved ports, including X/Z.
          They carry no replacement plate or reference endpoint. */}
      <RuntimeLabelPolicy.Provider value={null}>
        {terminals.map((slot) => (
          <group key={slot.id} name={`slot-terminal:${slot.id}`} position={[...frameTerminalPosition(slot, node)]}
            onClick={onSelectSlot ? (event) => { event.stopPropagation(); onSelectSlot(slot.id) } : select}>
            <mesh>
              <boxGeometry args={[0.09, 0.09, 0.09]} />
              <meshBasicMaterial color={slot.id === selectedSlotId ? colors.execution : slot.id === activeSlotId ? colors.mutation : colors.stack} />
            </mesh>
            <RuntimeLabel text={slot.name} position={[0.12, 0, 0]} size={0.18} maxWidth={2.2} color={slot.id === selectedSlotId ? colors.execution : slot.id === activeSlotId ? colors.mutation : colors.textSecondary} />
          </group>
        ))}
      </RuntimeLabelPolicy.Provider>
      </group>
    </group>
    </RuntimeLabelPolicy.Provider>
  )
}
