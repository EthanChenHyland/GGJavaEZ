import type { TraceDocument } from '../contracts/runtime'
import type { ExecutionHistory } from '../runtime/history'
import { deriveSemanticTransitions, type SemanticTransition } from './semanticTransition'
import type { Clock } from './clock'
import design from '../../docs/visual-java-spec/DESIGN_TOKENS.json'
const { motion } = design

export type CursorChangeReason = 'live' | 'step' | 'play' | 'reverse' | 'seek' | 'scrub' | 'lens' | 'replay'
export type StepKind = 'entry' | 'allocation' | 'argument' | 'receiver' | 'assignment' | 'field-write' | 'reference' | 'array-read' | 'array-write' | 'return' | 'input' | 'output' | 'throw' | 'unwind' | 'catch' | 'uncaught' | 'completion'
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
const duration: Record<StepKind, number> = { entry: 450, allocation: 500, argument: 350, receiver: 350, assignment: 350,
  'field-write': 420, reference: 420, 'array-read': 300, 'array-write': 420, return: 550, input: 420, output: 300,
  throw: 550, unwind: 420, catch: 420, uncaught: 500, completion: 350 }
const kinds: Partial<Record<SemanticTransition['kind'], StepKind>> = { 'frame-enter': 'entry', allocation: 'allocation', parameter: 'argument',
  receiver: 'receiver', assignment: 'assignment', 'field-write': 'field-write', reference: 'reference', null: 'reference',
  'array-read': 'array-read', 'array-write': 'array-write', return: 'return', input: 'input', output: 'output',
  throw: 'throw', unwind: 'unwind', catch: 'catch', uncaught: 'uncaught', 'frame-exit': 'completion', 'field-read': 'array-read' }
type Pending = { step: AnimationStep; queuedAt: number }

/** Reads accepted adjacent snapshots only. It never applies or delays a runtime Event. */
export function createTransitionPlayer(source: { trace: TraceDocument; history: ExecutionHistory }, clock: Clock): TransitionPlayer {
  let queue: Pending[] = [], active: (Pending & { started: number }) | null = null
  let settling: { cursor: number; started: number } | null = null
  let scrubbing = false, staticSteps: AnimationStep[] = [], reduced = false, live = false, latestCursor = 0
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
      const transitions = deriveSemanticTransitions(before, event, after)
      if (direction === 'reverse') transitions.reverse()
      for (const transition of transitions) {
        const kind = kinds[transition.kind]
        if (!kind) continue
        const subjects = [...new Set([transition.from?.id, transition.to?.id].filter((id): id is string => !!id))]
        if (!subjects.length) continue
        result.push({ id: transition.id, eventId: event.eventId, seq: event.seq, kind,
          durationMs: duration[kind] / safeSpeed, subjects, transition, flowId: transition.edgeId ?? null, direction })
        if (result.length >= limit) return result
      }
    }
    return result
  }
  const staticAt = (cursor: number) => cursor > 0 ? steps(cursor - 1, cursor, 1, motion.maxPending) : []
  return {
    get pendingCount() { return queue.length + Number(!!active) },
    cursorChanged(change) {
      const wasReduced = reduced
      reduced = change.reducedMotion
      live = change.reason === 'live'
      latestCursor = change.to
      if (reduced && wasReduced && change.from === change.to && !scrubbing && change.reason !== 'scrub') return
      if (change.reason !== 'live' || reduced) clear()
      if (scrubbing || change.reason === 'scrub') { clear(); return }
      if (reduced) {
        staticSteps = staticAt(change.to)
        return
      }
      if (change.to === change.from) return
      if (['seek', 'lens', 'replay'].includes(change.reason)) { settle(change.to); return }
      const fast = change.speed >= 2
      if (fast) clear()
      const pending = queue.length + Number(!!active), oldest = active?.queuedAt ?? queue[0]?.queuedAt
      // Large jumps snap instead of reconstructing thousands of unseen overlays.
      if (Math.abs(change.to - change.from) > 128 || live && oldest !== undefined && clock.now() - oldest > motion.liveLagMs) { settle(change.to); return }
      // A fast tick keeps just the applied event, and at most the first two
      // cues from it. The underlying cursor still applies every event.
      const next = fast
        ? steps(change.to > change.from ? change.to - 1 : change.to + 1, change.to, change.speed, 2)
        : steps(change.from, change.to, change.speed)
      if (next.length + pending > motion.maxPending) { settle(change.to); return }
      settling = null
      for (const step of next) queue.push({ step, queuedAt: clock.now() })
    },
    scrubStarted() { scrubbing = true; clear() },
    scrubEnded(cursor) {
      scrubbing = false
      latestCursor = cursor
      if (reduced) staticSteps = staticAt(cursor)
      else settle(cursor)
    },
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
