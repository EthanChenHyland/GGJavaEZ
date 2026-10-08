import { useEffect, useMemo, useRef } from 'react'
import { Line } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CubicBezierCurve3, Quaternion, Vector3, type Group } from 'three'
import type { Selection } from '../../contracts/interaction'
import type { ArrayActivity, ArrayMutation } from '../../contracts/runtime'
import type { DetailLevel, SceneArrayCell, SceneObjectNode, Vec3 } from '../../contracts/world'
import { colors, easeOutCubic, line, motionMs, worldMaterial, worldUnits } from '../../theme/tokens'
import { displayJavaType } from '../../runtime/displayType'
import { RuntimeLabel } from './RuntimeLabel'
import { formatRuntimeValue } from './RuntimeSlot'
import { SolidBody, SolidFace } from './SolidBody'
import { useReducedMotion } from './presentationMotion'
import { fitFaceValue } from './faceText'
import { arrayHeaderAnchor } from '../../world/arrayGeometry'

export interface ArraySolidProps {
  node: SceneObjectNode
  selection: Selection
  onSelect: (selection: NonNullable<Selection>) => void
  guided: boolean
  playing: boolean
  activity?: ArrayActivity | null
  mutations?: ArrayMutation[]
  presentation?: 'spatial' | 'theater'
  detailLevel?: DetailLevel
  origins?: Record<string, Vec3>
  /** Observed source-slot labels supplied by the scene composition seam. */
  originLabels?: Record<string, string>
  inspection?: boolean
}

interface ValueFlow {
  eventId: string
  from: Vec3
  to: Vec3
  value: string
  accent: string
}

/** A causal overlay, never a replacement for the committed value on the target. */
function ArrayValueFlow({ flow, guided, playing, theater }: {
  flow: ValueFlow
  guided: boolean
  playing: boolean
  theater: boolean
}) {
  const reduced = useReducedMotion()
  const marker = useRef<Group>(null)
  const elapsed = useRef<number>(motionMs.deliberate)
  const invalidate = useThree((state) => state.invalidate)
  const curve = useMemo(() => {
    const from = new Vector3(...flow.from)
    const to = new Vector3(...flow.to)
    // Lift over the rail without relocating either semantic endpoint.
    const lift = Math.max(from.y, to.y) + Math.min(1.5, Math.max(0.35, from.distanceTo(to) * 0.15))
    return new CubicBezierCurve3(from,
      new Vector3(from.x, lift, from.z + 0.35),
      new Vector3(to.x, lift, to.z + 0.35), to)
  }, [flow.from, flow.to])
  const points = useMemo(() => curve.getPoints(24), [curve])
  const arrow = useMemo(() => {
    const tangent = curve.getTangent(1).normalize()
    return {
      position: curve.getPoint(1).addScaledVector(tangent, -0.12),
      rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tangent),
    }
  }, [curve])

  useEffect(() => {
    elapsed.current = guided && playing && !reduced ? 0 : motionMs.deliberate
    if (marker.current) {
      marker.current.visible = elapsed.current === 0
      marker.current.position.set(...flow.from)
    }
    invalidate()
  }, [flow.eventId, curve, guided, playing, reduced, invalidate, flow.from])

  useFrame((_, delta) => {
    if (!marker.current || elapsed.current >= motionMs.deliberate) return
    elapsed.current = Math.min(motionMs.deliberate, elapsed.current + Math.min(delta * 1000, 50))
    marker.current.position.copy(curve.getPoint(easeOutCubic(elapsed.current / motionMs.deliberate)))
    marker.current.visible = elapsed.current < motionMs.deliberate
    // The last requested frame also paints the hidden marker; then demand rendering rests.
    invalidate()
  })

  return <group>
    {theater && <>
      <Line points={points} color={flow.accent} lineWidth={line.referenceDefaultPx} transparent opacity={0.8} />
      <mesh position={arrow.position} quaternion={arrow.rotation}>
        <coneGeometry args={[0.1, 0.24, 12]} />
        <meshBasicMaterial color={flow.accent} toneMapped={false} />
      </mesh>
    </>}
    <group ref={marker} visible={false}>
      <mesh><boxGeometry args={[0.55, 0.42, 0.08]} /><meshBasicMaterial color={worldMaterial.heapSlot} /></mesh>
      <RuntimeLabel text={flow.value} position={[0, 0, 0.055]} size={0.28} align="center" color={flow.accent} />
    </group>
  </group>
}

