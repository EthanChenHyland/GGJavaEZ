import type { TraceEvent } from '../contracts/runtime'
import type { RecordingStatus } from '../instrumentation/contracts'
export interface Milestone { id: string; seq: number; cursor: number; label: string; importance: TraceEvent['importance']; kind: 'entry' | 'return' | 'allocation' | 'exception' | 'input' | 'output' }
export interface MilestoneIndex {
  readonly count: number
  extend(events: readonly TraceEvent[], from: number, to?: number): void
  labelled(cursor: number, trackWidthPx: number, maxLabels: 12 | 6): readonly Milestone[]
  current(cursor: number): Milestone | null
  density(trackWidthPx: number): Uint16Array
  recordingStop(): RecordingStatus | null
}
function lowerBound(values: readonly Milestone[], prefix: number): number {
  let low = 0, high = values.length
  while (low < high) { const middle = (low + high) >>> 1; if (values[middle].cursor < prefix) low = middle + 1; else high = middle }
  return low
}
function kindOf(event: TraceEvent): Milestone['kind'] | null {
  switch (event.type) {
    case 'ENTER_METHOD': return 'entry'
    case 'RETURN_VALUE': case 'EXIT_METHOD': return 'return'
    case 'ALLOCATE_OBJECT': case 'ALLOCATE_ARRAY': return 'allocation'
    case 'THROW_EXCEPTION': case 'UNWIND_EXCEPTION': case 'CATCH_EXCEPTION': return 'exception'
    case 'INPUT_READ': case 'CONSOLE_INPUT': return 'input'
    case 'OUTPUT_WRITE': case 'CONSOLE_WRITE': return 'output'
    case 'EXECUTION_FACT':
      switch (event.fact.kind) {
        case 'enter': return 'entry'
        case 'return': case 'exit': return 'return'
        case 'object': return 'allocation'
        case 'throw': case 'unwind': case 'catch': return 'exception'
        case 'io': return event.fact.channel === 'stdin' ? 'input' : 'output'
        default: return null
      }
    default: return null
  }
}
const importance = { quiet: 0, normal: 1, major: 2 } as const
export function labelBinCount(width: number, maximum: 12 | 6): number {
  return Number.isFinite(width) ? Math.min(maximum, Math.max(0, Math.floor(width / 110))) : 0
}

/** Append-only indexes make labelling O(k log M), independent of the total trace length. */
export function createMilestoneIndex(): MilestoneIndex {
  const milestones: Milestone[] = [], ranks: Milestone[][] = [[], [], []]
  let count = 0, stop: RecordingStatus | null = null
  return {
    get count() { return count },
    extend(events, from, to = events.length) {
      const end = Math.min(events.length, Math.max(0, Math.trunc(to)))
      if (!Number.isInteger(from) || from < 0 || from > count || end < count) throw new Error('Milestone index requires an accepted append-only prefix')
      for (let index = count; index < end; index++) {
        const event = events[index]
        if (event.seq !== index) throw new Error('Milestone index requires zero-based normalized Event seq')
        const kind = kindOf(event)
        if (kind) {
          const item: Milestone = { id: event.eventId, seq: event.seq, cursor: index + 1, label: event.label, importance: event.importance, kind }
          milestones.push(item); ranks[importance[event.importance]].push(item)
        }
        if (event.type === 'CAPTURE_STOP') stop = event.recording
      }
      count = end
    },
    current(cursor) {
      const at = lowerBound(milestones, Math.min(count, Math.max(0, Math.floor(cursor))) + 1) - 1
      return at >= 0 ? milestones[at] : null
    },
    labelled(cursor, width, maximum) {
      const bins = labelBinCount(width, maximum)
      if (!bins || !count) return []
      const chosen: Array<Milestone | null> = Array.from({ length: bins }, () => null)
      for (let bin = 0; bin < bins; bin++) {
        const first = Math.max(1, Math.ceil(bin * count / bins))
        const last = bin === bins - 1 ? count : Math.ceil((bin + 1) * count / bins) - 1
        for (let rank = 2; rank >= 0; rank--) {
          const item = ranks[rank][lowerBound(ranks[rank], first)]
          if (item && item.cursor <= last) { chosen[bin] = item; break }
        }
      }
      const current = this.current(cursor)
      if (current) chosen[Math.min(bins - 1, Math.floor(current.cursor / count * bins))] = current
      return chosen.filter((item): item is Milestone => item !== null)
    },
    density(width) {
      const pixels = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0
      const ticks = new Uint16Array(pixels)
      if (!count) return ticks
      for (let column = 0; column < pixels; column++) {
        const first = Math.max(1, Math.ceil(column * count / pixels))
        const last = column === pixels - 1 ? count : Math.ceil((column + 1) * count / pixels) - 1
        ticks[column] = Math.min(65535, Math.max(0, last - first + 1))
      }
      return ticks
    },
    recordingStop: () => stop,
  }
}
