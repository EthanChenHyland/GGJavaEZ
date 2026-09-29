import type { RuntimeState } from '../contracts/runtime'
import type { Selection } from '../contracts/interaction'
import { formatValue } from '../ui/Inspector'
import type { DebugSession, ResolvedBreakpoint, SourceBreakpoint } from './contracts'
import './debugger.css'

export function DebugPanel({ session, runtime, breakpoints, onInspect, onRemove }: {
  session: DebugSession | null; runtime: RuntimeState | null
  breakpoints: ResolvedBreakpoint[]
  onInspect: (selection: Selection) => void; onRemove: (point: SourceBreakpoint) => void
}) {
  return <section className="debug-panel" aria-label="Debugger inspection">
    <div><h3>{session?.status === 'paused' ? `Paused · ${session.pause?.reason}` : session ? `JVM ${session.status}` : 'Source breakpoints'}</h3>{session?.pause && <p>Thread {session.pause.threadId} · {session.pause.className}.{session.pause.methodName}() · line {session.pause.line}</p>}<p className="debug-limit">Click the source gutter to toggle a breakpoint. Pause waits for the next project source boundary.</p>{session?.diagnostic && <p>{session.diagnostic}</p>}</div>
    <div><h3>Call stack · selected timeline state</h3>{runtime?.activeFrameIds.slice().reverse().map((id) => <button className="debug-stack-frame" key={id} onClick={() => onInspect({ kind: 'frame', id })}>{runtime.frames[id].className}.{runtime.frames[id].methodName}()</button>)}{!runtime?.activeFrameIds.length && <p className="debug-empty">No active project frames at this cursor.</p>}</div>
    <div><h3>Locals / parameters</h3>{runtime?.activeFrameIds.at(-1) && Object.values(runtime.frames[runtime.activeFrameIds.at(-1)!].locals).map((slot) => <button className="debug-value" key={slot.id} onClick={() => onInspect({ kind: 'slot', id: slot.id })}><span>{slot.name}<small>{slot.javaType}</small></span><code className={slot.value.kind === 'null' ? 'is-null' : ''}>{slot.value.kind === 'uninitialized' ? 'unavailable' : formatValue(slot.value, runtime.objects)}</code></button>)}<p className="debug-limit">Unsupported values are unavailable. See Timeline → Visualization support for capture limits.</p></div>
    <div><h3>Breakpoints</h3>{breakpoints.map((point) => <button key={`${point.fileId}:${point.line}`} className="debug-breakpoint-row" title={point.reason ?? 'Remove breakpoint'} onClick={() => onRemove(point)}><span className={point.status === 'verified' ? 'is-verified' : ''}>●</span> {point.fileId}:{point.line}<small>{point.status.replace('_', ' ')} · remove ×</small></button>)}</div>
  </section>
}
