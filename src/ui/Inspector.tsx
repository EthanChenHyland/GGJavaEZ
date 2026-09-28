import { X, Crosshair, CornerUpLeft } from 'lucide-react'
import type { Selection } from '../contracts/interaction'
import type { RuntimeSlot, RuntimeState, RuntimeValue } from '../contracts/runtime'
import type { SceneModel } from '../contracts/world'

export function formatValue(value: RuntimeValue, objects?: RuntimeState['objects']): string {
  switch (value.kind) {
    case 'uninitialized': return 'uninitialized'
    case 'null': return 'null'
    case 'primitive': return String(value.value)
    case 'stringSummary': return `"${value.value}"`
    case 'reference': {
      const object = objects?.[value.objectId]
      return object ? `→ ${object.className} #${object.displayId}` : `→ ${value.objectId}`
    }
  }
}

function SlotRows({ slots, objects }: { slots: RuntimeSlot[]; objects: RuntimeState['objects'] }) {
  if (!slots.length) return <p className="inspector-empty">No values yet.</p>
  return <div className="inspector-rows">{slots.map((slot) => (
    <div className="inspector-row" key={slot.id}>
      <span title={slot.role}>{slot.role === 'operand' ? 'call result' : slot.name}</span><span className="inspector-type">{slot.javaType}</span><strong>{formatValue(slot.value, objects)}</strong>
    </div>
  ))}</div>
}

interface InspectorProps {
  selection: Selection
  runtime: RuntimeState
  scene: SceneModel
  onClose: () => void
  onReturn: () => void
  onFocus: () => void
  onTrace: (referenceId: string) => void
}

export function Inspector({ selection, runtime, scene, onClose, onReturn, onFocus, onTrace }: InspectorProps) {
  if (!selection) return null

  const object = selection.kind === 'object' ? runtime.objects[selection.id] : undefined
  const frame = selection.kind === 'frame' ? runtime.frames[selection.id] : undefined
  const edge = selection.kind === 'reference' ? scene.references.find((item) => item.id === selection.id) : undefined
  const slot = selection.kind === 'slot'
    ? [...Object.values(runtime.frames).flatMap((f) => Object.values(f.locals)), ...Object.values(runtime.objects).flatMap((o) => Object.values(o.fields)), ...scene.frames.flatMap((f) => f.slots)].find((item) => item.id === selection.id)
    : undefined
  const available = Boolean(object || frame || edge || slot)
  const heading = object ? `${object.className} #${object.displayId}`
    : frame ? `${frame.className}.${frame.invocationLabel ?? `${frame.methodName}()`}`
      : edge ? 'Reference path'
        : slot ? slot.name : 'Outside this moment'

  const side = selection.kind === 'object' || selection.kind === 'reference' ? ' inspector--left' : ''
  return <aside className={`inspector${side}`} aria-label="Runtime inspector">
    <header className="inspector-header">
      <div><span className="eyebrow">INSPECTOR</span><h2>{frame ? <>{frame.className}.<wbr />{frame.invocationLabel ?? `${frame.methodName}()`}</> : heading}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label="Close inspector"><X size={16} /></button>
    </header>
    {!available ? <div className="inspector-body"><p className="inspector-empty">This entity is outside the live runtime at this step. Its identity is retained; seek to an event where it exists to inspect it.</p></div> : <div className="inspector-body">
      {object && <>
        <section className="inspector-group"><h3>Fields</h3><SlotRows slots={Object.values(object.fields)} objects={runtime.objects} /></section>
        <section className="inspector-group"><h3>Inbound references</h3>
        <div className="reference-list">{scene.references.filter((ref) => ref.targetObjectId === object.id).map((ref) => (
          <button key={ref.id} onClick={() => onTrace(ref.id)}>
            <span>{ref.source.slotId.split(':').at(-1)}</span><span>Trace path ↗</span>
          </button>
        ))}</div></section>
      </>}
      {frame && <><div className="inspector-key"><span>CALL DEPTH · {frame.status.toUpperCase()}</span><strong>{frame.depth}</strong></div><section className="inspector-group"><h3>Locals & operands</h3><SlotRows slots={Object.values(frame.locals)} objects={runtime.objects} /></section>{frame.returnValue && <div className="inspector-key"><span>RETURN VALUE</span><strong>{formatValue(frame.returnValue)}</strong></div>}</>}
      {edge && <><div className="inspector-key"><span>SOURCE</span><strong>{edge.source.slotId.split(':').at(-1)}</strong></div><div className="inspector-key"><span>TARGET</span><strong>{runtime.objects[edge.targetObjectId]?.className} #{runtime.objects[edge.targetObjectId]?.displayId}</strong></div><button className="inspector-action" onClick={() => onTrace(edge.id)}>Follow this path</button></>}
      {slot && <><div className="inspector-key"><span>TYPE</span><strong>{slot.javaType}</strong></div><div className="inspector-key"><span>VALUE</span><strong>{formatValue(slot.value, runtime.objects)}</strong></div></>}
    </div>}
    <footer className="inspector-footer">
      <button onClick={onFocus} disabled={!available || frame?.status === 'returned'}><Crosshair size={15} /> Focus</button>
      <button onClick={onReturn}><CornerUpLeft size={15} /> Return to world</button>
    </footer>
  </aside>
}