function ArrayCell({ cell, selected, related, accent, active, detailLevel, theater, onSelect }: {
  cell: SceneArrayCell
  selected: boolean
  related: boolean
  accent: string
  active: boolean
  detailLevel: DetailLevel
  theater: boolean
  onSelect: ArraySolidProps['onSelect']
}) {
  const [width, height, depth] = cell.anchor.size
  const textZ = depth / 2 + 0.03
  const readable = detailLevel !== 'macro' || selected || related || active
  const value = fitFaceValue(cell.displayValue ?? formatRuntimeValue(cell.value), theater ? 0.54 : 0.43, width - 0.32)
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect({ kind: 'slot', id: cell.id })
  }

  return <group position={[...cell.anchor.position]} onClick={select}>
    <SolidBody size={cell.anchor.size} accent={accent} bodyColor={worldMaterial.heapBody}
      selected={selected} related={related} active={active} />
    <SolidFace size={cell.anchor.size} color={worldMaterial.heapFace} accent={accent} selected={selected} />
    {readable && <>
      <RuntimeLabel text={`[${cell.index}]`} position={[0, height / 2 - 0.19, textZ]}
        size={theater ? 0.24 : 0.2} maxWidth={width - 0.32} align="center" color={active ? accent : colors.textSecondary} />
      <RuntimeLabel text={value.text} position={[0, -0.12, textZ]}
        size={Math.min(value.size, height * 0.38)} align="center" maxWidth={width - 0.32}
        color={active ? accent : colors.text} />
    </>}
  </group>
}

