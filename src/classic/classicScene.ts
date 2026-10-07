import { sceneSourceId } from '../contracts/world'
import type { Selection } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneFrameNode, SceneModel, SceneSlot } from '../contracts/world'
import { worldUnits } from '../theme/tokens'

export interface DiagramRect { x: number; y: number; width: number; height: number }
export interface DiagramSlot { slot: SceneSlot; rect: DiagramRect; value: string }
export interface DiagramArrayCell extends DiagramSlot { index: number }
export interface DiagramArray {
  length: number
  name: string | null
  cells: DiagramArrayCell[]
  /** Verified against the current values; completion is decided by the shared event. */
  ascending: boolean
  observedCount: number
  omittedCount: number
  grid: boolean
}
export interface DiagramScope {
  id: string
  label: string
  depth: number
  slotIds: string[]
  rect: DiagramRect
  headingHeight: number
}
export interface DiagramEntity {
  id: string
  kind: 'frame' | 'object' | 'class'
  label: string
  active: boolean
  invocationStatus?: SceneFrameNode['invocationStatus']
  exceptionState?: SceneFrameNode['exceptionState']
  initialization?: NonNullable<SceneModel['classes']>[number]['initialization']
  rect: DiagramRect
  slots: DiagramSlot[]
  scopes?: DiagramScope[]
  headingHeight?: number
  array?: DiagramArray
}
export interface DiagramReference {
  id: string
  sourceEntityId: string
  sourceSlotId: string
  targetObjectId: string
  label: string
  historical?: boolean
  from: readonly [number, number]
  to: readonly [number, number]
  path: string
}
export interface DiagramReturn {
  eventId: string
  fromFrameId: string
  toFrameId: string
  toSlotId: string
  fromLabel: string
  toLabel: string
  value: string
  expression?: string
  from: readonly [number, number]
  to: readonly [number, number]
  path: string
}
export interface ClassicScene {
  entities: DiagramEntity[]
  references: DiagramReference[]
  deepStack: boolean
  scoped: boolean
  returnTransfer: DiagramReturn | null
  arrayActivity: { eventId: string; objectId: string; slotIds: string[]; destinationSlotId?: string; label: string } | null
  arrayWrites: DiagramArrayWrite[]
}

export interface DiagramArrayWrite {
  eventId: string
  objectId: string
  slotId: string
  sourceSlotId: string
  before: string
  after: string
  label: string
  from: readonly [number, number]
  to: readonly [number, number]
  path: string
}

/** Entire-trace depth reserves these bands; live counts never change their positions. */
export function classicFrameRect(depth: number, stackDepth: number, slotCount = 3): DiagramRect {
  return stackDepth > 1
    ? { x: 104, y: 64 + (stackDepth - depth) * 88, width: 420, height: 84 }
    : { x: 72, y: 340 - depth * 212, width: 356, height: 80 + Math.max(3, slotCount) * 40 }
}

export function slotValue(slot: SceneSlot): string {
  if (slot.displayValue !== undefined) return slot.displayValue
  if (slot.role === 'return' && slot.value.kind === 'uninitialized') return 'pending'
  switch (slot.value.kind) {
    case 'unavailable': return `unavailable (${slot.value.reason})`
    case 'uninitialized': return '—'
    case 'null': return 'null'
    case 'primitive': return String(slot.value.value)
    case 'stringSummary': return `"${slot.value.value}"`
    case 'reference': return `→ ${slot.value.objectId}`
  }
}

