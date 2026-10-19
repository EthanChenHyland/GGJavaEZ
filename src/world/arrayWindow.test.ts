import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { arrayElementSlotId } from '../contracts/runtime'
import type { WorldAnchor } from '../contracts/world'
import { computeArrayWindow, resolveArrayWindowPick, type ArrayWindow, type ArrayWindowInput, type ArrayWindowPick } from './arrayWindow'

function anchor(length = 1000): WorldAnchor {
  const columns = Math.min(16, Math.max(4, length))
  const rows = length > 128 ? 8 : Math.ceil(length / columns)
  return {
    entityId: 'a', region: 'heap', position: [10, -5, 3],
    size: [columns * 1.63 - 0.08, 0.9 + rows * 1.63 - (rows ? 0.08 : 0), 1.67], ports: {}, bodyPort: [10, -5, 3.835],
  }
}
function input(overrides: Partial<ArrayWindowInput> = {}): ArrayWindowInput {
  return { recordingId: 'run-1', arrayId: 'a', recordedLength: 1000, anchor: anchor(), nominalCellBudget: 8, ...overrides }
}
function pick(window: ArrayWindow, index = window.visible[0]): ArrayWindowPick {
  const slotId = arrayElementSlotId(window.arrayId, index)
  return {
    recordingId: window.recordingId, arrayId: window.arrayId, windowRevision: window.windowRevision,
    index, slotId, presentedSlot: window.mapping.get(slotId)!.presentedSlot,
  }
}
function accounting(window: ArrayWindow): void {
  expect(window.visible.length + window.hiddenCount).toBe(window.recordedLength)
  expect(window.ellipses.reduce((sum, item) => sum + item.hidden, 0)).toBe(window.hiddenCount)
  expect(window.visible).toEqual([...new Set(window.visible)].sort((a, b) => a - b))
  expect(window.mapping.size).toBe(window.visible.length)
  expect(window.visible.length + window.presentedEllipses.length)
    .toBeLessThanOrEqual(Math.max(window.budgetOverflow.nominal, window.budgetOverflow.mandatoryCount))
  let next = 0
  const gaps = new Map(window.ellipses.map(item => [item.afterIndex, item.hidden]))
  next += gaps.get(-1) ?? 0
  for (const index of window.visible) {
    expect(index).toBe(next)
    next = index + 1 + (gaps.get(index) ?? 0)
  }
  expect(next).toBe(window.recordedLength)
}

