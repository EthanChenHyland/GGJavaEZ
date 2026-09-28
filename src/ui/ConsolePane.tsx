import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { ConsoleEntry, RuntimeState } from '../contracts/runtime'
import { line, radiusPx, spacingPx, typography } from '../theme/tokens'
import './ConsolePane.css'

export interface ConsolePaneProps {
  /** The already-applied runtime prefix, replaced by the caller when seeking. */
  entries: ConsoleEntry[]
  activeEventId: string | null
  status: RuntimeState['status']
  compact?: boolean
}

const theme = {
  '--console-font': typography.ui,
  '--console-code-font': typography.code,
  '--console-font-size': `${typography.runtimeMicroPx}px`,
  '--console-gap': `${spacingPx[1]}px`,
  '--console-padding': `${spacingPx[2]}px`,
  '--console-radius': `${radiusPx.control}px`,
  '--console-border-width': `${line.uiBorderPx}px`,
} as CSSProperties

const statusLabel: Record<RuntimeState['status'], string> = {
  ready: 'Ready', running: 'In progress', ended: 'Ended', aborted: 'Stopped',
}

export function ConsolePane({ entries, activeEventId, status, compact = false }: ConsolePaneProps) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const viewport = useRef<HTMLDivElement>(null)
  const open = !compact || expanded
  const latest = entries.at(-1)

  useEffect(() => {
    // Scroll only this pane, without motion or moving the world/source viewport.
    // Replacing the prefix on reverse seek also returns to its new final entry.
    if (open && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
  }, [activeEventId, entries, open])

  return (
    <section className={`console-pane${compact ? ' console-pane--compact' : ''}`}
      style={theme} aria-label="Runtime console" data-console-status={status}>
      <header className="console-pane__heading">
        <span className="console-pane__title">CONSOLE</span>
        <span className="console-pane__count">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
        {compact && !open && (
          <span className="console-pane__summary">
            {latest ? <>
              <span className="console-pane__kind">{latest.kind === 'input' ? 'INPUT' : 'OUTPUT'}</span>
              <code className="console-pane__last-line" title={latest.text}>{latest.text}</code>
            </> : <span className="console-pane__empty">No console entries at this step.</span>}
          </span>
        )}
        <span className="console-pane__status" aria-label={`Execution status: ${statusLabel[status]}`}>
          {statusLabel[status]}
        </span>
        {compact && (
          <button className="console-pane__toggle" type="button" aria-expanded={expanded}
            aria-controls={listId} onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Collapse console' : 'Expand console'}
          </button>
        )}
      </header>
      <div className="console-pane__viewport" id={listId} ref={viewport} hidden={!open}
        tabIndex={open && entries.length > 0 ? 0 : undefined} role="region" aria-label="Applied console entries">
        {open && (entries.length > 0 ? (
          <ol className="console-pane__entries">
            {entries.map((entry) => (
              <li key={entry.eventId} className="console-pane__entry" data-console-kind={entry.kind}
                data-console-event-id={entry.eventId} aria-current={entry.eventId === activeEventId ? 'step' : undefined}
                title={entry.source ? `${entry.source.fileId}:${entry.source.line}` : 'No source location'}>
                <span className="console-pane__kind">{entry.kind === 'input' ? 'INPUT' : 'OUTPUT'}</span>
                <pre className="console-pane__text">{entry.text}</pre>
                <span className="console-pane__source"
                  title={entry.source ? `${entry.source.fileId}:${entry.source.line}` : 'No source location'}
                  aria-label={entry.source ? `Source ${entry.source.fileId}, line ${entry.source.line}` : 'No source location'}>
                  {entry.source ? `L${entry.source.line}` : '—'}
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="console-pane__empty">No console entries at this step.</p>)}
      </div>
    </section>
  )
}
