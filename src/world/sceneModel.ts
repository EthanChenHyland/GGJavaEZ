import { objectFaceRowCount } from './objectFace'
import { arrayHeaderAnchor } from './arrayGeometry'
import { consoleIoSummaries, graphIoSummaries } from './ioSummary'
import { referenceIdForSlot, type RuntimeClass, type RuntimeFrame, type RuntimeObject, type RuntimeState } from '../contracts/runtime'
import { sceneSourceId, type DetailLevel, type LayoutState, type SceneClassNode, type SceneIoEndpoint, type SceneFrameNode, type SceneModel, type SceneObjectNode, type SceneReferenceEdge, type SceneSlotOwner, type Vec3, type WorldAnchor } from '../contracts/world'

const frameCache = new WeakMap<RuntimeFrame, { anchor: WorldAnchor; signature: string; node: SceneFrameNode }>()
const objectCache = new WeakMap<RuntimeObject, { anchor: WorldAnchor; anchors: LayoutState['anchors']; node: SceneObjectNode }>()
const classCache = new WeakMap<RuntimeClass, { anchor: WorldAnchor; node: SceneClassNode }>()
const legacyIoAnchors = new WeakMap<LayoutState['anchors'], Map<SceneIoEndpoint['id'], WorldAnchor>>()
const referencesCache = new WeakMap<SceneFrameNode | SceneObjectNode | SceneClassNode, SceneReferenceEdge[]>()

/** Immutable leaf records retain their scene projection across unrelated events.
 * Projection never reads source or reconstructs trace history. Renderer budgets
 * are applied downstream; this catalog retains every actual runtime identity. */
