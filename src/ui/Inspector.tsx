import { X, Crosshair, CornerUpLeft } from 'lucide-react'
import type { Selection } from '../contracts/interaction'
import type { RuntimeSlot, RuntimeState, RuntimeValue } from '../contracts/runtime'
import type { SceneModel, SceneSlotOwner } from '../contracts/world'
import type { FlowEndpoint, SemanticTransition } from '../motion/semanticTransition'
import { displayJavaType } from '../runtime/displayType'

export function formatValue(value: RuntimeValue, objects?: RuntimeState['objects']): string {
  switch (value.kind) {
    case 'unavailable': return `unavailable (${value.reason})`
    case 'uninitialized': return 'not observed'
    case 'null': return 'null'
    case 'primitive': return value.javaType === 'char' ? JSON.stringify(value.value) : String(value.value)
    case 'stringSummary': return `"${value.value}"`
    case 'reference': {
      const object = objects?.[value.objectId]
      return object ? `→ ${object.className} #${object.displayId}` : `→ ${value.objectId}`
    }
  }
}

function SlotRows({ slots, objects }: { slots: RuntimeSlot[]; objects: RuntimeState['objects'] }) {
  if (!slots.length) return <p className="inspector-empty">No recorded values.</p>
  return <div className="inspector-rows">{slots.map((slot) => (
    <div className="inspector-row" key={slot.id}>
      <span title={slot.role}>{slot.role === 'operand' ? 'call result' : slot.name}</span><span className="inspector-type" title={slot.javaType}>{slot.javaType}</span><strong title={formatValue(slot.value, objects)}>{slot.value.kind === 'reference' && objects[slot.value.objectId] ? `→ ${displayJavaType(objects[slot.value.objectId].className)} #${objects[slot.value.objectId].displayId}` : formatValue(slot.value, objects)}</strong>
    </div>
  ))}</div>
}

interface InspectorProps {
  selection: Selection
  runtime: RuntimeState
  scene: SceneModel
  flow?: SemanticTransition
  onClose: () => void
  onReturn: () => void
  onFocus: () => void
  onTrace: (referenceId: string) => void
}

