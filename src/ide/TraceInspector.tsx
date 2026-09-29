import { useId, useMemo, useState } from 'react'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import type { RawRuntimeEvent } from '../instrumentation/contracts'
import './TraceInspector.css'

export interface TraceInspectorProps {
  trace: TraceDocument
  rawEvents?: RawRuntimeEvent[]
}

export interface TraceInspectorRow {
  seq: number
  type: string
  thread: string
  frame: string
  object: string
  source: string
  payload: string
}

type EventRecord = Record<string, unknown>
const absent = '—'
const pageSize = 200

function textId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : absent
}

function objectIds(event: EventRecord): string {
  const ids = [event.objectId, event.targetObjectId, event.exceptionId]
  const sourceSlot = event.sourceSlot
  if (sourceSlot && typeof sourceSlot === 'object' && 'objectId' in sourceSlot) {
    ids.push(sourceSlot.objectId)
  }
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].join(', ') || absent
}

/** Normalize only display columns; never infer a thread or align separate event clocks. */
export function traceInspectorRows(events: readonly TraceEvent[] | readonly RawRuntimeEvent[], view: 'normalized' | 'raw'): TraceInspectorRow[] {
  return events.map((event) => {
    const record = event as unknown as EventRecord
    const normalizedSource = record.source
    const source = view === 'normalized'
      ? normalizedSource && typeof normalizedSource === 'object' && 'fileId' in normalizedSource && 'line' in normalizedSource
        ? `${normalizedSource.fileId}:${normalizedSource.line}` : absent
      : [record.className, record.methodName].filter((part) => typeof part === 'string' && part.length > 0).join('.') || absent
    const rawLocation = view === 'raw'
      ? `${source}${typeof record.line === 'number' ? `:${record.line}` : ''}${typeof record.site === 'number' ? ` @${record.site}` : ''}`
      : source
    return {
      seq: event.seq,
      type: event.type,
      thread: textId(record.threadId),
      frame: textId(record.frameId),
      object: objectIds(record),
      source: rawLocation,
      payload: JSON.stringify(event),
    }
  })
}

export function filterTraceInspectorRows(rows: readonly TraceInspectorRow[], type: string, search: string): TraceInspectorRow[] {
  const needle = search.trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (type && row.type !== type) return false
    if (!needle) return true
    return [row.seq, row.type, row.thread, row.frame, row.object, row.source, row.payload]
      .some((value) => String(value).toLocaleLowerCase().includes(needle))
  })
}

/** Mount in a developer surface; the disclosure stays quiet until opened. */
export function TraceInspector({ trace, rawEvents }: TraceInspectorProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'normalized' | 'raw'>('normalized')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const baseId = useId()
  const activeView = view === 'raw' && rawEvents ? 'raw' : 'normalized'
  const events = activeView === 'raw' ? rawEvents ?? [] : trace.events
  const rows = useMemo(() => open ? traceInspectorRows(events, activeView) : [], [activeView, events, open])
  const types = useMemo<string[]>(() => [...new Set(events.map((event) => event.type))].sort(), [events])
  const activeType = types.includes(type) ? type : ''
  const filtered = useMemo(() => filterTraceInspectorRows(rows, activeType, search), [rows, activeType, search])
  const shown = filtered.slice(0, visibleCount)

  return (
    <details className="trace-inspector" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="trace-inspector__summary">
        <span>TRACE</span><span className="trace-inspector__dev">DEV</span>
        <span className="trace-inspector__total">{trace.events.length} normalized events</span>
      </summary>
      {open && <div className="trace-inspector__body">
        <div className="trace-inspector__controls">
          {rawEvents && <label htmlFor={`${baseId}-view`}>View
            <select id={`${baseId}-view`} value={activeView} onChange={(event) => { setView(event.target.value as 'normalized' | 'raw'); setType(''); setVisibleCount(pageSize) }}>
              <option value="normalized">Normalized</option>
              <option value="raw">Raw recorder</option>
            </select>
          </label>}
          <label htmlFor={`${baseId}-type`}>Type
            <select id={`${baseId}-type`} value={activeType} onChange={(event) => { setType(event.target.value); setVisibleCount(pageSize) }}>
              <option value="">All types</option>
              {types.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}
            </select>
          </label>
          <label htmlFor={`${baseId}-search`}>Search
            <input id={`${baseId}-search`} type="search" value={search} placeholder="ID, source, payload…"
              onChange={(event) => { setSearch(event.target.value); setVisibleCount(pageSize) }} />
          </label>
          <span className="trace-inspector__count" role="status">{filtered.length} of {events.length} events</span>
        </div>
        <div className="trace-inspector__scroll" role="region" aria-label={`${activeView === 'raw' ? 'Raw recorder' : 'Normalized'} trace events`} tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Seq</th><th scope="col">Type</th><th scope="col">Thread</th><th scope="col">Frame</th><th scope="col">Object</th><th scope="col">Source</th><th scope="col">Payload</th></tr></thead>
            <tbody>{shown.map((row, index) => <tr key={`${activeView}:${row.seq}:${index}`}>
              <td>{row.seq}</td><td>{row.type}</td><td>{row.thread}</td><td>{row.frame}</td><td>{row.object}</td><td>{row.source}</td>
              <td><code>{row.payload}</code></td>
            </tr>)}</tbody>
          </table>
          {filtered.length === 0 && <p className="trace-inspector__empty">No matching events.</p>}
        </div>
        {visibleCount < filtered.length && <button className="trace-inspector__more" type="button" onClick={() => setVisibleCount((count) => count + pageSize)}>
          Show next {Math.min(pageSize, filtered.length - visibleCount)} events
        </button>}
      </div>}
    </details>
  )
}
