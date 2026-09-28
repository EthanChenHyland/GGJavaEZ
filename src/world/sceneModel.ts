import { referenceIdForSlot, type RuntimeState, type SlotOwner } from '../contracts/runtime'
import type { DetailLevel, LayoutState, SceneFrameNode, SceneModel, SceneObjectNode, SceneReferenceEdge } from '../contracts/world'
import { getReferences } from '../runtime/selectors'

export function buildSceneModel(runtime: RuntimeState, layout: LayoutState, detailLevel: DetailLevel): SceneModel {
  const displayValue = (value: { kind: string; objectId?: string }) => value.kind === 'reference' && value.objectId
    ? `→ #${runtime.objects[value.objectId]?.displayId ?? '?'}` : undefined
  const frames: SceneFrameNode[] = runtime.activeFrameIds.flatMap((id) => {
    const frame = runtime.frames[id]
    const anchor = layout.anchors[id]
    if (!frame || !anchor) return []
    return [{
      kind: 'frame' as const,
      id,
      label: frame.invocationLabel ?? `${frame.methodName}()`,
      depth: frame.depth,
      active: id === runtime.activeFrameIds.at(-1),
      anchor,
      slots: [
        ...Object.values(frame.locals).map((slot) => ({ ...slot, displayValue: displayValue(slot.value), port: anchor.ports[slot.id] ?? anchor.bodyPort })),
        ...(frame.returnType && frame.returnType !== 'void' ? [{ id: `return:${id}`, name: 'return', javaType: frame.returnType, role: 'return' as const,
          value: frame.returnValue ?? { kind: 'uninitialized' as const }, displayValue: frame.returnValue ? undefined : 'pending', port: anchor.ports[`return:${id}`] ?? anchor.bodyPort }] : []),
      ],
    }]
  })

  const objects: SceneObjectNode[] = Object.values(runtime.objects).flatMap((object) => {
    const anchor = layout.anchors[object.id]
    if (!anchor) return []
    return [{
      kind: 'object' as const,
      id: object.id,
      label: `${object.className} #${object.displayId}`,
      className: object.className,
      displayId: object.displayId,
      anchor,
      fields: Object.values(object.fields).map((slot) => ({ ...slot, displayValue: displayValue(slot.value), port: anchor.ports[slot.id] ?? anchor.bodyPort })),
    }]
  })

  const references: SceneReferenceEdge[] = []
  const addReference = (source: SlotOwner, slotId: string, targetObjectId: string) => {
    const sourceId = source.kind === 'frame' ? source.frameId : source.objectId
    const from = layout.anchors[sourceId]?.ports[slotId]
    const to = layout.anchors[targetObjectId]?.bodyPort
    if (from && to && runtime.objects[targetObjectId]) {
      references.push({ id: referenceIdForSlot(slotId), source, targetObjectId, from, to })
    }
  }
  for (const edge of getReferences(runtime)) addReference(edge.source, edge.source.slotId, edge.targetObjectId)

  const returned = runtime.returns?.at(-1)
  const fromFrame = returned && runtime.frames[returned.frameId]
  const toFrame = returned?.destination && runtime.frames[returned.destination.frameId]
  const from = returned && layout.anchors[returned.frameId]?.ports[`return:${returned.frameId}`]
  const to = returned?.destination ? layout.anchors[returned.destination.frameId]?.ports[returned.destination.slotId] ?? null : null
  const returnFlow = returned && fromFrame && from ? { ...returned, from, to,
    fromDepth: fromFrame.depth, toDepth: toFrame ? toFrame.depth : null,
    fromLabel: fromFrame.invocationLabel ?? `${fromFrame.methodName}()`,
    toLabel: toFrame ? toFrame.invocationLabel ?? `${toFrame.methodName}()` : null } : undefined
  return { frames, objects, references, activeEventId: runtime.lastEventId, detailLevel, stackDepth: layout.stackDepth, bounds: layout.bounds, returnFlow }
}
