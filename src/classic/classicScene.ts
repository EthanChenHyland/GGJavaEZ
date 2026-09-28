import type { Selection } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneModel, SceneSlot } from '../contracts/world'

export interface DiagramRect { x: number; y: number; width: number; height: number }
export interface DiagramSlot { slot: SceneSlot; rect: DiagramRect; value: string }
export interface DiagramEntity {
  id: string
  kind: 'frame' | 'object'
  label: string
  active: boolean
  rect: DiagramRect
  slots: DiagramSlot[]
}
export interface DiagramReference {
  id: string
  sourceEntityId: string
  sourceSlotId: string
  targetObjectId: string
  label: string
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
  returnTransfer: DiagramReturn | null
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
    case 'uninitialized': return '—'
    case 'null': return 'null'
    case 'primitive': return String(slot.value.value)
    case 'stringSummary': return `"${slot.value.value}"`
    case 'reference': return `→ ${slot.value.objectId}`
  }
}

/** Presentation projection only. Fixed depth bands keep callers in place as callees enter/return. */
export function buildClassicScene(scene: SceneModel): ClassicScene {
  const stackDepth = scene.stackDepth ?? 1
  const deepStack = stackDepth > 1
  const entities: DiagramEntity[] = [
    ...scene.frames.map((frame): DiagramEntity => {
      const rect = classicFrameRect(frame.depth, stackDepth, frame.slots.length)
      const headingHeight = deepStack ? 26 : 64
      const rowHeight = deepStack ? 18 : 40
      return {
        id: frame.id, kind: 'frame', label: frame.label, active: frame.active, rect,
        slots: frame.slots.map((slot, index) => ({
          slot, value: slotValue(slot),
          rect: { x: rect.x, y: rect.y + headingHeight + index * rowHeight, width: rect.width, height: rowHeight },
        })),
      }
    }),
    ...scene.objects.map((object): DiagramEntity => {
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
  ]
  const references = scene.references.flatMap((edge): DiagramReference[] => {
    const sourceId = edge.source.kind === 'frame' ? edge.source.frameId : edge.source.objectId
    const source = entities.find((entity) => entity.id === sourceId)
    const slot = source?.slots.find((row) => row.slot.id === edge.source.slotId)
    const target = entities.find((entity) => entity.id === edge.targetObjectId)
    if (!source || !slot || !target) return []
    const from = [slot.rect.x + slot.rect.width, slot.rect.y + slot.rect.height / 2] as const
    // Separate inbound lanes by semantic stack depth; p and this never cover each other.
    const sourceDepth = scene.frames.find((frame) => frame.id === sourceId)?.depth ?? 0
    const to = [target.rect.x, target.rect.y + 76 - sourceDepth * 28] as const
    const bend = (to[0] - from[0]) * 0.5
    return [{
      id: edge.id, sourceEntityId: sourceId, sourceSlotId: slot.slot.id,
      targetObjectId: edge.targetObjectId, label: slot.slot.name, from, to,
      path: `M ${from[0]} ${from[1]} C ${from[0] + bend} ${from[1]}, ${to[0] - bend} ${to[1]}, ${to[0]} ${to[1]}`,
    }]
  })
  const flow = scene.returnFlow
  const destination = flow?.destination
  const caller = destination ? entities.find((node) => node.id === destination.frameId) : undefined
  const destinationRow = caller?.slots.find((row) => row.slot.id === destination?.slotId)
  let returnTransfer: DiagramReturn | null = null
  if (flow && destination && destinationRow && flow.toDepth !== null) {
    // The origin remains in its reserved invocation band after EXIT_METHOD. No ghost frame is invented.
    const origin = classicFrameRect(flow.fromDepth, stackDepth)
    const from = [origin.x + origin.width, origin.y + origin.height / 2] as const
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
  return { entities, references, deepStack, returnTransfer }
}

export function emphasizedSlot(event: TraceEvent | null): string | null {
  if (!event) return null
  switch (event.type) {
    case 'SET_FIELD': case 'ASSIGN_LOCAL': return event.slotId
    case 'DECLARE_LOCAL': return event.slot.id
    case 'RETURN_VALUE': return event.destination?.slotId ?? null
    case 'CREATE_REFERENCE': case 'CLEAR_REFERENCE': return event.sourceSlot.slotId
    default: return null
  }
}

export function relatedReference(edge: DiagramReference, selection: Selection): boolean {
  if (!selection) return false
  if (selection.kind === 'reference') return edge.id === selection.id
  if (selection.kind === 'slot') return edge.sourceSlotId === selection.id
  return edge.sourceEntityId === selection.id || edge.targetObjectId === selection.id
}

export function selectedBounds(diagram: ClassicScene, selection: NonNullable<Selection>): DiagramRect | null {
  if (selection.kind === 'reference') {
    const edge = diagram.references.find((reference) => reference.id === selection.id)
    if (!edge) return null
    return { x: Math.min(edge.from[0], edge.to[0]), y: Math.min(edge.from[1], edge.to[1]), width: Math.abs(edge.to[0] - edge.from[0]), height: Math.abs(edge.to[1] - edge.from[1]) }
  }
  if (selection.kind === 'slot') return diagram.entities.flatMap((entity) => entity.slots).find((row) => row.slot.id === selection.id)?.rect ?? null
  return diagram.entities.find((entity) => entity.id === selection.id)?.rect ?? null
}
