import type { TraceDocument } from '../contracts/runtime'
import type { ExecutionHistory } from '../runtime/history'
import { deriveSemanticTransitions, type SemanticTransition } from './semanticTransition'
import type { Clock } from './clock'
import design from '../../docs/visual-java-spec/DESIGN_TOKENS.json'
const { motion } = design

export type CursorChangeReason = 'live' | 'step' | 'play' | 'reverse' | 'seek' | 'scrub' | 'lens' | 'replay'
export type StepKind = 'entry' | 'allocation' | 'argument' | 'receiver' | 'assignment' | 'field-write' | 'reference' | 'array-read' | 'array-write' | 'return' | 'input' | 'output' | 'exception' | 'completion'
export interface AnimationStep {
  id: string; eventId: string; seq: number; kind: StepKind; durationMs: number
  subjects: readonly string[]; transition: SemanticTransition; flowId: string | null
  direction: 'forward' | 'reverse'
}
/** static frames are persistent emphasis, never interpolated animation. */
export interface OverlayFrame { step: AnimationStep; progress: number; static: boolean }
export interface SettleFrame { cursor: number; progress: number }
export interface TransitionPlayer {
  cursorChanged(change: { from: number; to: number; reason: CursorChangeReason; speed: number; reducedMotion: boolean }): void
  scrubStarted(): void
  scrubEnded(cursor: number): void
  sample(nowMs: number, visible: (ids: readonly string[]) => boolean): { overlays: readonly OverlayFrame[]; settle: SettleFrame | null; animating: boolean }
  readonly pendingCount: number
}
const duration: Record<StepKind, number> = { entry: 450, allocation: 500, argument: 400, receiver: 350, assignment: 350, 'field-write': 400, reference: 450, 'array-read': 300, 'array-write': 400, return: 550, input: 500, output: 400, exception: 600, completion: 700 }
const kinds: Partial<Record<SemanticTransition['kind'], StepKind>> = { 'frame-enter': 'entry', allocation: 'allocation', parameter: 'argument', assignment: 'assignment', 'field-write': 'field-write', reference: 'reference', null: 'reference', 'array-read': 'array-read', 'array-write': 'array-write', return: 'return', input: 'input', output: 'output', exception: 'exception', 'frame-exit': 'completion', 'field-read': 'assignment' }
type Pending = { step: AnimationStep; queuedAt: number }