export function Inspector({ selection, runtime, scene, flow, onClose, onReturn, onFocus, onTrace }: InspectorProps) {
  if (!selection) return null
  const sourceName = (source: SceneSlotOwner) => source.kind === 'frame'
    ? runtime.frames[source.frameId]?.locals[source.slotId]?.name ?? source.slotId
    : source.kind === 'class' ? runtime.classes?.[source.classId]?.statics[source.slotId]?.name ?? source.slotId
    : runtime.objects[source.objectId]?.fields[source.slotId]?.name ?? source.slotId
  const endpointName = (endpoint?: FlowEndpoint) => {
    if (!endpoint) return 'Origin not recorded'
    if (endpoint.kind === 'io') return endpoint.id.toUpperCase()
    const owner = scene.frames.find((node) => node.id === endpoint.id || node.slots.some((slot) => slot.id === endpoint.id))
      ?? scene.objects.find((node) => node.id === endpoint.id || node.fields.some((slot) => slot.id === endpoint.id) || node.array?.cells.some((slot) => slot.id === endpoint.id))
      ?? scene.classes?.find(node => node.id === endpoint.id || node.fields.some(slot => slot.id === endpoint.id))
    if (endpoint.kind === 'slot') {
      const slot = owner && 'slots' in owner ? owner.slots.find((item) => item.id === endpoint.id)
        : owner && 'fields' in owner ? [...owner.fields, ...('array' in owner ? owner.array?.cells ?? [] : [])].find((item) => item.id === endpoint.id) : undefined
      return slot ? `${owner?.label} · ${slot.name}` : endpoint.id
    }
    return owner?.label ?? endpoint.id
  }

  const object = selection.kind === 'object' ? runtime.objects[selection.id] : undefined
  const frame = selection.kind === 'frame' ? runtime.frames[selection.id] : undefined
  const runtimeClass = selection.kind === 'class' ? runtime.classes?.[selection.id] : runtime.classes?.[`jvm:class:${object?.className ?? frame?.className ?? ''}`]
  // A class with no <clinit> or instance still owns real static storage. Any
  // frame can inspect the observed classes without inventing a heap instance.
  const inspectedClasses = frame ? Object.values(runtime.classes ?? {}) : runtimeClass ? [runtimeClass] : []
  const edge = selection.kind === 'reference' ? scene.references.find((item) => item.id === selection.id) : undefined
  const slot = selection.kind === 'slot'
    ? [...Object.values(runtime.frames).flatMap((f) => Object.values(f.locals)), ...Object.values(runtime.objects).flatMap((o) => [...Object.values(o.fields), ...(o.array?.elements ?? []), ...Object.values(o.array?.sparseElements ?? {})]), ...Object.values(runtime.classes ?? {}).flatMap(c => Object.values(c.statics)), ...scene.frames.flatMap((f) => f.slots)].find((item) => item.id === selection.id)
    : undefined
  const lifetime = selection.kind === 'slot' ? runtime.variableLifetimes?.slice().reverse().find((item) => item.slot.id === selection.id) : undefined
  const scope = lifetime ? runtime.scopes[lifetime.scopeId] : undefined
  const lifetimeLive = !!lifetime && lifetime.exitedAt === undefined && runtime.frames[lifetime.frameId]?.status === 'active'
  const inspectedSlot = slot ?? lifetime?.slot
  const arrayOwner = slot && Object.values(runtime.objects).find((object) => [...(object.array?.elements ?? []), ...Object.values(object.array?.sparseElements ?? {})].some((cell) => cell.id === slot.id))
  const elementIndex = arrayOwner && slot ? Number(slot.name.slice(1, -1)) : undefined
  const writes = runtime.arrayMutations.filter((item) => item.objectId === (object?.id ?? arrayOwner?.id) && (elementIndex === undefined || item.index === elementIndex))
  const available = Boolean(object || frame || edge || inspectedSlot || runtimeClass)
  const heading = object ? `${displayJavaType(object.className)} #${object.displayId}`
    : frame ? `${frame.className}.${frame.invocationLabel ?? `${frame.methodName}()`}`
      : selection.kind === 'class' && runtimeClass ? `${displayJavaType(runtimeClass.className)} · class state`
      : edge ? 'Reference path'
        : inspectedSlot ? arrayOwner ? `${arrayOwner.className} #${arrayOwner.displayId} ${inspectedSlot.name}` : inspectedSlot.name : 'Outside this moment'

  return <aside className="inspector" aria-label="Runtime inspector">
    <header className="inspector-header">
      <div><span className="eyebrow" title={runtime.status === 'partial' ? 'Later Java changes were not observed.' : undefined}>{runtime.status === 'partial' ? 'Last recorded state' : 'INSPECTOR'}</span><h2 title={frame ? `${frame.className}.${frame.invocationLabel ?? `${frame.methodName}()`}` : object?.className}>{frame ? <>{displayJavaType(frame.className)}.<wbr />{frame.invocationLabel ?? `${frame.methodName}()`}</> : heading}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label="Close inspector"><X size={16} /></button>
    </header>
    {!available ? <div className="inspector-body"><p className="inspector-empty">This entity is outside the live runtime at this step. Its identity is retained; seek to an event where it exists to inspect it.</p></div> : <div className="inspector-body">
      {object && <>
        {object.metadata && <div className="inspector-key"><span>OWNERSHIP · PACKAGE</span><strong>{object.metadata.ownership} · {object.metadata.packageName || '(default package)'}</strong><span>{object.metadata.record ? 'Record' : object.metadata.enum ? 'Enum' : object.metadata.synthetic ? 'Synthetic / anonymous' : 'Runtime type'}</span></div>}
        {object.library && <div className="inspector-key"><span>SEMANTIC SUMMARY · LAST OBSERVED</span><strong>{object.library.kind} · {object.library.size === undefined ? 'size unavailable' : `size ${object.library.size}`}</strong><span>{object.library.order ?? 'order unavailable'}{object.library.truncated ? ' · bounded preview' : ''}{object.library.reason ? ` · ${object.library.reason}` : ''}</span></div>}
        {object.string && <div className="inspector-key"><span>STRING · UTF-16 LENGTH</span><strong>{object.string.length}</strong><span>{object.string.truncated ? 'Bounded preview; remaining text not observed' : 'Complete text observed'}</span></div>}
        {object.array ? <><div className="inspector-key"><span>TYPE · LENGTH</span><strong>{object.className} · {object.array.length}</strong>{object.array.truncated && <span>Bounded prefix; other cells unavailable until observed.</span>}</div><section className="inspector-group"><h3>Indexed elements · observed</h3><SlotRows slots={[...object.array.elements, ...Object.values(object.array.sparseElements ?? {}).sort((a, b) => Number(a.name.slice(1, -1)) - Number(b.name.slice(1, -1)))]} objects={runtime.objects} /></section></> : <><div className="inspector-key"><span>JAVA CLASS</span><strong>{object.className}</strong></div><section className="inspector-group"><h3>{object.library ? 'Summary values · last observed' : object.string ? 'Text preview' : 'Fields · last observed'}</h3><SlotRows slots={Object.values(object.fields)} objects={runtime.objects} /></section></>}
        <section className="inspector-group"><h3>Inbound references</h3>
        <div className="reference-list">{scene.references.filter((ref) => ref.targetObjectId === object.id).map((ref) => (
          <button key={ref.id} onClick={() => onTrace(ref.id)}>
            <span>{sourceName(ref.source)}{ref.historical ? ' · last recorded binding' : ''}</span><span>Trace path ↗</span>
          </button>
        ))}</div></section>
      </>}
      {frame && <><div className="inspector-key"><span>CALL DEPTH · {runtime.status === 'partial' && frame.status === 'active' ? 'LAST RECORDED' : frame.status.toUpperCase()}</span><strong>{frame.depth}</strong><span title={frame.className}>{frame.className}</span></div><section className="inspector-group"><h3>Locals & operands</h3><SlotRows slots={Object.values(frame.locals)} objects={runtime.objects} /></section>{frame.returnValue && <div className="inspector-key inspector-key--primary"><span>RETURN VALUE</span><strong>{formatValue(frame.returnValue)}</strong></div>}</>}
      {inspectedClasses.map(owner => <section className="inspector-group" key={owner.id}><h3>Class statics · {owner.className} · {owner.initialization}</h3><SlotRows slots={Object.values(owner.statics)} objects={runtime.objects} /></section>)}
      {edge && <><div className="inspector-key"><span>{edge.historical ? 'LAST RECORDED BINDING' : 'SOURCE'}</span><strong>{sourceName(edge.source)}</strong></div><div className="inspector-key"><span>TARGET</span><strong>{runtime.objects[edge.targetObjectId]?.className} #{runtime.objects[edge.targetObjectId]?.displayId}</strong></div><button className="inspector-action" onClick={() => onTrace(edge.id)}>Follow this path</button></>}
      {inspectedSlot && <>{arrayOwner?.array && <div className="inspector-key"><span>ARRAY · LENGTH · INDEX</span><strong>#{arrayOwner.displayId} · {arrayOwner.array.length} · {elementIndex}</strong></div>}<div className="inspector-key"><span>TYPE</span><strong>{inspectedSlot.javaType}</strong></div><div className="inspector-key"><span>VALUE</span><strong>{formatValue(inspectedSlot.value, runtime.objects)}</strong></div></>}
      {lifetime && <div className="inspector-key"><span>SCOPE · {lifetimeLive ? runtime.status === 'partial' ? 'LAST RECORDED' : 'LIVE' : 'CLOSED'}</span><strong>{scope?.label ?? lifetime.scopeId}</strong><span>{lifetime.source ? `Declared L${lifetime.source.line}` : 'Declaration'} · {lifetimeLive && runtime.status !== 'partial' ? 'current value' : 'last value'}</span></div>}
      {flow && <section className="inspector-group" aria-label="Selected value transfer"><h3>Value transfer</h3>
        <div className="inspector-key"><span>KIND · EVIDENCE</span><strong>{flow.kind.replaceAll('-', ' ')} · {flow.evidence}</strong></div>
        {flow.value && <div className="inspector-key"><span>VALUE</span><strong>{formatValue(flow.value, runtime.objects)}</strong></div>}
        <div className="inspector-key"><span>FROM</span><strong>{endpointName(flow.from)}</strong></div>
        <div className="inspector-key"><span>TO</span><strong>{endpointName(flow.to)}</strong></div>
        <div className="inspector-key"><span>SOURCE · SEQUENCE</span><strong>{flow.source ? `${flow.source.fileId}:${flow.source.line}` : 'source unavailable'} · {flow.seq}</strong></div>
      </section>}
      {(object?.array || arrayOwner) && <div className="inspector-key"><span>INDEXED WRITES</span><strong>{writes.length}</strong></div>}
    </div>}
    <footer className="inspector-footer">
      <button onClick={onFocus} disabled={!available || (!!lifetime && !lifetimeLive)}><Crosshair size={15} /> Focus</button>
      <button onClick={onReturn}><CornerUpLeft size={15} /> Return to world</button>
    </footer>
  </aside>
}
