import { referenceIdForSlot, type RuntimeState, type SlotOwner, type SlotId, type ReferenceId, type ObjectId } from '../contracts/runtime'

/** Preserved selector shape, independent of renderer/layout contracts. */
export interface DerivedReference {
  id: ReferenceId
  source: SlotOwner | { kind: 'class'; classId: string; slotId: SlotId }
  targetObjectId: ObjectId
}

/** Live edges only. Returned frames retain history but no longer own visible references. */
export function getReferences(state: RuntimeState): DerivedReference[] {
  const edges: DerivedReference[] = []

  function collect(source: SlotOwner, objectId: string): void {
    if (!state.objects[objectId]) throw new Error(`Dangling reference to ${objectId}`)
    edges.push({ id: referenceIdForSlot(source.slotId), source, targetObjectId: objectId })
  }

  for (const frameId of state.activeFrameIds) {
    const frame = state.frames[frameId]
    for (const slot of Object.values(frame.locals)) {
      if (slot.value.kind === 'reference') {
        collect({ kind: 'frame', frameId, slotId: slot.id }, slot.value.objectId)
      }
    }
  }

  for (const object of Object.values(state.objects)) {
    for (const slot of Object.values(object.fields).concat(object.array?.elements ?? [], Object.values(object.array?.sparseElements ?? {}))) {
      if (slot.value.kind === 'reference') {
        collect({ kind: 'object', objectId: object.id, slotId: slot.id }, slot.value.objectId)
      }
    }
  }

  return edges
}
