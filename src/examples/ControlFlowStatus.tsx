import type { RuntimeState, TraceEvent } from '../contracts/runtime'
import { formatValue } from '../debugger/formatValue'

/** Explanatory chrome consumes recorded facts; it never evaluates source code. */
export function ControlFlowStatus({ runtime, event, guided }: { runtime: RuntimeState; event: TraceEvent | null; guided: boolean }) {
  const frameId = runtime.activeFrameIds.at(-1)
  const condition = frameId ? runtime.conditions[frameId] : undefined
  const loop = Object.values(runtime.loops).at(-1)
  const scopes = Object.values(runtime.scopes).filter((scope) => scope.frameId === frameId && scope.status === 'active').sort((a, b) => a.depth - b.depth)
  return <section className={`control-status ${guided ? 'is-guided' : ''}`} aria-label="Control flow state">
    <div className="control-status-heading">
      <span className="eyebrow">{runtime.status === 'ended' ? 'COMPLETE' : 'CONTROL FLOW'}</span>
      {loop && <span className="loop-context" data-loop-iteration={loop.iteration}>{loop.status === 'ended' ? `Loop ended · ${loop.iteration} iterations` : `Iteration ${loop.iteration}`}</span>}
    </div>
    {condition && runtime.status !== 'ended' && <div className="condition-fact" data-condition-id={condition.conditionId}>
      <code>{condition.expression}</code><strong className={condition.result ? 'condition-true' : 'condition-false'}>{formatValue(condition.operands[0].value)} {condition.operator} {formatValue(condition.operands[1].value)} → {String(condition.result)}</strong>
      <span className="branch-path">{condition.takenLabel}<span className="branch-skipped"> · skipped: {condition.skippedLabel}</span></span>
    </div>}
    {scopes.length > 0 && <div className="scope-context">Scope · {scopes.map((scope) => scope.label).join(' › ')}</div>}
    {guided && event && <span className="control-event">{event.label}</span>}
    {runtime.status === 'ended' && <span className="scope-context">All local scopes closed · console history retained</span>}
  </section>
}