/** Cells consume reserved WORLD anchors; the parent anchor is a boundary, not another body. */
export function ArraySolid({ node, selection, onSelect, guided, playing, activity,
  mutations = [], presentation = 'spatial', detailLevel = 'meso', origins = {}, originLabels = {}, inspection = false }: ArraySolidProps) {
  const cells = node.array?.cells ?? []
  const theater = presentation === 'theater'
  const selected = selection?.kind === 'object' && selection.id === node.id
  const selectedCell = selection?.kind === 'slot' ? cells.find((cell) => cell.id === selection.id) : undefined
  const showDetails = detailLevel !== 'macro' || selected || !!selectedCell || inspection
  const current = activity?.objectId === node.id ? activity : null
  const [x, y, z] = node.anchor.position
  const [width, height, depth] = node.anchor.size
  const top = y + height / 2
  // The identity stays attached to its originating heap boundary in both representations.
  const header = arrayHeaderAnchor(node.anchor)
  const headerWidth = header.size[0]
  const headerY = header.position[1]
  const headerDepth = header.size[2]
  const headerFront = headerDepth / 2 + 0.03
  const cellAt = (index: number) => cells.find((cell) => cell.index === index)
  const compare = current?.kind === 'compare' ? current : null
  const write = current?.kind === 'write' ? current : null
  const read = current?.kind === 'read' ? current : null
  const left = compare ? cellAt(compare.indices[0]) : undefined
  const right = compare ? cellAt(compare.indices[1]) : undefined

  let flow: ValueFlow | null = null
  if (write) {
    const target = cellAt(write.index)
    const origin = write.from?.kind === 'element' ? cellAt(write.from.index)?.port : write.from?.kind === 'slot' ? origins[write.from.slotId] : undefined
    if (target && origin) flow = { eventId: write.eventId, from: origin, to: target.port,
      value: formatRuntimeValue(write.after), accent: colors.mutation }
  } else if (read?.destinationSlotId) {
    const origin = cellAt(read.index)
    const target = origins[read.destinationSlotId]
    if (origin && target) flow = { eventId: read.eventId, from: origin.port, to: target,
      value: formatRuntimeValue(read.value), accent: colors.execution }
  }

  let explanation = ''
  let explanationColor: string = colors.execution
  if (compare) {
    explanation = `[${compare.indices[0]}] ${formatRuntimeValue(compare.values[0])} > [${compare.indices[1]}] ${formatRuntimeValue(compare.values[1])}  =  ${compare.result ? 'true' : 'false'}`
  } else if (write) {
    const origin = write.from?.kind === 'element' ? `[${write.from.index}]` : write.from?.kind === 'slot' ? originLabels[write.from.slotId] ?? 'local' : 'observed store'
    explanation = `${origin} → [${write.index}]  ·  ${formatRuntimeValue(write.before)} → ${formatRuntimeValue(write.after)}`
    explanationColor = colors.mutation
  } else if (read) {
    explanation = `read [${read.index}]  =  ${formatRuntimeValue(read.value)}${read.destinationSlotId ? ` → ${originLabels[read.destinationSlotId] ?? 'local'}` : ''}`
  }
  let recent: ArrayMutation | undefined
  if (selectedCell && detailLevel === 'micro') {
    for (let index = mutations.length - 1; index >= 0; index--) {
      const mutation = mutations[index]
      if (mutation.objectId === node.id && mutation.index === selectedCell.index) {
        recent = mutation
        break
      }
    }
  }

  const selectObject = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect({ kind: 'object', id: node.id })
  }

  if (!node.array) return null
  return <group>
    <group position={[x, headerY, z]} onClick={selectObject}>
      <SolidBody size={[headerWidth, worldUnits.arrayHeader.height, headerDepth]} accent={colors.heap}
        bodyColor={worldMaterial.heapBody} selected={selected} related={!!selectedCell} />
      <SolidFace size={[headerWidth, worldUnits.arrayHeader.height, headerDepth]} color={worldMaterial.heapFace} accent={colors.heap} selected={selected} />
      <RuntimeLabel role="identity" text={`${displayJavaType(node.className)}  #${node.displayId}`} position={[-headerWidth / 2 + 0.2, 0.13, headerFront]}
        size={0.3} maxWidth={headerWidth - 1.9} />
      <RuntimeLabel text={`length ${node.array.length}`} position={[headerWidth / 2 - 0.2, 0.13, headerFront]}
        size={0.23} maxWidth={1.3} color={colors.textSecondary} align="right" />
      {showDetails && <RuntimeLabel role="metadata" text="HEAP · ARRAY" position={[-headerWidth / 2 + 0.2, -0.17, headerFront]} size={0.16} color={colors.heap} />}
      {showDetails && cells.length < node.array.length && <RuntimeLabel
        text={`${cells.length} shown · inspect`} position={[headerWidth / 2 - 0.2, -0.17, headerFront]} size={0.15}
        maxWidth={headerWidth / 2 - 0.25} align="right" color={colors.textSecondary} />}
    </group>
    {cells.map((cell) => {
      const writing = guided && write?.index === cell.index
      const active = guided && (writing || read?.index === cell.index || !!compare?.indices.includes(cell.index))
      return <ArrayCell key={cell.id} cell={cell} selected={selected || selectedCell?.id === cell.id}
        related={!!selectedCell || selected} accent={writing ? colors.mutation : active ? colors.execution : colors.heap}
        active={active} detailLevel={inspection ? 'micro' : detailLevel} theater={theater} onSelect={onSelect} />
    })}
    {showDetails && theater && guided && explanation && <RuntimeLabel text={explanation} position={[x, top + 0.93, z + depth / 2 + 0.05]}
      size={0.28} color={explanationColor} maxWidth={width} align="center" />}
    {showDetails && theater && guided && left && right && <>
      <Line points={[
        [left.anchor.position[0], top + 0.25, left.port[2]],
        [left.anchor.position[0], top + 0.5, left.port[2]],
        [right.anchor.position[0], top + 0.5, right.port[2]],
        [right.anchor.position[0], top + 0.25, right.port[2]],
      ]} color={colors.execution} lineWidth={line.referenceDefaultPx} transparent opacity={0.8} />
      {[left, right].map((cell, index) => <RuntimeLabel key={`${cell.id}:${index}`}
        text={index === 0 ? 'left' : 'right'}
        position={[cell.anchor.position[0], cell.anchor.position[1] - cell.anchor.size[1] / 2 - 0.27, cell.port[2]]}
        size={0.30} color={colors.execution} align="center" />)}
    </>}
    {recent && <RuntimeLabel text={`[${recent.index}] last write: ${formatRuntimeValue(recent.before)} → ${formatRuntimeValue(recent.after)}`}
      position={[x, y - height / 2 + 0.17, z + depth / 2 + 0.05]} size={0.2} align="center" color={colors.textSecondary} />}
    {showDetails && guided && flow && <ArrayValueFlow flow={flow} guided={guided} playing={playing} theater={theater} />}
  </group>
}