/** Presentation projection only. Fixed depth bands keep callers in place as callees enter/return. */
export function buildClassicScene(scene: SceneModel, event: TraceEvent | null = null, selection: Selection = null): ClassicScene {
  const stackDepth = scene.stackDepth ?? 1
  const deepStack = stackDepth > 1
  const scoped = scene.layoutKind === 'scoped'
  // Each invocation uses a permanent call band. Scale its reserved world height, never
  // its live row count, to preserve lexical gaps and fit separated caller/callee bands.
  const scopedRect = (depth: number): DiagramRect => ({ x: 72, y: depth === 0 ? 260 : 45, width: 420, height: depth === 0 ? 300 : 200 })
  const arrayLayout = scene.layoutKind === 'array' || scene.objects.some((object) => object.array)
  const entities: DiagramEntity[] = [
    ...scene.frames.map((frame): DiagramEntity => {
      const sibling = scene.frames.filter((candidate) => candidate.depth === frame.depth).findIndex((candidate) => candidate.id === frame.id)
      const rect = sibling > 0 && !scoped
        ? { ...classicFrameRect(frame.depth, stackDepth, frame.slots.length), x: 72 + sibling * (stackDepth > 1 ? 450 : 380) }
        : scoped
        ? scopedRect(frame.depth)
        : arrayLayout && !deepStack
        ? { x: 72, y: 260 - frame.depth * 212, width: 356, height: 240 }
        : classicFrameRect(frame.depth, stackDepth, frame.slots.length)
      const scopedScale = rect.height / frame.anchor.size[1]
      const scopedY = (worldY: number) => rect.y + (frame.anchor.position[1] + frame.anchor.size[1] / 2 - worldY) * scopedScale
      const headingHeight = scoped ? Math.min(64, 0.82 * scopedScale) : deepStack ? 26 : 64
      const rowHeight = scoped ? worldUnits.scope.rowGap * scopedScale : deepStack ? 18 : 40
      const reservedSlots = arrayLayout ? Object.keys(frame.anchor.ports) : []
      return {
        id: frame.id, kind: 'frame', label: frame.label, active: frame.active, invocationStatus: frame.invocationStatus, exceptionState: frame.exceptionState, rect,
        ...(scoped ? { headingHeight, scopes: (frame.scopes ?? []).filter((scope) => scope.parentId !== null).map((scope) => {
          const inset = 12 * scope.depth
          return { id: scope.id, label: scope.label, depth: scope.depth, slotIds: scope.slotIds,
            rect: { x: rect.x + inset, y: scopedY(scope.anchor.position[1] + scope.anchor.size[1] / 2), width: rect.width - inset * 2, height: scope.anchor.size[1] * scopedScale },
            headingHeight: Math.min(worldUnits.scope.headingGap * scopedScale,
              ...Object.values(scope.anchor.ports).map((port) => scopedY(port[1]) - rowHeight / 2 - scopedY(scope.anchor.position[1] + scope.anchor.size[1] / 2))) }
        }) } : {}),
        slots: frame.slots.map((slot, index) => {
          if (scoped) {
            const port = frame.anchor.ports[slot.id] ?? slot.port
            const depth = slot.scopeDepth ?? frame.scopes?.find((scope) => scope.id === slot.scopeId)?.depth ?? 0
            const inset = 12 * depth
            return { slot, value: slotValue(slot), rect: { x: rect.x + inset, y: scopedY(port[1]) - rowHeight / 2, width: rect.width - inset * 2, height: rowHeight } }
          }
          const reservedIndex = reservedSlots.indexOf(slot.id)
          return { slot, value: slotValue(slot),
            rect: { x: rect.x, y: rect.y + headingHeight + (reservedIndex >= 0 ? reservedIndex : index) * rowHeight, width: rect.width, height: rowHeight } }
        }),
      }
    }),
    ...scene.objects.map((object): DiagramEntity => {
      if (object.array) {
        const array = object.array
        // Preserve small curated index bands. Declared length never shrinks a
        // generic/sparse cell; only actual observed cells enter the bounded grid.
        const grid = scene.layoutKind === 'spatial2' || array.length > 5
        const ordered = [...array.cells].sort((a, b) => grid
          ? b.anchor.position[2] - a.anchor.position[2] || b.anchor.position[1] - a.anchor.position[1] || a.anchor.position[0] - b.anchor.position[0] || a.index - b.index
          : a.index - b.index)
        const priority = new Set<string>()
        if (selection?.kind === 'slot') priority.add(selection.id)
        if (selection?.kind === 'reference') {
          const edge = scene.references.find(edge => edge.id === selection.id)
          if (edge && sceneSourceId(edge.source) === object.id) priority.add(edge.source.slotId)
        }
        const activity = scene.arrayActivity
        if (activity?.objectId === object.id && activity.eventId === scene.activeEventId) {
          const indices = activity.kind === 'compare' ? activity.indices : [activity.index]
          for (const cell of ordered) if (indices.includes(cell.index)) priority.add(cell.id)
        }
        for (const mutation of scene.arrayMutations ?? []) if (mutation.objectId === object.id && mutation.eventId === scene.activeEventId) {
          for (const cell of ordered) if (cell.index === mutation.index || mutation.from?.kind === 'element' && cell.index === mutation.from.index) priority.add(cell.id)
        }
        // Retain actual outgoing reference sources when capacity allows. Selection
        // and current activity take precedence over quiet rows.
        const retained = new Set([...priority].filter(id => ordered.some(cell => cell.id === id)).slice(0, 16))
        for (const edge of scene.references) if (sceneSourceId(edge.source) === object.id && retained.size < 16
          && ordered.some(cell => cell.id === edge.source.slotId)) retained.add(edge.source.slotId)
        for (const cell of ordered) if (retained.size < 16) retained.add(cell.id)
        const shown = grid ? ordered.filter(cell => retained.has(cell.id)) : ordered
        const rect = { x: scene.layoutKind === 'spatial2' ? 600 + object.anchor.position[0] * 16 : 600,
          y: scene.layoutKind === 'spatial2' ? 238 - object.anchor.position[1] * 40 + object.anchor.position[2] * 8 : 238,
          width: 330, height: grid ? 88 + Math.max(1, Math.ceil(shown.length / 4)) * 80 : 160 }
        const sourceReference = scene.references.find((edge) => edge.targetObjectId === object.id)
        const sourceId = sourceReference && sceneSourceId(sourceReference.source)
        const owner = sourceId && [...scene.frames, ...scene.objects, ...(scene.classes ?? [])].find(node => node.id === sourceId)
        const sourceSlots = owner ? 'slots' in owner ? owner.slots : [...owner.fields, ...('array' in owner ? owner.array?.cells ?? [] : [])] : []
        const name = sourceSlots.find(slot => slot.id === sourceReference?.source.slotId)?.name ?? null
        const cells = shown.map((cell, ordinal): DiagramArrayCell => ({
          slot: cell, index: cell.index, value: slotValue(cell),
          rect: { x: rect.x + (grid ? ordinal % 4 : cell.index) * rect.width / (grid ? 4 : Math.max(1, array.length)),
            y: rect.y + 64 + (grid ? Math.floor(ordinal / 4) * 80 : 0), width: rect.width / (grid ? 4 : Math.max(1, array.length)) - (grid ? 8 : 0), height: 72 },
        }))
        const byIndex = [...array.cells].sort((a, b) => a.index - b.index)
        const values = byIndex.map(cell => cell.value.kind === 'primitive' && cell.value.javaType === 'int' &&
          typeof cell.value.value === 'number' && Number.isFinite(cell.value.value) ? cell.value.value : null)
        const ascending = values.length === array.length && byIndex.every((cell, index) => cell.index === index) && values.every((value, index) => {
          const previous = values[index - 1]
          return value !== null && (index === 0 || (previous !== null && previous <= value))
        })
        return { id: object.id, kind: 'object', label: object.label, active: false, rect, slots: [],
          array: { length: array.length, name, cells, ascending, observedCount: array.cells.length, omittedCount: array.cells.length - cells.length, grid } }
      }
      // Project persistent heap anchors, never a live-object count or camera-dependent order.
      const x = 600 + object.anchor.position[0] * 16
      const y = 238 - object.anchor.position[1] * 40 + object.anchor.position[2] * 8
      return {
        id: object.id, kind: 'object', label: object.label, active: false,
        rect: { x, y, width: 300, height: 80 + Math.max(2, object.fields.length) * 48 },
        slots: object.fields.map((slot, index) => ({
          slot, value: slotValue(slot), rect: { x, y: y + 64 + index * 48, width: 300, height: 48 },
        })),
      }
    }),
    ...(scene.classes ?? []).map((node): DiagramEntity => {
      // A dedicated class-storage lane uses persistent anchors, never live class
      // order. Existing stack/heap rectangles are unaffected by static storage.
      const x = 960 + node.anchor.position[0] * 16
      const y = 238 - node.anchor.position[1] * 40 + node.anchor.position[2] * 8
      const reserved = Object.keys(node.anchor.ports)
      const ranks = new Map(reserved.map((id, index) => [id, index]))
      let unreserved = reserved.length
      return { id: node.id, kind: 'class', label: node.label, initialization: node.initialization, active: false,
        rect: { x, y, width: 330, height: 80 + Math.max(2, reserved.length + node.fields.filter(field => !Object.hasOwn(node.anchor.ports, field.id)).length) * 48 },
        slots: node.fields.map(slot => ({ slot, value: slotValue(slot),
          rect: { x, y: y + 64 + (ranks.get(slot.id) ?? unreserved++) * 48, width: 330, height: 48 } })) }
    }),
  ]
  const references = scene.references.flatMap((edge): DiagramReference[] => {
    const sourceId = sceneSourceId(edge.source)
    const source = entities.find((entity) => entity.id === sourceId)
    const slot = source && [...source.slots, ...(source.array?.cells ?? [])].find((row) => row.slot.id === edge.source.slotId)
    const target = entities.find((entity) => entity.id === edge.targetObjectId)
    if (!source || !slot || !target) return []
    const gridSource = !!source.array?.grid
    const reverse = (source.kind === 'class' || gridSource) && target.rect.x + target.rect.width <= source.rect.x
    const from = [reverse ? slot.rect.x : slot.rect.x + slot.rect.width, slot.rect.y + slot.rect.height / 2] as const
    // Separate inbound lanes by semantic stack depth; p and this never cover each other.
    const sourceDepth = scene.frames.find((frame) => frame.id === sourceId)?.depth ?? 0
    const to = [reverse ? target.rect.x + target.rect.width : target.rect.x, target.rect.y + 76 - sourceDepth * 28] as const
    const bend = (to[0] - from[0]) * 0.5
    // Grid gutters let a reference leave its exact cell without running across
    // neighboring cell values. Curated single-row curves keep their old path.
    const gutterX = from[0] + (reverse ? -4 : 4)
    const laneY = slot.rect.y + slot.rect.height + 4
    const outsideX = reverse ? source.rect.x - 12 : source.rect.x + source.rect.width + 12
    const path = gridSource
      ? `M ${from[0]} ${from[1]} L ${gutterX} ${from[1]} L ${gutterX} ${laneY} L ${outsideX} ${laneY} C ${outsideX} ${laneY + 24}, ${to[0] - bend} ${to[1]}, ${to[0]} ${to[1]}`
      : `M ${from[0]} ${from[1]} C ${from[0] + bend} ${from[1]}, ${to[0] - bend} ${to[1]}, ${to[0]} ${to[1]}`
    return [{
      id: edge.id, sourceEntityId: sourceId, sourceSlotId: slot.slot.id, historical: edge.historical,
      targetObjectId: edge.targetObjectId, label: slot.slot.name, from, to,
      path,
    }]
  })
  const flow = scene.returnFlow
  const destination = flow?.destination
  const caller = destination ? entities.find((node) => node.id === destination.frameId) : undefined
  const destinationRow = caller?.slots.find((row) => row.slot.id === destination?.slotId)
  let returnTransfer: DiagramReturn | null = null
  const currentReturn = flow?.eventId === scene.activeEventId ||
    (event?.type === 'EXIT_METHOD' && event.eventId === scene.activeEventId && event.frameId === flow?.frameId)
  const origin = flow && entities.find(node => node.id === flow.frameId)
  if (flow && origin && destination && destinationRow && flow.toDepth !== null && (!scoped || currentReturn)) {
    // The origin remains in its reserved invocation band after EXIT_METHOD. No ghost frame is invented.
    const originBand = origin.slots.find(row => row.slot.role === 'return')?.rect ?? origin.rect
    const from = [originBand.x + originBand.width, originBand.y + originBand.height / 2] as const
    const to = [destinationRow.rect.x + destinationRow.rect.width, destinationRow.rect.y + destinationRow.rect.height / 2] as const
    returnTransfer = {
      eventId: flow.eventId, fromFrameId: flow.frameId, toFrameId: destination.frameId,
      toSlotId: destination.slotId, fromLabel: flow.fromLabel,
      toLabel: `${flow.toLabel ?? caller!.label} · ${destinationRow.slot.role === 'operand' ? 'call result' : destinationRow.slot.name}`,
      value: slotValue({ id: flow.eventId, name: 'return', javaType: '', value: flow.value, port: flow.from }),
      expression: flow.expression, from, to,
      path: `M ${from[0]} ${from[1]} C ${from[0] + 88} ${from[1]}, ${to[0] + 88} ${to[1]}, ${to[0]} ${to[1]}`,
    }
  }
  const activity = scene.arrayActivity
  const activeArray = activity && activity.eventId === scene.activeEventId ? entities.find((node) => node.id === activity.objectId)?.array : undefined
  let arrayActivity: ClassicScene['arrayActivity'] = null
  if (activity && activeArray && activity.kind !== 'write') {
    const indices = activity.kind === 'read' ? [activity.index] : activity.indices
    const cells = indices.map((index) => activeArray.cells.find((cell) => cell.index === index))
    if (cells.every((cell) => cell !== undefined)) {
      const name = activeArray.name ?? 'array'
      const label = activity.kind === 'read'
        ? `Read ${name}[${activity.index}] = ${cells[0]!.value}`
        : `${name}[${activity.indices[0]}] > ${name}[${activity.indices[1]}]: ${cells[0]!.value} > ${cells[1]!.value} = ${activity.result}`
      arrayActivity = { eventId: activity.eventId, objectId: activity.objectId, slotIds: cells.map((cell) => cell!.slot.id), label,
        destinationSlotId: activity.kind === 'read' ? activity.destinationSlotId : undefined }
    }
  }
  const arrayWrites = (scene.arrayMutations ?? []).flatMap((mutation): DiagramArrayWrite[] => {
    if (mutation.eventId !== scene.activeEventId) return []
    const array = entities.find((node) => node.id === mutation.objectId)?.array
    const receiver = array?.cells.find((cell) => cell.index === mutation.index)
    const origin = mutation.from
    if (!origin) return []
    const source = origin.kind === 'element'
      ? array?.cells.find((cell) => cell.index === origin.index)
      : entities.find((node) => node.id === origin.frameId)?.slots.find((row) => row.slot.id === origin.slotId)
    if (!array || !receiver || !source) return []
    const before = slotValue({ ...receiver.slot, value: mutation.before, displayValue: undefined })
    const after = slotValue({ ...receiver.slot, value: mutation.after, displayValue: undefined })
    const name = array.name ?? 'array'
    const sourceLabel = origin.kind === 'element' ? `${name}[${origin.index}]` : source.slot.name
    const from = origin.kind === 'element'
      ? [source.rect.x + source.rect.width / 2, source.rect.y + source.rect.height] as const
      : [source.rect.x + source.rect.width, source.rect.y + source.rect.height / 2] as const
    const to = [receiver.rect.x + receiver.rect.width / 2, receiver.rect.y + receiver.rect.height] as const
    const arrayEntity = entities.find(node => node.id === mutation.objectId)!
    const outsideX = arrayEntity.rect.x + arrayEntity.rect.width + 12
    const path = origin.kind === 'element' && array.grid
      ? `M ${from[0]} ${from[1]} L ${from[0]} ${from[1] + 4} L ${outsideX} ${from[1] + 4} L ${outsideX} ${to[1] + 4} L ${to[0]} ${to[1] + 4} L ${to[0]} ${to[1]}`
      : origin.kind === 'element'
      ? `M ${from[0]} ${from[1]} C ${from[0]} ${from[1] + 48}, ${to[0]} ${to[1] + 48}, ${to[0]} ${to[1]}`
      : `M ${from[0]} ${from[1]} C ${from[0] + 72} ${from[1]}, ${to[0]} ${to[1] + 64}, ${to[0]} ${to[1]}`
    return [{ eventId: mutation.eventId, objectId: mutation.objectId, slotId: receiver.slot.id, sourceSlotId: source.slot.id, before, after,
      label: `${sourceLabel} → ${name}[${mutation.index}]: ${before} → ${after}`, from, to, path }]
  })
  return { entities, references, deepStack, scoped, returnTransfer, arrayActivity, arrayWrites }
}

