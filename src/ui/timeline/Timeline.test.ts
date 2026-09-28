import { describe, expect, it } from 'vitest'
import type { TraceEvent } from '../../contracts/runtime'
import { markerIndices } from './Timeline'

const events = (count: number): TraceEvent[] => Array.from({ length: count }, (_, seq) => ({
  type: 'PROGRAM_START', eventId: `event:${seq}`, seq, source: null, label: `Event ${seq}`,
  importance: seq % 13 === 0 ? 'major' : 'quiet',
}))

describe('large real trace timeline', () => {
  it('keeps exact markers for short traces and samples a bounded ordered set for 20k probes', () => {
    expect(markerIndices(events(24))).toEqual(Array.from({ length: 24 }, (_, index) => index))
    const selected = markerIndices(events(20_000))
    expect(selected.length).toBeLessThanOrEqual(240)
    expect(selected[0]).toBe(0)
    expect(selected.at(-1)).toBe(19_999)
    expect(new Set(selected).size).toBe(selected.length)
    expect(selected).toEqual([...selected].sort((a, b) => a - b))
  })
})
