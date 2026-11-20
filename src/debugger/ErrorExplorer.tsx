import { useMemo, useState } from 'react'
import type { Selection } from '../contracts/interaction'
import type { RuntimeSlot, RuntimeState, SlotOwner, SourceLocation, TraceDocument, TraceEvent } from '../contracts/runtime'
import { seek } from '../runtime'
import { formatValue } from './formatValue'
import { causeHistory, type CauseTarget } from './causality'
import { committedExceptionCursor } from './exceptionCursor'

export function ErrorExplorer({ trace, runtime, selection, stderr, onNavigate, onRevealSource, onSelectFrame }: {
  trace: TraceDocument; runtime: RuntimeState | null; selection: Selection; stderr: string
  onNavigate: (cursor: number, selection?: Selection) => void
  onRevealSource: (location: SourceLocation) => void
  onSelectFrame: (frameId: string) => void
}) {
  const cursor = Math.min(runtime?.cursor ?? 0, trace.events.length)
  const failures = runtime?.exceptions ?? []
  const [chosen, setChosen] = useState('')
  const failure = failures.find((item) => item.eventId === chosen) ?? failures.at(-1)
  const throwIndex = failure ? trace.events.findIndex((event) => event.eventId === failure.eventId && event.type === 'THROW_EXCEPTION') : -1
  const throwCursor = throwIndex >= 0 && throwIndex < cursor ? committedExceptionCursor(trace, throwIndex) : null
  const snapshotCursor = throwCursor === null ? null : Math.min(cursor, throwCursor)
  const snapshot = useMemo(() => snapshotCursor === null ? null : seek(trace, snapshotCursor), [trace, snapshotCursor])
  const snapshotFrames = snapshot?.frames ?? {}, snapshotObjects = snapshot?.objects ?? {}
  const [target, setTarget] = useState<{episode: string; value: CauseTarget} | null>(null)
  const [tracing, setTracing] = useState(false)
  const [section, setSection] = useState<'failure' | 'stack' | 'cause'>('failure')
  const [returnTarget, setReturnTarget] = useState<{recordingId: string; episode: string; index: number} | null>(null)
  const findTarget = (id: string): CauseTarget | null => {
    for (const frame of Object.values(snapshotFrames)) if (frame.locals[id]) return { kind: 'frame', frameId: frame.id, slotId: id }
    for (const object of Object.values(snapshotObjects)) {
      if (object.fields[id]) return { kind: 'object', objectId: object.id, slotId: id }
      const index = object.array?.elements.findIndex((cell) => cell.id === id) ?? -1
      if (index >= 0) return { kind: 'array', objectId: object.id, index }
    }
    return null
  }
  const currentTarget = target?.episode === failure?.eventId ? target?.value ?? null : null
  const tracingCurrent = tracing && currentTarget !== null
  const chooseTarget = (value: CauseTarget | null) => setTarget(value && failure ? {episode: failure.eventId, value} : null)
  const effectiveTarget = tracingCurrent ? currentTarget : selection?.kind === 'slot' ? findTarget(selection.id) ?? currentTarget : currentTarget
  const targetLabel = effectiveTarget?.kind === 'frame' ? snapshotFrames[effectiveTarget.frameId]?.locals[effectiveTarget.slotId]?.name
    : effectiveTarget?.kind === 'object' ? snapshotObjects[effectiveTarget.objectId]?.fields[effectiveTarget.slotId]?.name
      : effectiveTarget?.kind === 'array' ? `[${effectiveTarget.index}]` : ''
  const causes = effectiveTarget && snapshotCursor !== null ? causeHistory(trace, effectiveTarget, snapshotCursor) : []
  const valueRow = (slot: RuntimeSlot, owner: SlotOwner) => <button key={slot.id} className={`debug-value ${selection?.id === slot.id ? 'is-selected' : ''}`} onClick={() => {
    if (throwCursor === null) return
    chooseTarget(owner); setTracing(false); setSection('cause'); onNavigate(throwCursor, { kind: 'slot', id: slot.id })
  }}><span>{slot.name}<small>{slot.role === 'parameter' ? 'parameter · ' : ''}{slot.javaType}</small></span><code className={slot.value.kind === 'null' ? 'is-null' : ''}>{slot.value.kind === 'uninitialized' ? 'unavailable' : formatValue(slot.value, snapshotObjects)}</code></button>
  const jumpToCause = (node: ReturnType<typeof causeHistory>[number], preserveReturn: boolean) => {
    if (!preserveReturn && failure && throwCursor !== null) setReturnTarget({recordingId: trace.demoId, episode: failure.eventId, index: throwIndex})
    onNavigate(node.cursor, node.selection)
  }
  const causeList = (entries: ReturnType<typeof causeHistory>, preserveReturn = false) => <ol className="cause-list">{entries.map((node) => <li key={JSON.stringify([node.eventId, node.selection.kind, node.selection.id])}><button aria-current={cursor === node.cursor ? 'step' : undefined} onClick={() => jumpToCause(node, preserveReturn)}><strong>{node.label}</strong><small>{node.source ? `${node.source.fileId}:${node.source.line}` : 'source unavailable'}</small></button></li>)}</ol>
  const bookmark = runtime && returnTarget?.recordingId === trace.demoId ? returnTarget : null
  const bookmarkEvent = bookmark ? trace.events[bookmark.index] : null
  const resumeCursor = bookmark && bookmarkEvent?.eventId === bookmark.episode && bookmarkEvent.type === 'THROW_EXCEPTION' ? committedExceptionCursor(trace, bookmark.index) : null
  const historicalCauses = bookmark && tracing && target?.episode === bookmark.episode ? causeHistory(trace, target.value, cursor) : null
  const bookmarkedHistory = bookmark && <>
    <button className="debug-action" disabled={resumeCursor === null} title={resumeCursor === null ? 'Recorded throw Event is unavailable' : 'Go to the previously inspected recorded throw without changing Selection'} onClick={() => { if (resumeCursor !== null) onNavigate(resumeCursor) }}>{failure ? 'Return to inspected failure' : 'Return to failure'}</button>
    {historicalCauses && <><h3>Captured value history</h3><p>Only values observed at the selected Event are shown. The inspected exception is unavailable before its throw.</p>{causeList(historicalCauses, true)}</>}
  </>
  if (!failure) {
    return <section className="error-explorer" aria-label="Error Explorer" data-section="failure"><p className="debug-empty">{runtime ? 'No exception has been observed at this Event.' : 'Runtime evidence is unavailable at this Event.'}</p>{bookmark && <div className="error-summary" style={{gridColumn: '1 / -1'}}>
      {bookmarkedHistory}
    </div>}</section>
  }
  const sourceLine = failure.source ? trace.sourceFiles.find((file) => file.fileId === failure.source!.fileId)?.content.split('\n')[failure.source.line - 1] : null
  const sourceAvailable = !!failure.source && Number.isInteger(failure.source.line) && failure.source.line > 0 && sourceLine !== null && sourceLine !== undefined
  const lifecycle: Array<{event: TraceEvent; cursor: number}> = []
  const laterEvents: Array<{event: TraceEvent; cursor: number}> = []
  for (let index = throwIndex; index >= 0 && index < trace.events.length; index++) {
    const event = trace.events[index]
    if (index > throwIndex && event.type === 'THROW_EXCEPTION' && event.exceptionId === failure.exceptionId) break
    if ('exceptionId' in event && event.exceptionId === failure.exceptionId) (index < cursor ? lifecycle : laterEvents).push({event, cursor: committedExceptionCursor(trace, index)})
  }
  const runCrashed = runtime?.status === 'aborted' && !!runtime.abortReason?.startsWith('program_crashed:')
  return <section className="error-explorer" aria-label="Error Explorer" data-section={section}>
    <nav className="error-section-nav" aria-label="Error Explorer sections">
      <button type="button" aria-pressed={section === 'failure'} onClick={() => setSection('failure')}>Failure</button>
      <button type="button" aria-pressed={section === 'stack'} onClick={() => setSection('stack')}>Stack & path</button>
      <button type="button" aria-pressed={section === 'cause'} onClick={() => setSection('cause')}>Cause</button>
    </nav>
    <div className="error-summary">
      <span className="debug-eyebrow">ERROR EXPLORER · {failure.caughtBy ? 'CAUGHT' : 'OBSERVED'}{runCrashed ? ' · RUN CRASHED' : ''}</span>
      {failures.length > 1 && <select aria-label="Exception episode" value={failure.eventId} onChange={(event) => { setChosen(event.target.value); setTarget(null); setTracing(false); setSection('failure') }}>{failures.map((item, index) => <option key={item.eventId} value={item.eventId}>{index + 1} · {item.className}</option>)}</select>}
      <h2>{failure.className.split('.').at(-1)}</h2><p>{failure.className}</p><p>{failure.message === null ? 'Message unavailable or null' : failure.message === '' ? 'Message: "" (captured empty string)' : failure.message}</p>
      <button className="debug-source" disabled={!sourceAvailable} title={sourceAvailable ? 'Reveal captured source without moving execution or Selection' : 'Recorded source is unavailable'} onClick={() => { if (sourceAvailable && failure.source) onRevealSource(failure.source) }}><span>Reveal Source · {failure.source ? `${failure.source.fileId}:${failure.source.line}` : 'Source unavailable'}</span><code>{sourceLine?.trim()}</code></button>
      <button className="debug-action" disabled={throwCursor === null} title={throwCursor === null ? 'Recorded throw Event is unavailable at this prefix' : 'Go to the recorded throw without changing Selection'} onClick={() => { if (throwCursor !== null) onNavigate(throwCursor) }}>Return to failure</button>
      <details className="debug-notes"><summary>Captured exception evidence</summary><p>Class and message observed · {failure.eventId}</p><p>Path: {lifecycle.length} captured Events at this prefix. Path bounds unavailable; this list covers captured Events only.</p><p>Stack text unavailable · No captured stack-text fact</p><p>Cause chain unavailable · No captured cause-chain fact</p>{runtime?.recordingStop && <p>Recording · {runtime.recordingStop.state}</p>}</details>
      <details><summary>Actual JVM stderr / stack trace</summary><p>Full process output · separate from recorded exception evidence</p><pre>{stderr || 'No terminal stack trace yet; the JVM may be paused at the throw.'}</pre></details>
    </div>
    <div className="error-stack"><h3>Stack at throw</h3>{failure.frameIds.slice().reverse().map((id) => {
      const atThrow = snapshotFrames[id], frame = atThrow ?? runtime?.frames[id]
      if (!frame) return <p key={id} className="debug-empty">Frame {id} unavailable · Frame is not present at the current Event</p>
      const status = failure.unwoundFrameIds.includes(id) ? 'unwound' : failure.caughtBy === id ? 'caught here' : 'at throw'
      const selectable = !!runtime?.frames[id]
      return <details key={id} open={id === failure.frameIds.at(-1)}><summary><button disabled={!selectable} aria-label={`Select frame ${frame.className}.${frame.methodName}()`} title={selectable ? 'Select this frame without moving execution or the camera' : 'Frame is not present at the current Event'} onClick={() => { if (selectable) onSelectFrame(id) }}>{frame.className}.{frame.methodName}()</button><span>{status}</span></summary>{atThrow ? Object.values(atThrow.locals).map((slot) => valueRow(slot, { kind: 'frame', frameId: id, slotId: slot.id })) : <p className="debug-empty">Throw snapshot unavailable · Recorded throw Event is unavailable at this prefix</p>}</details>
    })}<h3>Observed exception path</h3><div className="exception-path">{lifecycle.map(({ event, cursor }) => <button key={event.eventId} title="Go to this recorded Event without changing Selection" aria-current={runtime?.cursor === cursor ? 'step' : undefined} onClick={() => onNavigate(cursor)}>{event.type === 'THROW_EXCEPTION' ? 'Throw' : event.type === 'UNWIND_EXCEPTION' ? 'Unwind' : event.type === 'FINALLY_ENTER' ? 'Finally / cleanup handler' : 'Catch'}<small>{event.source ? `${event.source.fileId}:${event.source.line}` : 'source unavailable'}</small></button>)}</div>{laterEvents.length > 0 && <><h3>Later recorded Events</h3><p>Navigation targets from the accepted recording. These Events are not applied at the selected Event.</p><div className="exception-navigation">{laterEvents.map(({event, cursor}) => <button key={event.eventId} className="debug-action" title="Go to this accepted recorded Event without changing Selection" onClick={() => onNavigate(cursor)}>Go to recorded {event.type === 'THROW_EXCEPTION' ? 'Throw' : event.type === 'UNWIND_EXCEPTION' ? 'Unwind' : event.type === 'FINALLY_ENTER' ? 'Finally / cleanup handler' : 'Catch'}<small> · {event.eventId}</small></button>)}</div></>}</div>
    <div className="error-causes">{bookmark && bookmark.episode !== failure.eventId && bookmarkedHistory}<h3>Trace Cause{targetLabel && <span className="error-cause-target"> · {targetLabel}</span>}</h3>
      {!effectiveTarget && <p className="debug-empty">Select a value in Stack at throw or an object below.</p>}
      {Object.values(snapshotObjects).map((object) => <details key={object.id}><summary>{object.className} #{object.displayId}</summary>{Object.values(object.fields).map((slot) => valueRow(slot, { kind: 'object', objectId: object.id, slotId: slot.id }))}{object.array?.elements.map((slot, index) => <button key={slot.id} className="debug-value" onClick={() => { if (throwCursor === null) return; chooseTarget({ kind: 'array', objectId: object.id, index }); setTracing(false); onNavigate(throwCursor, { kind: 'slot', id: slot.id }) }}><span>[{index}]</span><code>{formatValue(slot.value)}</code></button>)}</details>)}
      <button className="debug-action" disabled={!causes.length} onClick={() => { chooseTarget(effectiveTarget); setTracing(true) }}>Trace Cause</button>
      {tracingCurrent && causeList(causes)}
      <details className="debug-notes"><summary>Trace limits</summary><p>Earlier writes are value history. Expression dependencies and unnamed return destinations are not inferred.</p></details>
    </div>
  </section>
}
