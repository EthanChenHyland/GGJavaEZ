import { referenceIdForSlot, type RuntimeState, type SlotOwner } from '../contracts/runtime'
import type { DetailLevel, LayoutState, SceneFrameNode, SceneModel, SceneObjectNode, SceneReferenceEdge } from '../contracts/world'
import { getReferences } from '../runtime/selectors'

export function buildSceneModel(runtime: RuntimeState, layout: LayoutState, detailLevel: DetailLevel, presentation: 'spatial' | 'theater' = 'spatial'): SceneModel {
  const stage = presentation === 'theater' && layout.theater ? layout.theater : layout
  const displayValue = (value: { kind: string; objectId?: string }) => value.kind === 'reference' && value.objectId
    ? `→ #${runtime.objects[value.objectId]?.displayId ?? '?'}` : undefined
  const displayedFrameIds = runtime.status === 'aborted' && runtime.activeFrameIds.length === 0
    ? runtime.exceptions.at(-1)?.unwoundFrameIds.slice().reverse() ?? []
    : runtime.activeFrameIds
  const frames: SceneFrameNode[] = displayedFrameIds.flatMap((id) => {
    const frame = runtime.frames[id]
    const anchor = stage.anchors[id]
    if (!frame || !anchor) return []
    return [{
      kind: 'frame' as const,
      id,
      label: frame.status === 'unwound' ? `${frame.methodName}() · unwound` : frame.invocationLabel ?? `${frame.methodName}()`,
      depth: frame.depth,
      active: id === runtime.activeFrameIds.at(-1),
      historical: frame.status === 'unwound',
      anchor,
      scopes: layout.scopes ? Object.values(layout.scopes).filter((scope) => scope.frameId === id && runtime.scopes[scope.id]?.status === 'active') : undefined,
      slots: [
        ...Object.values(frame.locals).map((slot) => ({ ...slot, displayValue: displayValue(slot.value), scopeDepth: slot.scopeId ? layout.scopes?.[slot.scopeId]?.depth : undefined, port: anchor.ports[slot.id] ?? anchor.bodyPort })),
        ...(frame.returnType && frame.returnType !== 'void' ? [{ id: `return:${id}`, name: 'return', javaType: frame.returnType, role: 'return' as const,
          value: frame.returnValue ?? { kind: 'uninitialized' as const }, displayValue: frame.returnValue ? undefined : 'pending', port: anchor.ports[`return:${id}`] ?? anchor.bodyPort }] : []),
      ],
    }]
  })

  const objects: SceneObjectNode[] = Object.values(runtime.objects).flatMap((object) => {
    const anchor = stage.anchors[object.id]
    if (!anchor) return []
    return [{
      kind: 'object' as const,
      id: object.id,
      label: `${object.className} #${object.displayId}`,
      className: object.className,
      displayId: object.displayId,
      anchor,
      array: object.array ? { elementType: object.array.elementType, length: object.array.length, cells: object.array.elements.map((slot, index) => ({ ...slot, index, anchor: stage.anchors[slot.id], port: stage.anchors[slot.id]?.bodyPort ?? anchor.bodyPort })) } : undefined,
      fields: Object.values(object.fields).map((slot) => ({ ...slot, displayValue: displayValue(slot.value), port: anchor.ports[slot.id] ?? anchor.bodyPort })),
    }]
  })

  const references: SceneReferenceEdge[] = []
  const addReference = (source: SlotOwner, slotId: string, targetObjectId: string) => {
    const sourceId = source.kind === 'frame' ? source.frameId : source.objectId
    const from = stage.anchors[sourceId]?.ports[slotId]
    const to = stage.anchors[targetObjectId]?.bodyPort
    if (from && to && runtime.objects[targetObjectId]) {
      references.push({ id: referenceIdForSlot(slotId), source, targetObjectId, from, to })
    }
  }
  for (const edge of getReferences(runtime)) addReference(edge.source, edge.source.slotId, edge.targetObjectId)

  const returned = runtime.returns?.at(-1)
  const fromFrame = returned && runtime.frames[returned.frameId]
  const toFrame = returned?.destination && runtime.frames[returned.destination.frameId]
  const from = returned && stage.anchors[returned.frameId]?.ports[`return:${returned.frameId}`]
  const to = returned?.destination ? stage.anchors[returned.destination.frameId]?.ports[returned.destination.slotId] ?? null : null
  const returnFlow = returned && fromFrame && from ? { ...returned, from, to,
    fromDepth: fromFrame.depth, toDepth: toFrame ? toFrame.depth : null,
    fromLabel: fromFrame.invocationLabel ?? `${fromFrame.methodName}()`,
    toLabel: toFrame ? toFrame.invocationLabel ?? `${toFrame.methodName}()` : null } : undefined
  return { frames, objects, references, activeEventId: runtime.lastEventId, detailLevel, stackDepth: layout.stackDepth, bounds: stage.bounds, presentation, layoutKind: layout.layoutKind, arrayActivity: runtime.arrayActivity, arrayMutations: runtime.arrayMutations, returnFlow }
}