export function emphasizedSlot(event: TraceEvent | null): string | null {
  if (!event) return null
  switch (event.type) {
    case 'SET_FIELD': case 'ASSIGN_LOCAL': return event.slotId
    case 'DECLARE_LOCAL': return event.slot.id
    case 'RETURN_VALUE': return event.destination?.slotId ?? null
    case 'INPUT_READ': return event.destinationSlotId
    case 'CREATE_REFERENCE': case 'CLEAR_REFERENCE': return event.sourceSlot.slotId
    default: return null
  }
}

export function relatedReference(edge: DiagramReference, selection: Selection, diagram?: ClassicScene): boolean {
  if (!selection) return false
  if (selection.kind === 'reference') return edge.id === selection.id
  if (selection.kind === 'slot') return edge.sourceSlotId === selection.id || !!diagram?.entities.find((node) => node.id === edge.targetObjectId)?.array?.cells.some((cell) => cell.slot.id === selection.id)
  return edge.sourceEntityId === selection.id || edge.targetObjectId === selection.id
}

export function selectedBounds(diagram: ClassicScene, selection: NonNullable<Selection>): DiagramRect | null {
  if (selection.kind === 'reference') {
    const edge = diagram.references.find((reference) => reference.id === selection.id)
    if (!edge) return null
    return { x: Math.min(edge.from[0], edge.to[0]), y: Math.min(edge.from[1], edge.to[1]), width: Math.abs(edge.to[0] - edge.from[0]), height: Math.abs(edge.to[1] - edge.from[1]) }
  }
  if (selection.kind === 'slot') return diagram.entities.flatMap((entity) => [...entity.slots, ...(entity.array?.cells ?? [])]).find((row) => row.slot.id === selection.id)?.rect ?? null
  return diagram.entities.find((entity) => entity.id === selection.id)?.rect ?? null
}
