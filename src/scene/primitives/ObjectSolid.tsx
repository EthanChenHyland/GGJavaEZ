import { useLayoutEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import type { ObjectId } from '../../contracts/runtime'
import type { DetailLevel, SceneClassNode, SceneObjectNode } from '../../contracts/world'
import { colors, motionMs, worldMaterial } from '../../theme/tokens'
import { RuntimeLabel } from './RuntimeLabel'
import { RuntimeSlot, formatRuntimeValue } from './RuntimeSlot'
import { SolidBody, SolidFace } from './SolidBody'
import { useMountSettle, useReducedMotion } from './presentationMotion'
import { fitFaceValue } from './faceText'

export interface ObjectSolidProps {
  node: SceneObjectNode
  selected: boolean
  related: boolean
  onSelect: (id: ObjectId) => void
  onSelectSlot?: (id: string) => void
  selectedSlotId?: string
  detailLevel?: DetailLevel
  activeSlotId?: string
  reducedMotion?: boolean
  inspection?: boolean
  animateEntry?: boolean
}

export function ObjectSolid(props: ObjectSolidProps) {
  return <StorageSolid {...props} />
}

export type StorageSolidProps = Omit<ObjectSolidProps, 'node'> & { node: SceneObjectNode | SceneClassNode }

/** Instance and class storage share faces/materials while preserving their real kind. */
export function StorageSolid({ node, selected, related, onSelect, onSelectSlot, selectedSlotId, activeSlotId, reducedMotion, inspection = false, animateEntry = true, detailLevel = 'meso' }: StorageSolidProps) {
  const motionReduced = useReducedMotion(reducedMotion)
  const entranceRef = useRef<Group>(null)
  const entryAllowed = useRef(animateEntry)
  useLayoutEffect(() => {
    if (!entranceRef.current || motionReduced || !entryAllowed.current) return
    entranceRef.current.scale.set(1, 1, 0.88)
    // Entry state is set only on mount; later semantic updates keep the settled volume.
  }, [])
  useMountSettle(motionMs.quick, motionReduced || !entryAllowed.current, (progress) => {
    if (!entranceRef.current) return
    entranceRef.current.scale.z = 0.88 + 0.12 * progress
  })
  const { position, size } = node.anchor
  const [width, height, depth] = size
  const front = depth / 2 + 0.012
  const textZ = front + 0.018
  const showDetails = detailLevel !== 'macro' || inspection || selected || node.fields.some(field => field.id === selectedSlotId)
  // The locked six-row budget uses actual XYZ containment, independently of
  // current field count, so retired observations cannot change surviving rows.
  const rows = node.fields.filter(field => {
    if (!Object.hasOwn(node.anchor.ports, field.id)) return false
    const rowY = field.port[1] - position[1]
    return rowY + 0.22 <= height / 2 - 0.84 && rowY - 0.22 >= -height / 2 + 0.07
  }).slice(0, 6)
  const rowIds = new Set(rows.map(field => field.id))
  const priorityOverflow = node.fields.filter(field => (field.id === selectedSlotId || field.id === activeSlotId)
    && !rowIds.has(field.id) && Object.hasOwn(node.anchor.ports, field.id))
  const unreservedSelected = node.fields.find(field => field.id === selectedSlotId && !Object.hasOwn(node.anchor.ports, field.id))
  const hidden = node.fields.length - rows.length
  const baseHeading = node.kind === 'class' ? 'CLASS STATE' : node.summaryLabel ?? 'HEAP OBJECT'
  const heading = showDetails && hidden && rows.length ? `${baseHeading} · +${hidden} values · Inspector` : baseHeading
  const accent = node.kind === 'class' ? colors.textSecondary : colors.heap
  const bodyColor = node.kind === 'class' ? worldMaterial.historyBody : worldMaterial.heapBody
  const faceColor = node.kind === 'class' ? worldMaterial.historyFace : worldMaterial.heapFace
  const slotColor = node.kind === 'class' ? worldMaterial.historySlot : worldMaterial.heapSlot
  const title = node.className.split('.').at(-1) ?? node.className

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect(node.id)
  }

  return (
    <group position={[...position]} onClick={select}>
      <group ref={entranceRef}>
      <SolidBody size={size} accent={accent} bodyColor={bodyColor} selected={selected} related={related} />
      <SolidFace size={size} color={faceColor} accent={accent} selected={selected} dividerY={height / 2 - 0.8} />
      <RuntimeLabel role="metadata" text={heading} position={[-width / 2 + 0.22, height / 2 - 0.24, textZ]} size={0.17} color={accent} maxWidth={width - 0.44} />
      <RuntimeLabel role="identity" text={title} position={[-width / 2 + 0.22, height / 2 - 0.58, textZ]} size={0.37} maxWidth={node.kind === 'class' ? width - 0.44 : width - 1.13} />
      {node.kind === 'object' && <RuntimeLabel role="identity" text={`#${node.displayId}`} position={[width / 2 - 0.22, height / 2 - 0.58, textZ]} size={0.3} color={colors.textSecondary} align="right" maxWidth={0.8} />}
      {showDetails && rows.map((field) => (
        <RuntimeSlot key={field.id} slot={field} width={width} y={field.port[1] - position[1]} z={textZ} accent={accent} background={slotColor} active={field.id === activeSlotId} selected={field.id === selectedSlotId} onSelect={onSelectSlot ? () => onSelectSlot(field.id) : undefined} reducedMotion={motionReduced} textScale={inspection ? 1.55 : 1} fitText />
      ))}
      {showDetails && priorityOverflow.map(field => {
        const port = node.anchor.ports[field.id]
        const local = port.map((value, axis) => value - position[axis]) as [number, number, number]
        const label = fitFaceValue(`${field.name}: ${field.displayValue ?? formatRuntimeValue(field.value)}`, 0.2, width - 0.44)
        return <group key={field.id} name={`slot-terminal:${field.id}`} position={local}
          onClick={onSelectSlot ? event => { event.stopPropagation(); onSelectSlot(field.id) } : select}>
          <mesh><boxGeometry args={[0.07, 0.07, 0.07]} /><meshBasicMaterial color={field.id === selectedSlotId ? colors.execution : colors.mutation} /></mesh>
          <RuntimeLabel text={label.text} position={[0.12, 0, 0]} size={label.size} maxWidth={width - 0.44}
            color={field.id === selectedSlotId ? colors.execution : colors.mutation} />
        </group>
      })}
      {/* An unreserved selected value is an owner caption, never a new port or row. */}
      {unreservedSelected && <group name={`unreserved-selection:${unreservedSelected.id}`}>
        <RuntimeLabel text={`Selected ${unreservedSelected.name}: ${fitFaceValue(unreservedSelected.displayValue ?? formatRuntimeValue(unreservedSelected.value), 0.2, width / 2).text} · Inspector`}
          position={[-width / 2 + 0.22, height / 2 + 0.22, textZ]} size={0.2} maxWidth={width - 0.44} color={colors.execution} />
      </group>}
      {(!showDetails || !rows.length && (hidden > 0 || node.kind === 'class' || node.summaryLabel)) && <RuntimeLabel
        text={!showDetails ? `${node.fields.length} observed ${node.kind === 'class' ? 'static fields' : 'values'}` : hidden ? `+${hidden} observed values · inspect` : 'No observed entries'}
        position={[-width / 2 + 0.22, showDetails ? -height / 2 + 0.25 : height / 2 - 1.07, textZ]}
        size={0.2} color={colors.textSecondary} maxWidth={width - 0.44} />}
      </group>
    </group>
  )
}