export function buildSceneModel(runtime: RuntimeState, layout: LayoutState, detailLevel: DetailLevel, presentation: 'spatial' | 'theater' = 'spatial'): SceneModel {
  const stage = presentation === 'theater' && layout.theater ? layout.theater : layout
  const displayValue = (value: { kind: string; objectId?: string }) => value.kind === 'reference' && value.objectId
    ? `→ #${runtime.objects[value.objectId]?.displayId ?? '?'}` : undefined
  const exception = runtime.exceptions.at(-1)
  const interrupted = runtime.status === 'partial' ? 'stopped' : runtime.status === 'aborted' ? runtime.abortReason?.startsWith('program_crashed:') ? 'failed' : 'stopped' : null
  const frames: SceneFrameNode[] = []
  for (const frame of Object.values(runtime.frames)) {
    const anchor = stage.anchors[frame.id]
    if (!anchor) continue
    const active = runtime.status === 'running' && frame.id === runtime.activeFrameIds.at(-1)
    const historical = frame.status !== 'active' || runtime.status !== 'running'
    const exceptionState = exception?.unwoundFrameIds.includes(frame.id) ? 'unwound'
      : exception?.caughtBy === frame.id ? 'caught'
        : exception?.finallyFrameIds?.includes(frame.id) && !exception.caughtBy ? 'finally'
          : !exception?.caughtBy && exception?.frameIds.at(-1) === frame.id ? 'origin' : undefined
    const invocationStatus = frame.status === 'returned' ? 'completed' : frame.status === 'unwound' ? 'unwound' : interrupted ?? 'active'
    const invocation = runtime.executionGraph?.invocations[frame.id]
    const call = invocation?.callId ? runtime.executionGraph?.calls[invocation.callId] : undefined
    const callerEvidence = runtime.executionGraph ? call?.calleeInvocationId === frame.id && call.callerInvocationId === frame.callerFrameId ? 'observed' : 'unavailable' : undefined
    const signature = `${active}:${historical}:${exceptionState}:${invocationStatus}:${callerEvidence}:${runtime.executionGraph?.invocations[frame.id]?.returnValueId ?? ''}`
    const cached = frameCache.get(frame)
    if (cached?.anchor === anchor && cached.signature === signature && cached.node.metadata === invocation?.metadata && !layout.scopes) { frames.push(cached.node); continue }
    const node: SceneFrameNode = {
      kind: 'frame', id: frame.id, className: frame.className, callerFrameId: frame.callerFrameId, callerEvidence, metadata: runtime.executionGraph?.invocations[frame.id]?.metadata,
      label: `${frame.invocationLabel ?? `${frame.methodName}()`}${frame.status === 'unwound' ? ' · unwound' : frame.status === 'returned' ? ' · completed' : interrupted ? interrupted === 'failed' ? ' · failed' : ' · last recorded' : ''}`,
      depth: frame.depth, active, historical, invocationStatus, exceptionState, anchor,
      scopes: layout.scopes ? Object.values(layout.scopes).filter(scope => scope.frameId === frame.id && runtime.scopes[scope.id]?.status === 'active') : undefined,
      slots: [
        ...Object.values(frame.locals).map(slot => ({ ...slot, displayValue: displayValue(slot.value), scopeDepth: slot.scopeId ? layout.scopes?.[slot.scopeId]?.depth : undefined, port: anchor.ports[slot.id] ?? anchor.bodyPort })),
        ...(frame.returnType && frame.returnType !== 'void' ? [{ id: `return:${frame.id}`, name: 'return', javaType: frame.returnType, role: 'return' as const,
          value: frame.returnValue ?? { kind: 'uninitialized' as const }, displayValue: frame.returnValue ? undefined : runtime.executionGraph?.invocations[frame.id]?.returnValueId ? 'unavailable' : 'pending', port: anchor.ports[`return:${frame.id}`] ?? anchor.bodyPort }] : []),
      ],
    }
    frameCache.set(frame, { anchor, signature, node }); frames.push(node)
  }
  const objects: SceneObjectNode[] = []
  for (const object of Object.values(runtime.objects)) {
    const anchor = stage.anchors[object.id]
    if (!anchor) continue
    const cached = objectCache.get(object)
    if (cached?.anchor === anchor && (!object.array || cached.anchors === stage.anchors)) { objects.push(cached.node); continue }
    const node: SceneObjectNode = {
      kind: 'object', id: object.id, label: `${object.className} #${object.displayId}`, className: object.className,
      displayId: object.displayId, anchor, metadata: object.metadata,
      ...(object.library ? { summaryLabel: `${object.library.kind}${object.library.size === undefined ? '' : ` · size ${object.library.size}`}${object.library.truncated ? ' · bounded' : ''}` }
        : object.string ? { summaryLabel: `STRING · ${object.string.length} UTF-16 units${object.string.truncated ? ' · bounded' : ''}` } : {}),
      array: object.array ? { elementType: object.array.elementType, length: object.array.length, cells: [
        ...object.array.elements.map((slot, index) => ({ ...slot, index, displayValue: displayValue(slot.value), anchor: stage.anchors[slot.id], port: stage.anchors[slot.id]?.bodyPort ?? anchor.bodyPort })),
        ...Object.entries(object.array.sparseElements ?? {}).map(([index, slot]) => ({ ...slot, index: Number(index), displayValue: displayValue(slot.value), anchor: stage.anchors[slot.id], port: stage.anchors[slot.id]?.bodyPort ?? anchor.bodyPort })),
      ].filter(cell => cell.anchor) } : undefined,
      fields: Object.values(object.fields).map(slot => ({ ...slot, displayValue: displayValue(slot.value), port: anchor.ports[slot.id] ?? anchor.bodyPort })),
    }
    objectCache.set(object, { anchor, anchors: stage.anchors, node }); objects.push(node)
  }
  const classes: SceneClassNode[] = []
  for (const owner of Object.values(runtime.classes ?? {})) {
    const anchor = stage.anchors[owner.id]
    if (!anchor) continue
    const cached = classCache.get(owner)
    if (cached?.anchor === anchor) { classes.push(cached.node); continue }
    const node: SceneClassNode = { kind: 'class', id: owner.id, className: owner.className, label: owner.className,
      initialization: owner.initialization, metadata: owner.metadata, anchor,
      fields: Object.values(owner.statics).map(slot => ({ ...slot, displayValue: displayValue(slot.value), port: anchor.ports[slot.id] ?? anchor.bodyPort })) }
    classCache.set(owner, { anchor, node }); classes.push(node)
  }
  const references: SceneReferenceEdge[] = []
  const add = (source: SceneSlotOwner, targetObjectId: string, historical = false) => {
    const sourceId = sceneSourceId(source)
    const cell = source.kind === 'object' && runtime.objects[source.objectId]?.array ? stage.anchors[source.slotId] : undefined
    const sourceAnchor = cell ?? stage.anchors[sourceId], targetAnchor = stage.anchors[targetObjectId]
    const from = sourceAnchor?.ports[source.slotId], to = targetAnchor?.bodyPort
    if (!from || !to || !sourceAnchor || !targetAnchor || !runtime.objects[targetObjectId]) return
    const targetBody = layout.layoutKind === 'spatial2' && runtime.objects[targetObjectId].array ? arrayHeaderAnchor(targetAnchor) : targetAnchor
    references.push({ id: referenceIdForSlot(source.slotId), source, targetObjectId, from, to,
      fromFace: [from[0], from[1], sourceAnchor.position[2] + sourceAnchor.size[2] / 2 + 0.055],
      toFace: targetBody !== targetAnchor ? targetBody.bodyPort : [to[0], to[1], targetAnchor.position[2] + targetAnchor.size[2] / 2 + 0.055], historical })
  }
  // References share immutable projected source records. Target anchor IDs are
  // stable, so unrelated mutations do not regenerate their curves/endpoints.
  for (const node of [...frames, ...objects, ...classes]) {
    const cached = referencesCache.get(node)
    if (cached) { references.push(...cached); continue }
    const start = references.length
    const fields = node.kind === 'frame' ? [] : node.fields.filter(field => {
      const row = field.port[1] - node.anchor.position[1]
      return Boolean(node.anchor.ports[field.id]) && row + 0.22 <= node.anchor.size[1] / 2 - 0.84 && row - 0.22 >= -node.anchor.size[1] / 2 + 0.07
    }).slice(0, objectFaceRowCount(node.anchor.size[1], node.fields.length))
    const slots = node.kind === 'frame' ? node.slots : node.kind === 'object' ? [...fields, ...(node.array?.cells ?? [])] : fields
    for (const slot of slots) if (slot.value.kind === 'reference') {
      const source: SceneSlotOwner = node.kind === 'frame' ? { kind: 'frame', frameId: node.id, slotId: slot.id }
        : node.kind === 'class' ? { kind: 'class', classId: node.id, slotId: slot.id } : { kind: 'object', objectId: node.id, slotId: slot.id }
      add(source, slot.value.objectId, node.kind === 'frame' && Boolean(node.historical))
    }
    referencesCache.set(node, references.slice(start))
  }
  const io: SceneIoEndpoint[] = []
  const channels = runtime.executionGraph?.io
  if (channels) {
    const summaries = graphIoSummaries(runtime.executionGraph!)
    for (const id of ['stdin', 'stdout', 'stderr'] as const) {
      const summary = summaries.get(id), anchor = stage.anchors[`io:${id}`]
      if (summary && anchor) io.push({ id, ...summary, anchor })
    }
  } else if (!runtime.executionGraph) {
    // Graphless event traces already reduce consumed input and written output
    // into console facts. Submitted bytes alone have no destination slot.
    const summaries = consoleIoSummaries(runtime.console)
    let anchors = legacyIoAnchors.get(stage.anchors)
    if (!anchors) { anchors = new Map(); legacyIoAnchors.set(stage.anchors, anchors) }
    for (const id of ['stdin', 'stdout', 'stderr'] as const) {
      const summary = summaries.get(id)
      if (!summary) continue
      let anchor = stage.anchors[`io:${id}`] ?? anchors.get(id)
      if (!anchor) {
        // Use the complete reserved layout, never the live frame/object set.
        // Separate channel solids by their width plus clearance.
        const center = stage.bounds?.center ?? [0, 0, 0]
        const bottom = stage.bounds ? center[1] - stage.bounds.size[1] / 2 : -1.2
        const front = stage.bounds ? center[2] + stage.bounds.size[2] / 2 : 1.4
        const offset = id === 'stdin' ? -3.4 : id === 'stdout' ? 0 : 3.4
        const position: Vec3 = [center[0] + offset, bottom - 0.55, front + 1.3]
        anchor = { entityId: `io:${id}`, region: 'io', position, size: [2.8, 0.8, 0.55], ports: {},
          bodyPort: [position[0] - 1.25, position[1], position[2] + 0.33] }
        anchors.set(id, anchor)
      }
      io.push({ id, ...summary, anchor })
    }
  }
  const returned = runtime.returns.at(-1)
  const fromFrame = returned && runtime.frames[returned.frameId]
  const toFrame = returned?.destination && runtime.frames[returned.destination.frameId]
  const from = returned && stage.anchors[returned.frameId]?.ports[`return:${returned.frameId}`]
  const to = returned?.destination ? stage.anchors[returned.destination.frameId]?.ports[returned.destination.slotId] ?? null : null
  const returnFlow = returned && fromFrame && from ? { ...returned, from, to,
    fromDepth: fromFrame.depth, toDepth: toFrame ? toFrame.depth : null,
    fromLabel: fromFrame.invocationLabel ?? `${fromFrame.methodName}()`, toLabel: toFrame ? toFrame.invocationLabel ?? `${toFrame.methodName}()` : null } : undefined
  return { frames, objects, classes, io, references, activeEventId: runtime.lastEventId, detailLevel, stackDepth: layout.stackDepth, bounds: stage.bounds,
    presentation, layoutKind: layout.layoutKind, arrayActivity: runtime.arrayActivity, arrayMutations: runtime.arrayMutations, returnFlow }
}
