import { useLayoutEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import type { FrameId } from '../../contracts/runtime'
import type { DetailLevel, SceneFrameNode } from '../../contracts/world'
import { colors, motionMs, worldMaterial, worldUnits } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'
import { RuntimeSlot } from './RuntimeSlot'
import { SolidBody } from './SolidBody'
import { useMountSettle, useReducedMotion } from './presentationMotion'

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
}

export function FrameSolid({ node, selected, related, onSelect, onSelectSlot, detailLevel = 'meso', activeSlotId, selectedSlotId, reducedMotion, readable = false, spacious = false }: FrameSolidProps) {
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
  const rows = detailLevel === 'macro' ? [] : node.slots
  const scoped = Boolean(node.scopes?.length)
  const scopes = node.scopes?.filter((scope) => scope.depth > 0) ?? []
  const innermostScopeDepth = Math.max(0, ...scopes.map((scope) => scope.depth))

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(node.id)
  }

  return (
    <group position={[...position]} onClick={select}>
      <group ref={entranceRef}>
      <SolidBody size={size} accent={colors.stack} bodyColor={worldMaterial.stackBody} selected={selected} related={related} active={node.active} />
      <mesh position={[0, 0, front]}>
        <boxGeometry args={[width - 0.14, height - 0.14, 0.018]} />
        <meshBasicMaterial color={worldMaterial.stackFace} />
      </mesh>
      <RuntimeLabel text={readable && node.active ? 'STACK FRAME · ACTIVE' : 'STACK FRAME'} position={[-width / 2 + 0.22, height / 2 - (spacious ? 0.25 : 0.21), textZ]} size={spacious ? 0.25 : readable ? 0.22 : 0.16} color={node.active && readable ? colors.execution : colors.stack} maxWidth={readable ? width - 0.6 : 1.7} />
      <RuntimeLabel text={node.label} position={[-width / 2 + 0.22, height / 2 - (spacious ? 0.66 : 0.5), textZ]} size={spacious ? 0.44 : readable ? 0.38 : 0.32} maxWidth={width - 0.85} />
      {node.active && (
        <mesh position={[-width / 2 + 0.1, height / 2 - (spacious ? 0.66 : 0.5), textZ]}>
          <boxGeometry args={[readable ? 0.09 : 0.04, 0.33, 0.012]} />
          <meshBasicMaterial color={colors.execution} />
        </mesh>
      )}
      {scopes.map((scope) => {
        const [scopeWidth, scopeHeight, plateDepth] = scope.anchor.size
        const localPosition = scope.anchor.position.map((value, axis) => value - position[axis]) as [number, number, number]
        return (
          <group key={scope.id} position={localPosition}>
            {/* Scale the shared body in Z so its bevel fits a shallow scope plate. */}
            <group scale={[1, 1, plateDepth / worldUnits.frame[2]]}>
              <SolidBody size={[scopeWidth, scopeHeight, worldUnits.frame[2]]} accent={colors.stack} bodyColor={worldMaterial.stackBody} selected={false} related={selected || related} />
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
          compact fitText={scoped} readable={readable || scoped} textScale={spacious ? 1.25 : 1}
          accent={colors.stack} background={worldMaterial.stackSlot}
          selected={slot.id === selectedSlotId} active={slot.id === activeSlotId}
          onSelect={onSelectSlot ? () => onSelectSlot(slot.id) : undefined} reducedMotion={motionReduced} />
      ))}
      </group>
    </group>
  )
}