describe('array index windows', () => {
  it('uses index 0 without activity and reserves a budgeted hidden summary', () => {
    const window = computeArrayWindow(input())
    expect(window.visible).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(window.ellipses).toEqual([{ afterIndex: 6, hidden: 993 }])
    expect(window.presentedEllipses).toEqual(window.ellipses)
    accounting(window)
    expect(computeArrayWindow(input({ nominalCellBudget: 1 })).visible).toEqual([0])
  })
  it('shows empty arrays without cells and fitting arrays without ellipses', () => {
    const empty = computeArrayWindow(input({ recordedLength: 0, anchor: anchor(0) }))
    expect(empty.visible).toEqual([])
    expect(empty.mapping.size).toBe(0)
    expect(empty.ellipses).toEqual([])
    expect(empty.reservedRows).toBe(0)
    const full = computeArrayWindow(input({ recordedLength: 8, anchor: anchor(8) }))
    expect(full.visible).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(full.hiddenCount).toBe(0)
    expect(full.ellipses).toEqual([])
    accounting(empty); accounting(full)
  })
  it('deduplicates all mandatory roles and retains reason evidence', () => {
    const window = computeArrayWindow(input({ nominalCellBudget: 2,
      requestedIndices: [400, 400], selectedIndices: [400, 1], focusedIndices: [900], currentIndices: [998],
    }))
    expect(window.visible).toEqual([1, 400, 900, 998])
    expect(window.presentedEllipses).toEqual([])
    expect(window.budgetOverflow).toMatchObject({ nominal: 2, actual: 4, mandatoryCount: 4, overflow: 2, optionalCapacity: 0 })
    expect(window.budgetOverflow.reasons.get(arrayElementSlotId('a', 400))).toEqual(['requested', 'selected'])
    accounting(window)
  })
  it('never substitutes an invalid index or an ellipsis for a real cell', () => {
    const window = computeArrayWindow(input({ selectedIndices: [-1, 1000, 1.5, NaN, Infinity], nominalCellBudget: 0 }))
    expect(window.visible).toEqual([])
    expect(window.ellipses).toEqual([{ afterIndex: -1, hidden: 1000 }])
    expect(window.presentedEllipses).toEqual([])
    expect(window.mapping.size).toBe(0)
    expect(resolveArrayWindowPick(window, {
      recordingId: 'run-1', arrayId: 'a', index: 4, slotId: arrayElementSlotId('a', 4), presentedSlot: 0, windowRevision: 1,
    })).toBeNull()
    accounting(window)
  })
  it('centers bounded deterministic ascending windows around real targets', () => {
    const data = input({ selectedIndices: [500], nominalCellBudget: 8 })
    const first = computeArrayWindow(data)
    expect(first.visible).toEqual([497, 498, 499, 500, 501, 502])
    expect(first.ellipses).toEqual([{ afterIndex: -1, hidden: 497 }, { afterIndex: 502, hidden: 497 }])
    expect(computeArrayWindow(data)).toEqual(first)
    expect(computeArrayWindow(input({ selectedIndices: [999] })).visible).toEqual([993, 994, 995, 996, 997, 998, 999])
    accounting(first)
  })
  it('small-array coordinates depend on semantic index, never window ordering', () => {
    const data = input({ recordedLength: 128, anchor: anchor(128), nominalCellBudget: 2, selectedIndices: [100] })
    const first = computeArrayWindow(data)
    const second = computeArrayWindow({ ...data, selectedIndices: [2, 100], previous: first })
    const id = arrayElementSlotId('a', 100)
    expect(first.mapping.get(id)!.presentedSlot).toBe(100)
    expect(second.mapping.get(id)).toEqual(first.mapping.get(id))
    expect(second.reservedRows).toBe(8)
    expect(first.virtualized).toBe(false)
    expect(second.windowRevision).toBe(first.windowRevision + 1)
  })
  it('large arrays reuse slots and reject stale picks after mapping changes', () => {
    const first = computeArrayWindow(input({ selectedIndices: [100], nominalCellBudget: 1 }))
    const second = computeArrayWindow(input({ selectedIndices: [900], nominalCellBudget: 1, previous: first }))
    expect(first.mapping.get(arrayElementSlotId('a', 100))!.presentedSlot).toBe(0)
    expect(second.mapping.get(arrayElementSlotId('a', 900))!.presentedSlot).toBe(0)
    expect(second.mapping.get(arrayElementSlotId('a', 900))!.anchor.position)
      .toEqual(first.mapping.get(arrayElementSlotId('a', 100))!.anchor.position)
    expect(second.windowRevision).toBe(2)
    expect(resolveArrayWindowPick(second, pick(first))).toBeNull()
    expect(resolveArrayWindowPick(second, pick(second))).toBe(second.mapping.get(arrayElementSlotId('a', 900)))
    expect(second.virtualized).toBe(true)
    expect(second.reservedRows).toBe(8)
  })
  it('checks recording, array, revision, index, canonical slot and presented slot independently', () => {
    const window = computeArrayWindow(input())
    const good = pick(window)
    const corruptions: Partial<ArrayWindowPick>[] = [
      { recordingId: 'run-2' }, { arrayId: 'b' }, { windowRevision: 0 }, { index: 1 },
      { index: -1 }, { index: 1000 }, { index: NaN }, { slotId: 'ellipsis:0' }, { presentedSlot: 9 },
    ]
    for (const corruption of corruptions) expect(resolveArrayWindowPick(window, { ...good, ...corruption })).toBeNull()
    expect(resolveArrayWindowPick(window, good)).not.toBeNull()
  })
  it('revision stays unchanged when only mandatory reasons/budgets change without mapping changes', () => {
    const first = computeArrayWindow(input({ recordedLength: 3, anchor: anchor(3), nominalCellBudget: 8 }))
    const second = computeArrayWindow(input({ recordedLength: 3, anchor: anchor(3), nominalCellBudget: 48,
      selectedIndices: [2], previous: first,
    }))
    expect(second.windowRevision).toBe(first.windowRevision)
    expect(second.mapping).toEqual(first.mapping)
    expect(resolveArrayWindowPick(second, pick(first, 2))).not.toBeNull()
    expect('value' in second.mapping.get(arrayElementSlotId('a', 2))!).toBe(false)
  })
  it('uses 1.55 cells and .08 gaps in 4–16 columns with front-face ports', () => {
    const window = computeArrayWindow(input({ nominalCellBudget: 48 }))
    const cell0 = window.mapping.get(arrayElementSlotId('a', 0))!
    const cell1 = window.mapping.get(arrayElementSlotId('a', 1))!
    const cell16 = window.mapping.get(arrayElementSlotId('a', 16))!
    expect(cell0.anchor.size).toEqual([1.55, 1.55, 1.55])
    expect(cell1.anchor.position[0] - cell0.anchor.position[0]).toBeCloseTo(1.63)
    expect(cell0.anchor.position[1] - cell16.anchor.position[1]).toBeCloseTo(1.63)
    expect(cell0.port[2] - cell0.anchor.position[2]).toBeCloseTo(0.775)
    expect(cell0.anchor.ports).toEqual({ [arrayElementSlotId('a', 0)]: cell0.port })
    expect(computeArrayWindow(input({ recordedLength: 1, anchor: anchor(1) })).columns).toBe(4)
    expect(window.columns).toBe(16)
  })
  it('reports temporary row overflow without dropping mandatory endpoints or moving the parent', () => {
    const data = input({ currentIndices: Array.from({ length: 145 }, (_, i) => 2 * i), nominalCellBudget: 128 })
    const before = structuredClone(data.anchor)
    const window = computeArrayWindow(data)
    expect(window.mapping.size).toBe(145)
    expect(window.budgetOverflow.overflow).toBe(17)
    expect(window.reservedRows).toBe(8)
    expect(window.presentedRows).toBe(10)
    expect(window.rowOverflow).toBe(2)
    expect(data.anchor).toEqual(before)
    accounting(window)
  })
  it('handles huge sparse lengths with only budget-sized allocations', () => {
    const window = computeArrayWindow(input({ recordedLength: 2_147_483_647, selectedIndices: [2_147_483_646] }))
    expect(window.mapping.size).toBeLessThanOrEqual(8)
    expect(window.visible).toContain(2_147_483_646)
    accounting(window)
  })
  it.each([-1, 1.5, Infinity, NaN])('rejects invalid length/budget %s', value => {
    expect(() => computeArrayWindow(input({ recordedLength: value }))).toThrow(RangeError)
    expect(() => computeArrayWindow(input({ nominalCellBudget: value }))).toThrow(RangeError)
  })
})

