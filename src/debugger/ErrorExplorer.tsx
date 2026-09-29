import { useMemo, useState } from 'react'
import type { Selection } from '../contracts/interaction'
import type { RuntimeSlot, RuntimeState, SlotOwner, TraceDocument } from '../contracts/runtime'
import { seek } from '../runtime'
import { formatValue } from '../ui/Inspector'
import { causeHistory, type CauseTarget } from './causality'
import './debugger.css'

export function ErrorExplorer({ trace, runtime, selection, stderr, onNavigate }: {
  trace: TraceDocument; runtime: RuntimeState | null; selection: Selection; stderr: string
  onNavigate: (cursor: number, selection?: Selection) => void
}) {
  const complete = useMemo(() => seek(trace, trace.events.length), [trace])
  const failures = complete.exceptions
  const [chosen, setChosen] = useState('')
  const failure = failures.find((item) => item.eventId === chosen) ?? failures.at(-1)
  const throwCursor = failure ? trace.events.findIndex((event) => event.eventId === failure.eventId) + 1 : 0
  const snapshot = useMemo(() => seek(trace, throwCursor), [trace, throwCursor])
  const [target, setTarget] = useState<CauseTarget | null>(null)
  const [tracing, setTracing] = useState(false)
  const findTarget = (id: string): CauseTarget | null => {
    for (const frame of Object.values(snapshot.frames)) if (frame.locals[id]) return { kind: 'frame', frameId: frame.id, slotId: id }
    for (const object of Object.values(snapshot.objects)) {
      if (object.fields[id]) return { kind: 'object', objectId: object.id, slotId: id }
      const index = object.array?.elements.findIndex((cell) => cell.id === id) ?? -1
      if (index >= 0) return { kind: 'array', objectId: object.id, index }
    }
    return null
  }
  const effectiveTarget = tracing && target ? target : selection?.kind === 'slot' ? findTarget(selection.id) ?? target : target
  const causes = effectiveTarget ? causeHistory(trace, effectiveTarget, throwCursor) : []
  const valueRow = (slot: RuntimeSlot, owner: SlotOwner) => <button key={slot.id} className={`debug-value ${selection?.id === slot.id ? 'is-selected' : ''}`} onClick={() => {
    setTarget(owner); setTracing(false); onNavigate(throwCursor, { kind: 'slot', id: slot.id })
  }}><span>{slot.name}<small>{slot.role === 'parameter' ? 'parameter · ' : ''}{slot.javaType}</small></span><code className={slot.value.kind === 'null' ? 'is-null' : ''}>{slot.value.kind === 'uninitialized' ? 'unavailable' : formatValue(slot.value, snapshot.objects)}</code></button>
  if (!failure) return <p className="debug-empty">No exception was observed in this execution.</p>
  const sourceLine = failure.source ? trace.sourceFiles.find((file) => file.fileId === failure.source!.fileId)?.content.split('\n')[failure.source.line - 1] : null
  const lifecycle = trace.events.flatMap((event, index) => 'exceptionId' in event && event.exceptionId === failure.exceptionId ? [{ event, cursor: index + 1 }] : [])
  const liveFailure = runtime?.exceptions.find((item) => item.eventId === failure.eventId)
  const terminalEvent = trace.events.at(-1)
  const runCrashed = terminalEvent?.type === 'PROGRAM_ABORT' && terminalEvent.reason === 'program_crashed'
  return <section className="error-explorer" aria-label="Error Explorer">
    <div className="error-summary">
      <span className="debug-eyebrow">ERROR EXPLORER · {failure.caughtBy ? 'CAUGHT' : 'OBSERVED'}{runCrashed ? ' · RUN CRASHED' : ''}</span>
      {failures.length > 1 && <select aria-label="Exception episode" value={failure.eventId} onChange={(event) => { setChosen(event.target.value); setTarget(null); setTracing(false) }}>{failures.map((item, index) => <option key={item.eventId} value={item.eventId}>{index + 1} · {item.className}</option>)}</select>}
      <h2>{failure.className.split('.').at(-1)}</h2><p>{failure.message || 'Message unavailable or empty'}</p>
      <button className="debug-source" onClick={() => onNavigate(throwCursor, { kind: 'frame', id: failure.frameIds.at(-1)! })}>{failure.source ? `${failure.source.fileId}:${failure.source.line}` : 'Source unavailable'}<code>{sourceLine?.trim()}</code></button>
      <button className="debug-action" onClick={() => onNavigate(throwCursor)}>Return to failure</button>
      <details><summary>Actual JVM stderr / stack trace</summary><pre>{stderr || 'No terminal stack trace yet; the JVM may be paused at the throw.'}</pre></details>
    </div>
    <div className="error-stack"><h3>Stack at throw</h3>{failure.frameIds.slice().reverse().map((id) => {
      const frame = snapshot.frames[id]
      if (!frame) return null
      const status = liveFailure?.unwoundFrameIds.includes(id) ? 'unwound' : liveFailure?.caughtBy === id ? 'caught here' : 'at throw'
      return <details key={id} open={id === failure.frameIds.at(-1)}><summary><button onClick={() => onNavigate(throwCursor, { kind: 'frame', id })}>{frame.className}.{frame.methodName}()</button><span>{status}</span></summary>{Object.values(frame.locals).map((slot) => valueRow(slot, { kind: 'frame', frameId: id, slotId: slot.id }))}</details>
    })}<h3>Observed exception path</h3><div className="exception-path">{lifecycle.map(({ event, cursor }) => <button key={event.eventId} aria-current={runtime?.cursor === cursor ? 'step' : undefined} onClick={() => onNavigate(cursor, 'frameId' in event ? { kind: 'frame', id: event.frameId } : undefined)}>{event.type === 'THROW_EXCEPTION' ? 'Throw' : event.type === 'UNWIND_EXCEPTION' ? 'Unwind' : event.type === 'FINALLY_ENTER' ? 'Finally / cleanup handler' : 'Catch'}<small>{event.source ? `${event.source.fileId}:${event.source.line}` : 'source unavailable'}</small></button>)}</div></div>
    <div className="error-causes"><h3>Trace Cause</h3><p>Select an observed value to inspect its recorded writes and proven bindings.</p>
      {Object.values(snapshot.objects).map((object) => <details key={object.id}><summary>{object.className} #{object.displayId}</summary>{Object.values(object.fields).map((slot) => valueRow(slot, { kind: 'object', objectId: object.id, slotId: slot.id }))}{object.array?.elements.map((slot, index) => <button key={slot.id} className="debug-value" onClick={() => { setTarget({ kind: 'array', objectId: object.id, index }); setTracing(false); onNavigate(throwCursor, { kind: 'slot', id: slot.id }) }}><span>[{index}]</span><code>{formatValue(slot.value)}</code></button>)}</details>)}
      <button className="debug-action" disabled={!causes.length} onClick={() => { setTarget(effectiveTarget); setTracing(true) }}>Trace Cause</button>
      {tracing && <ol className="cause-list">{causes.map((node) => <li key={JSON.stringify([node.eventId, node.selection.kind, node.selection.id])}><button aria-current={runtime?.cursor === node.cursor ? 'step' : undefined} onClick={() => onNavigate(node.cursor, node.selection)}><strong>{node.label}</strong><small>{node.source ? `${node.source.fileId}:${node.source.line}` : 'source unavailable'}</small></button></li>)}</ol>}
      <p className="debug-limit">Earlier writes are value history. Expression dependencies and unnamed return destinations are not inferred.</p>
    </div>
  </section>
}
