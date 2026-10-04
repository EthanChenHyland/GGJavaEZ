import { referenceIdForSlot, type RuntimeState, type SlotOwner } from '../contracts/runtime'
import type { SceneReferenceEdge } from '../contracts/world'

export type DerivedReference = Pick<SceneReferenceEdge, 'id' | 'source' | 'targetObjectId'>

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