describe('Array structure and windows — Property 39 (100 runs each)', () => {
  const generated = fc.record({
    length: fc.integer({ min: 0, max: 1_000_000 }), budget: fc.integer({ min: 0, max: 160 }),
    indices: fc.array(fc.integer({ min: -2, max: 1_000_002 }), { maxLength: 180 }),
  })
  it('preserves mandatory indices, exact accounting and nominal/overflow capacity', () => {
    fc.assert(fc.property(generated, ({ length, budget, indices }) => {
      const data = input({ recordedLength: length, nominalCellBudget: budget, anchor: anchor(length),
        requestedIndices: indices, selectedIndices: indices.slice(0, 3), focusedIndices: indices.slice(3, 6), currentIndices: indices.slice(6),
      })
      const window = computeArrayWindow(data)
      const mandatory = [...new Set(indices.filter(index => index >= 0 && index < length))].sort((a, b) => a - b)
      for (const index of mandatory) expect(window.mapping.has(arrayElementSlotId('a', index))).toBe(true)
      expect(window.budgetOverflow.mandatoryCount).toBe(mandatory.length)
      expect(window.budgetOverflow.overflow).toBe(Math.max(0, mandatory.length - budget))
      if (mandatory.length > budget) expect(window.visible).toEqual(mandatory)
      expect(computeArrayWindow(data)).toEqual(window)
      accounting(window)
    }), { numRuns: 100 })
  })
  it('revisions describe topology and every accepted pick resolves canonical identity', () => {
    fc.assert(fc.property(generated, ({ length, budget, indices }) => {
      const data = input({ recordedLength: length, nominalCellBudget: budget, anchor: anchor(length), selectedIndices: indices })
      const first = computeArrayWindow(data)
      const repeat = computeArrayWindow({ ...data, selectedIndices: [...indices].reverse(), previous: first })
      expect(repeat.windowRevision).toBe(first.windowRevision)
      for (const index of first.visible) {
        const valid = pick(first, index)
        const resolved = resolveArrayWindowPick(repeat, valid)!
        expect(resolved.index).toBe(index)
        expect(resolved.anchor.entityId).toBe(arrayElementSlotId('a', index))
        expect(resolveArrayWindowPick(repeat, { ...valid, windowRevision: valid.windowRevision - 1 })).toBeNull()
        expect(resolveArrayWindowPick(repeat, { ...valid, slotId: arrayElementSlotId('b', index) })).toBeNull()
      }
    }), { numRuns: 100 })
  })
  it('small-array coordinates survive revealing a different semantic index', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 128 }), fc.nat(127), (length, value) => {
      const index = value % length
      const data = input({ recordedLength: length, anchor: anchor(length), nominalCellBudget: 1, selectedIndices: [index] })
      const first = computeArrayWindow(data)
      const second = computeArrayWindow({ ...data, focusedIndices: [(index + 1) % length], previous: first })
      const id = arrayElementSlotId('a', index)
      expect(first.mapping.get(id)!.presentedSlot).toBe(index)
      expect(second.mapping.get(id)).toEqual(first.mapping.get(id))
      accounting(second)
    }), { numRuns: 100 })
  })
})
