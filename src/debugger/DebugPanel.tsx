import type { RuntimeState } from '../contracts/runtime'
import type { Selection } from '../contracts/interaction'
import { formatValue } from './formatValue'
import type { DebugSession, ResolvedBreakpoint, SourceBreakpoint } from './contracts'
import './debugger.css'

export function DebugPanel({ session, runtime, breakpoints, onInspect, onRemove }: {
  session: DebugSession | null; runtime: RuntimeState | null
  breakpoints: ResolvedBreakpoint[]
  onInspect: (selection: Selection) => void; onRemove: (point: SourceBreakpoint) => void
}) {
  const activeFrameId = runtime?.activeFrameIds.at(-1)
  const activeFrame = activeFrameId ? runtime?.frames[activeFrameId] : null
  const locals = activeFrame ? Object.values(activeFrame.locals) : []
  return <section className="debug-panel" aria-label="Debugger inspection">
    <div className="debug-panel-status"><h3>{session?.status === 'paused' ? `Paused · ${session.pause?.reason}` : session ? `JVM ${session.status}` : 'Source breakpoints'}</h3>{session?.pause && <p>Thread {session.pause.threadId} · {session.pause.className}.{session.pause.methodName}() · line {session.pause.line}</p>}{session?.diagnostic && <p>{session.diagnostic}</p>}<details className="debug-notes"><summary>Debugger notes</summary><p>Click the source gutter to toggle a breakpoint. Pause waits for the next project source boundary. Unsupported values are unavailable; see Timeline → Visualization support for capture limits.</p></details></div>
    <div className="debug-panel-stack"><h3>Call stack <span>· selected timeline state</span></h3>{runtime?.activeFrameIds.slice().reverse().map((id) => <button className="debug-stack-frame" key={id} onClick={() => onInspect({ kind: 'frame', id })}>{runtime.frames[id].className}.{runtime.frames[id].methodName}()</button>)}{!runtime?.activeFrameIds.length && <p className="debug-empty">No active project frames at this cursor.</p>}</div>
    <div className="debug-panel-values"><h3>Locals / parameters</h3>{locals.map((slot) => <button className="debug-value" key={slot.id} onClick={() => onInspect({ kind: 'slot', id: slot.id })}><span>{slot.name}<small>{slot.javaType}</small></span><code className={slot.value.kind === 'null' ? 'is-null' : ''}>{slot.value.kind === 'uninitialized' ? 'unavailable' : formatValue(slot.value, runtime?.objects)}</code></button>)}</div>
    <div className="debug-panel-breakpoints"><h3>Breakpoints <span>· {breakpoints.length}</span></h3>{breakpoints.map((point) => <button key={`${point.fileId}:${point.line}`} className="debug-breakpoint-row" title={point.reason ?? 'Remove breakpoint'} onClick={() => onRemove(point)}><span className={point.status === 'verified' ? 'is-verified' : ''}>●</span> {point.fileId}:{point.line}<small>{point.status.replace('_', ' ')} · remove ×</small></button>)}</div>
  </section>
}