/** Reads accepted adjacent snapshots only. It never applies or delays a runtime Event. */
export function createTransitionPlayer(source: { trace: TraceDocument; history: ExecutionHistory }, clock: Clock): TransitionPlayer {
  let queue: Pending[] = [], active: (Pending & { started: number }) | null = null
  let settling: { cursor: number; started: number } | null = null
  let scrubbing = false, staticSteps: AnimationStep[] = [], reduced = false, live = false, latestCursor = 0
  let lastRange: { from: number; to: number; speed: number } | null = null
  const clear = () => { queue = []; active = null; settling = null; staticSteps = [] }
  const settle = (cursor: number, started = clock.now()) => { clear(); settling = { cursor, started } }
  function steps(from: number, to: number, speed: number, limit = motion.maxPending + 1): AnimationStep[] {
    const result: AnimationStep[] = [], direction = to < from ? 'reverse' : 'forward'
    const start = Math.min(from, to), end = Math.max(from, to)
    const safeSpeed = Number.isFinite(speed) ? Math.max(.25, Math.min(4, speed)) : 1
    // Derive reverse playback from the same forward facts, then reverse their order.
    // Re-applying the reducer backward or inventing an inverse Event is forbidden.
    for (let index = 0; index < end - start; index++) {
      const cursor = direction === 'forward' ? start + index : end - index - 1
      const event = source.history.eventAt(cursor) ?? source.trace.events[cursor]
      if (!event) continue
      // Submitted bytes are not evidence of a consumed value, even in legacy traces.
      if (event.type === 'CONSOLE_INPUT') continue
      const before = source.history.materialize(cursor), after = source.history.materialize(cursor + 1)
      const graph = after.executionGraph
      const newEdges = graph?.edges.slice(before.executionGraph?.edges.length ?? 0) ?? []
      const transitions = deriveSemanticTransitions(before, event, after)
      if (direction === 'reverse') transitions.reverse()
      for (const transition of transitions) {
        const kind = kinds[transition.kind]
        if (!kind) continue
        const edge = newEdges.find(edge => `${event.eventId}:${edge.id}` === transition.id)
        const actualKind = edge?.kind === 'RECEIVER_BIND' ? 'receiver' : kind
        const subjects = [...new Set([transition.from?.id, transition.to?.id].filter((id): id is string => !!id))]
        if (!subjects.length) continue
        result.push({ id: transition.id, eventId: event.eventId, seq: event.seq, kind: actualKind, durationMs: duration[actualKind] / safeSpeed, subjects, transition, flowId: edge?.id ?? null, direction })
        if (result.length >= limit) return result
      }
    }
    return result
  }
  function changedSteps() {
    if (!lastRange) return []
    // Static emphasis is not an animation queue: retain every changed subject,
    // rather than dropping the ninth change because the overlay queue is bounded.
    const byBinding = new Map<string, AnimationStep>()
    for (const step of steps(lastRange.from, lastRange.to, lastRange.speed, Infinity)) {
      byBinding.set(JSON.stringify([step.kind, step.subjects, step.flowId]), step)
    }
    return [...byBinding.values()]
  }
  return {
    get pendingCount() { return queue.length + Number(!!active) },
    cursorChanged(change) {
      const wasReduced = reduced
      reduced = change.reducedMotion
      live = change.reason === 'live'
      latestCursor = change.to
      if (change.from !== change.to) lastRange = { from: change.from, to: change.to, speed: change.speed }
      if (reduced && wasReduced && change.from === change.to && !scrubbing && change.reason !== 'scrub') return
      if (change.reason !== 'live' || reduced) clear()
      if (scrubbing || change.reason === 'scrub') { clear(); return }
      if (reduced) {
        if (change.from !== change.to || !wasReduced) staticSteps = changedSteps()
        return
      }
      if (change.to === change.from) return
      if (['seek', 'lens', 'replay'].includes(change.reason)) { settle(change.to); return }
      const pending = queue.length + Number(!!active), oldest = active?.queuedAt ?? queue[0]?.queuedAt
      // Large jumps snap instead of reconstructing thousands of unseen overlays.
      if (Math.abs(change.to - change.from) > 128 || live && oldest !== undefined && clock.now() - oldest > motion.liveLagMs) { settle(change.to); return }
      const next = steps(change.from, change.to, change.speed)
      if (next.length + pending > motion.maxPending) { settle(change.to); return }
      settling = null
      for (const step of next) queue.push({ step, queuedAt: clock.now() })
    },
    scrubStarted() { scrubbing = true; clear() },
    scrubEnded(cursor) { scrubbing = false; latestCursor = cursor; if (!reduced) settle(cursor) },
    sample(now, visible) {
      if (scrubbing) return { overlays: [], settle: null, animating: false }
      if (reduced) return { overlays: staticSteps.filter(step => visible(step.subjects)).map(step => ({ step, progress: 1, static: true })), settle: null, animating: false }
      if (active && !visible(active.step.subjects)) active = null
      queue = queue.filter(item => visible(item.step.subjects))
      const oldest = active?.queuedAt ?? queue[0]?.queuedAt
      // Expire LIVE work on the rendered frame even if no further batch arrives.
      // Historical slow playback intentionally has no LIVE expiry deadline.
      if (live && oldest !== undefined && now - oldest > motion.liveLagMs) settle(latestCursor, now)
      if (settling) {
        const progress = Math.min(1, Math.max(0, (now - settling.started) / motion.settleMs))
        const frame = { cursor: settling.cursor, progress }
        if (progress === 1) settling = null
        return { overlays: [], settle: frame, animating: progress < 1 }
      }
      while (true) {
        if (!active) {
          const next = queue.shift()
          if (!next) return { overlays: [], settle: null, animating: false }
          active = { ...next, started: now }
        }
        if (!visible(active.step.subjects)) { active = null; continue }
        const progress = Math.min(1, Math.max(0, (now - active.started) / active.step.durationMs))
        if (progress === 1) { active = null; continue }
        return { overlays: [{ step: active.step, progress, static: false }], settle: null, animating: true }
      }
    },
  }
}
