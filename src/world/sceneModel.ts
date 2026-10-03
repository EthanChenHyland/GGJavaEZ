import { referenceIdForSlot, type RuntimeState, type SlotOwner } from '../contracts/runtime'
import type { DetailLevel, LayoutState, SceneFrameNode, SceneModel, SceneObjectNode, SceneReferenceEdge } from '../contracts/world'
import { getReferences } from '../runtime/selectors'

export function buildSceneModel(runtime: RuntimeState, layout: LayoutState, detailLevel: DetailLevel, presentation: 'spatial' | 'theater' = 'spatial'): SceneModel {
  const stage = presentation === 'theater' && layout.theater ? layout.theater : layout
  const displayValue = (value: { kind: string; objectId?: string }) => value.kind === 'reference' && value.objectId
    ? `→ #${runtime.objects[value.objectId]?.displayId ?? '?'}` : undefined
  const exception = runtime.exceptions.at(-1)
  const interrupted = runtime.status === 'partial' ? 'stopped' : runtime.status === 'aborted' ? runtime.abortReason?.startsWith('program_crashed:') ? 'failed' : 'stopped' : null
  // RuntimeState retains invocation records. Their solids remain at the same
  // anchors as each invocation completes, rather than arriving as a new map
  // only when main exits.
  const frames: SceneFrameNode[] = Object.keys(runtime.frames).flatMap((id) => {
    const frame = runtime.frames[id]
    const anchor = stage.anchors[id]
    if (!frame || !anchor) return []
    return [{
      kind: 'frame' as const,
      id,
      callerFrameId: frame.callerFrameId,
      label: `${frame.invocationLabel ?? `${frame.methodName}()`}${frame.status === 'unwound' ? ' · unwound' : frame.status === 'returned' ? ' · completed' : interrupted ? interrupted === 'failed' ? ' · failed' : ' · last recorded' : ''}`,
      depth: frame.depth,
      active: runtime.status === 'running' && id === runtime.activeFrameIds.at(-1),
      historical: frame.status !== 'active' || runtime.status !== 'running',
      invocationStatus: frame.status === 'returned' ? 'completed' : frame.status === 'unwound' ? 'unwound' : interrupted ?? 'active',
      exceptionState: exception?.unwoundFrameIds.includes(id) ? 'unwound'
        : exception?.caughtBy === id ? 'caught'
          : exception?.finallyFrameIds?.includes(id) && !exception.caughtBy ? 'finally'
            : !exception?.caughtBy && exception?.frameIds.at(-1) === id ? 'origin' : undefined,
      anchor,
      scopes: layout.scopes ? Object.values(layout.scopes).filter((scope) => scope.frameId === id && runtime.scopes[scope.id]?.status === 'active') : undefined,
      slots: [
        ...Object.values(frame.locals).map((slot) => ({ ...slot, displayValue: displayValue(slot.value), scopeDepth: slot.scopeId ? layout.scopes?.[slot.scopeId]?.depth : undefined, port: anchor.ports[slot.id] ?? anchor.bodyPort })),
        ...(frame.returnType && frame.returnType !== 'void' ? [{ id: `return:${id}`, name: 'return', javaType: frame.returnType, role: 'return' as const,
          value: frame.returnValue ?? { kind: 'uninitialized' as const }, displayValue: frame.returnValue ? undefined : runtime.executionGraph?.invocations[id]?.returnValueId ? 'unavailable' : 'pending', port: anchor.ports[`return:${id}`] ?? anchor.bodyPort }] : []),
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
  const addReference = (source: SlotOwner, slotId: string, targetObjectId: string, historical = false) => {
    const sourceId = source.kind === 'frame' ? source.frameId : source.objectId
    const sourceAnchor = stage.anchors[sourceId]
    const targetAnchor = stage.anchors[targetObjectId]
    const from = sourceAnchor?.ports[slotId]
    const to = targetAnchor?.bodyPort
    if (from && to && sourceAnchor && targetAnchor && runtime.objects[targetObjectId]) {
      const fromFace: SceneReferenceEdge['fromFace'] = [from[0], from[1], sourceAnchor.position[2] + sourceAnchor.size[2] / 2 + 0.055]
      const toFace: SceneReferenceEdge['toFace'] = [to[0], to[1], targetAnchor.position[2] + targetAnchor.size[2] / 2 + 0.055]
      references.push({ id: referenceIdForSlot(slotId), source, targetObjectId, from, to, fromFace, toFace, historical })
    }
  }
  for (const edge of getReferences(runtime)) addReference(edge.source, edge.source.slotId, edge.targetObjectId,
    (runtime.status === 'aborted' || runtime.status === 'partial') && edge.source.kind === 'frame')
  for (const frame of Object.values(runtime.frames)) {
    if (frame.status === 'active') continue
    for (const slot of Object.values(frame.locals)) if (slot.value.kind === 'reference') {
      addReference({ kind: 'frame', frameId: frame.id, slotId: slot.id }, slot.id, slot.value.objectId, true)
    }
  }

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
