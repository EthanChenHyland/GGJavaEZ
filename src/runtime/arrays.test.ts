import { describe, expect, it } from 'vitest'
import type { RuntimeState, TraceDocument, TraceEvent } from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import arraySource from '../demos/arrays/Main.java?raw'
import { applyEvent, createInitialState, getReferences, loadArrayTrace, seek, validateTrace } from './index'

const mainId = 'frame:arrays-main:1'
const objectId = 'object:array:23'
const slotId = (name: string) => `slot:arrays-main:1:${name}`
const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
const cells = (state: RuntimeState) => state.objects[objectId].array!.elements.map((slot) => slot.value)

function eventsOf<T extends TraceEvent['type']>(trace: TraceDocument, type: T) {
  return trace.events.filter((event): event is Extract<TraceEvent, { type: T }> => event.type === type)
}

function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
}

function atCursor<T extends TraceEvent>(event: T, cursor: number): T {
  return { ...event, seq: cursor, eventId: `test:${cursor}:${event.type}` }
}

describe('five-value bubble sort trace', () => {
  it('loads one finite, synchronized fixture with the requested source operations', () => {
    const trace = loadArrayTrace()
    expect(trace.demoId).toBe('arrays')
    expect(trace.sourceFiles).toEqual([{ fileId: 'Main.java', name: 'Main.java', content: arraySource }])
    expect(arraySource).toBe([
      'public class Main {',
      '    public static void main(String[] args) {',
      '        int[] nums = {8, 3, 6, 1, 5};',
      '',
      '        for (int i = 0; i < nums.length - 1; i++) {',
      '            for (int j = 0; j < nums.length - i - 1; j++) {',
      '                if (nums[j] > nums[j + 1]) {',
      '                    int temp = nums[j];',
      '                    nums[j] = nums[j + 1];',
      '                    nums[j + 1] = temp;',
      '                }',
      '            }',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n'))
    expect(trace.events).toHaveLength(122)
    expect(new Set(trace.events.map((event) => event.eventId)).size).toBe(trace.events.length)
    expect(trace.events.map((event) => event.seq)).toEqual(trace.events.map((_, index) => index))
    expect(trace.events[0].type).toBe('PROGRAM_START')
    expect(trace.events.at(-1)?.type).toBe('PROGRAM_END')
    expect(eventsOf(trace, 'ENTER_METHOD')).toHaveLength(1)
    expect(eventsOf(trace, 'ARRAY_COMPARE')).toHaveLength(10)
    expect(eventsOf(trace, 'ARRAY_READ')).toHaveLength(34)
    expect(eventsOf(trace, 'ARRAY_WRITE')).toHaveLength(14)
    expect(trace.events.some((event) => String(event.type).includes('SWAP'))).toBe(false)
  })

  it('allocates the full literal and creates nums as a separate reference', () => {
    const trace = loadArrayTrace()
    const before = seek(trace, 3)
    expect(before.objects).toEqual({})
    expect(before.frames[mainId].locals[slotId('nums')].value).toEqual({ kind: 'uninitialized' })
    const allocated = seek(trace, 4)
    expect(allocated.objects[objectId]).toMatchObject({
      id: objectId, className: 'int[]', displayId: 23, fields: {},
      array: { elementType: 'int', length: 5 }, allocatedAt: trace.events[3].eventId,
    })
    expect(cells(allocated)).toEqual([8, 3, 6, 1, 5].map(int))
    expect(allocated.objects[objectId].array!.elements.map((slot) => slot.id)).toEqual(
      [0, 1, 2, 3, 4].map((index) => arrayElementSlotId(objectId, index)),
    )
    expect(getReferences(allocated)).toEqual([])
    expect(getReferences(seek(trace, 5))).toEqual([{
      id: `ref:${slotId('nums')}`,
      source: { kind: 'frame', frameId: mainId, slotId: slotId('nums') },
      targetObjectId: objectId,
    }])
  })

  it('reconstructs every cursor forward, backward, and in deterministic random order', () => {
    const trace = loadArrayTrace()
    const sequential = [createInitialState()]
    for (const event of trace.events) {
      const previous = sequential.at(-1)!
      const original = structuredClone(previous)
      freezeDeep(previous)
      freezeDeep(event)
      sequential.push(applyEvent(previous, event))
      expect(previous).toEqual(original)
    }
    const cursors = Array.from({ length: trace.events.length + 1 }, (_, index) => index)
    const random = [...cursors]
    let seed = 617
    for (let index = random.length - 1; index > 0; index -= 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const other = seed % (index + 1)
      ;[random[index], random[other]] = [random[other], random[index]]
    }
    for (const cursor of [...cursors, ...[...cursors].reverse(), ...random]) {
      const state = seek(trace, cursor)
      expect(state).toEqual(sequential[cursor])
      expect(state.currentSource).toEqual(cursor ? trace.events[cursor - 1].source : null)
      expect(state.lastEventId).toBe(cursor ? trace.events[cursor - 1].eventId : null)
      if (cursor >= 4) {
        expect(state.objects[objectId].array!.elements.map((slot) => slot.id)).toEqual(
          [0, 1, 2, 3, 4].map((index) => arrayElementSlotId(objectId, index)),
        )
        expect(state.objects[objectId].array!.length).toBe(5)
      }
    }
  })

  it('verifies explicit reads and every comparison against the actual indexed values', () => {
    const trace = loadArrayTrace()
    const comparisons = eventsOf(trace, 'ARRAY_COMPARE')
    expect(comparisons.map((event) => event.result)).toEqual([true, true, true, true, false, true, true, true, false, false])
    for (const event of comparisons) {
      const before = seek(trace, event.seq)
      const values = event.indices.map((index) => before.objects[objectId].array!.elements[index].value)
      expect(event.values).toEqual(values)
      const reads = trace.events.slice(event.seq - 2, event.seq)
      expect(reads.map((read) => read.type)).toEqual(['ARRAY_READ', 'ARRAY_READ'])
      expect(reads).toMatchObject(event.indices.map((index, n) => ({ index, value: event.values[n], source: event.source })))
      expect(seek(trace, event.seq + 1).arrayActivity).toEqual({
        kind: 'compare', eventId: event.eventId, objectId, indices: event.indices,
        values: event.values, operator: '>', result: event.result,
      })
    }
    for (const event of eventsOf(trace, 'ARRAY_READ')) {
      const before = seek(trace, event.seq)
      const after = seek(trace, event.seq + 1)
      expect(cells(after)).toEqual(cells(before))
      expect(event.value).toEqual(before.objects[objectId].array!.elements[event.index].value)
      if (event.destinationSlotId) {
        expect(before.frames[mainId].locals[event.destinationSlotId].value).toEqual({ kind: 'uninitialized' })
        expect(after.frames[mainId].locals[event.destinationSlotId].value).toEqual(event.value)
      }
    }
  })

  it('preserves all fourteen individual writes and truthful duplicated intermediate values', () => {
    const trace = loadArrayTrace()
    const writes = eventsOf(trace, 'ARRAY_WRITE')
    const expected = [
      [3, 3, 6, 1, 5], [3, 8, 6, 1, 5],
      [3, 6, 6, 1, 5], [3, 6, 8, 1, 5],
      [3, 6, 1, 1, 5], [3, 6, 1, 8, 5],
      [3, 6, 1, 5, 5], [3, 6, 1, 5, 8],
      [3, 1, 1, 5, 8], [3, 1, 6, 5, 8],
      [3, 1, 5, 5, 8], [3, 1, 5, 6, 8],
      [1, 1, 5, 6, 8], [1, 3, 5, 6, 8],
    ]
    for (const [index, event] of writes.entries()) {
      const before = seek(trace, event.seq)
      const after = applyEvent(before, event)
      expect(cells(after)).toEqual(expected[index].map(int))
      expect(after.arrayMutations).toHaveLength(index + 1)
      expect(after.arrayMutations.at(-1)).toEqual({
        eventId: event.eventId, objectId, index: event.index,
        before: before.objects[objectId].array!.elements[event.index].value,
        after: event.value, from: event.from,
      })
      expect(after.arrayActivity).toEqual({ kind: 'write', ...after.arrayMutations.at(-1)! })
      for (const cellIndex of [0, 1, 2, 3, 4]) {
        const oldSlot = before.objects[objectId].array!.elements[cellIndex]
        const newSlot = after.objects[objectId].array!.elements[cellIndex]
        expect(newSlot.id).toBe(oldSlot.id)
        if (cellIndex !== event.index) expect(newSlot).toBe(oldSlot)
        else expect(newSlot).not.toBe(oldSlot)
      }
      if (index % 2 === 0) {
        expect(trace.events.slice(event.seq - 3, event.seq + 3).map((candidate) => candidate.type))
          .toEqual(['DECLARE_LOCAL', 'ARRAY_READ', 'ARRAY_READ', 'ARRAY_WRITE', 'ARRAY_WRITE', 'REMOVE_LOCAL'])
        expect(event.from).toEqual({ kind: 'element', index: event.index + 1 })
        expect(trace.events[event.seq + 1].source?.line).toBe(10)
      } else {
        expect(event.from).toEqual({ kind: 'slot', frameId: mainId, slotId: slotId('temp') })
      }
    }
  })

  it('records actual terminal loop bounds and removes locals at their lexical scope exits', () => {
    const trace = loadArrayTrace()
    const jDeclarations = eventsOf(trace, 'DECLARE_LOCAL').filter((event) => event.slot.name === 'j')
    const tempDeclarations = eventsOf(trace, 'DECLARE_LOCAL').filter((event) => event.slot.name === 'temp')
    expect(jDeclarations).toHaveLength(4)
    expect(tempDeclarations).toHaveLength(7)
    expect(new Set(jDeclarations.map((event) => event.slot.id))).toEqual(new Set([slotId('j')]))
    expect(new Set(tempDeclarations.map((event) => event.slot.id))).toEqual(new Set([slotId('temp')]))
    for (const event of [...jDeclarations, ...tempDeclarations]) {
      expect(seek(trace, event.seq).frames[mainId].locals[event.slot.id]).toBeUndefined()
    }
    const removeJ = eventsOf(trace, 'REMOVE_LOCAL').filter((event) => event.slotId === slotId('j'))
    for (const [pass, event] of removeJ.entries()) {
      const before = seek(trace, event.seq)
      expect(before.frames[mainId].locals[slotId('j')].value).toEqual(int(4 - pass))
      expect(before.frames[mainId].locals[slotId('i')].value).toEqual(int(pass))
      expect(trace.events[event.seq - 1].label).toContain('→ false')
      expect(seek(trace, event.seq + 1).frames[mainId].locals[slotId('j')]).toBeUndefined()
    }
    const removeI = eventsOf(trace, 'REMOVE_LOCAL').find((event) => event.slotId === slotId('i'))!
    expect(seek(trace, removeI.seq).frames[mainId].locals[slotId('i')].value).toEqual(int(4))
    expect(trace.events[removeI.seq - 1].label).toBe('i < nums.length - 1: 4 < 4 → false')
    const final = seek(trace, trace.events.length)
    expect(Object.keys(final.frames[mainId].locals)).toEqual([slotId('nums')])
    expect(final.status).toBe('ended')
    expect(final.activeFrameIds).toEqual([])
    expect(getReferences(final)).toEqual([])
    expect(cells(final)).toEqual([1, 3, 5, 6, 8].map(int))
    expect(final.arrayActivity).toBeNull()
    expect(final.arrayMutations).toHaveLength(14)
    expect(final.returns).toEqual([])
  })

  it('isolates snapshots, input events, slot values, and causal history', () => {
    const trace = loadArrayTrace()
    const write = structuredClone(eventsOf(trace, 'ARRAY_WRITE')[0])
    const before = seek(trace, write.seq)
    const original = structuredClone(before)
    const after = applyEvent(before, write)
    write.value = int(999)
    write.from = { kind: 'element', index: 4 }
    expect(before).toEqual(original)
    expect(after.arrayMutations[0]).toMatchObject({ after: int(3), from: { kind: 'element', index: 1 } })
    after.objects[objectId].array!.elements[0].value = int(99)
    expect(after.arrayMutations[0].after).toEqual(int(3))
    after.arrayMutations[0].before = int(99)
    expect(after.arrayActivity).toMatchObject({ before: int(8) })
    expect(before.objects[objectId].array!.elements[0].value).toEqual(int(8))
    const cached = seek(trace, 80)
    cached.objects[objectId].array!.elements[0].id = 'mutated'
    cached.arrayMutations[0].after = int(-1)
    expect(seek(trace, 80).objects[objectId].array!.elements[0].id).toBe(arrayElementSlotId(objectId, 0))
    expect(seek(trace, 80).arrayMutations[0].after).toEqual(int(3))

    const compare = structuredClone(eventsOf(trace, 'ARRAY_COMPARE')[0])
    const compared = applyEvent(seek(trace, compare.seq), compare)
    compare.indices = [3, 4]
    if (compare.values[0].kind !== 'primitive') throw new Error('Expected comparison int')
    compare.values[0].value = 99
    expect(compared.arrayActivity).toMatchObject({ indices: [0, 1], values: [int(8), int(3)] })
  })
})

describe('array lifecycle and input validation', () => {
  it.each(['ARRAY_READ', 'ARRAY_COMPARE', 'ARRAY_WRITE', 'REMOVE_LOCAL'] as const)(
    'rejects %s from a missing, non-top, or returned frame', (type) => {
      const trace = loadArrayTrace()
      const event = eventsOf(trace, type)[0]
      const before = seek(trace, event.seq)
      const badFrame = { ...event, frameId: 'missing' }
      expect(() => applyEvent(before, badFrame)).toThrow('outside active frame')
      const nested = applyEvent(before, {
        ...event, type: 'ENTER_METHOD', frameId: 'nested', callerFrameId: mainId,
        className: 'Main', methodName: 'nested', locals: [], returnType: 'int',
      })
      expect(() => applyEvent(nested, atCursor(event, nested.cursor))).toThrow('outside active frame')
      const returned = applyEvent(nested, {
        ...atCursor(event, nested.cursor), type: 'RETURN_VALUE', frameId: 'nested',
        value: int(1), destination: { frameId: mainId, slotId: slotId('i') },
      })
      expect(() => applyEvent(returned, atCursor(event, returned.cursor))).toThrow('must exit after returning a value')
      const final = seek(trace, trace.events.length)
      expect(() => applyEvent(final, atCursor(event, final.cursor))).toThrow('after PROGRAM_END')
    },
  )

  it.each([-1, 0.5, 5, Number.NaN, Number.POSITIVE_INFINITY])('rejects out-of-bounds or non-integer index %s', (index) => {
    for (const type of ['ARRAY_READ', 'ARRAY_COMPARE', 'ARRAY_WRITE'] as const) {
      const trace = loadArrayTrace()
      const event = eventsOf(trace, type)[0]
      if (event.type === 'ARRAY_COMPARE') event.indices = [index, 1]
      else event.index = index
      expect(() => applyEvent(seek(loadArrayTrace(), event.seq), event)).toThrow('outside bounds')
      expect(() => validateTrace(trace)).toThrow()
    }
  })

  it.each([
    ['ALLOCATE_ARRAY', 'elements', {}],
    ['ALLOCATE_ARRAY', 'displayId', 0],
    ['ARRAY_READ', 'destinationSlotId', ''],
    ['ARRAY_COMPARE', 'indices', [0]],
    ['ARRAY_COMPARE', 'indices', [0, 1, 2]],
    ['ARRAY_COMPARE', 'values', [int(8)]],
    ['ARRAY_COMPARE', 'operator', '<'],
    ['ARRAY_COMPARE', 'result', 'true'],
    ['ARRAY_WRITE', 'from', { kind: 'element', index: 0.5 }],
    ['ARRAY_WRITE', 'from', { kind: 'element', index: -1 }],
    ['ARRAY_WRITE', 'from', { kind: 'slot', frameId: mainId, slotId: '' }],
    ['ARRAY_WRITE', 'from', { kind: 'slot', slotId: slotId('temp') }],
    ['ARRAY_WRITE', 'from', { kind: 'literal', value: 3 }],
    ['REMOVE_LOCAL', 'slotId', ''],
  ] as const)('rejects malformed %s %s', (type, key, value) => {
    const trace = loadArrayTrace()
    const event = eventsOf(trace, type)[0] as unknown as Record<string, unknown>
    event[key] = value
    expect(() => validateTrace(trace)).toThrow('Malformed event')
  })

  it.each([
    { kind: 'uninitialized' }, { kind: 'null' },
    { kind: 'primitive', javaType: 'int', value: 1.5 },
    { kind: 'primitive', javaType: 'int', value: true },
    { kind: 'primitive', javaType: 'int', value: Number.NaN },
    { kind: 'primitive', javaType: 'int', value: Number.POSITIVE_INFINITY },
    { kind: 'primitive', javaType: 'int', value: 2147483648 },
    { kind: 'primitive', javaType: 'int', value: -2147483649 },
    { kind: 'primitive', javaType: 'double', value: 3 },
    { kind: 'primitive', javaType: 'boolean', value: false },
    { kind: 'stringSummary', javaType: 'String', value: '3' },
    { kind: 'reference', javaType: 'int[]', objectId },
  ])('rejects non-concrete or non-int array value $kind/$javaType/$value', (value) => {
    for (const type of ['ALLOCATE_ARRAY', 'ARRAY_READ', 'ARRAY_COMPARE', 'ARRAY_WRITE'] as const) {
      const trace = loadArrayTrace()
      const event = eventsOf(trace, type)[0]
      const input = event as unknown as Record<string, unknown>
      if (type === 'ALLOCATE_ARRAY') input.elements = [value]
      else if (type === 'ARRAY_COMPARE') input.values = [value, int(3)]
      else input.value = value
      expect(() => validateTrace(trace)).toThrow('Malformed event')
      expect(() => applyEvent(seek(loadArrayTrace(), event.seq), event)).toThrow('concrete Java int')
    }
  })

  it('rejects wrong observed reads, comparison values, and comparison booleans', () => {
    for (const type of ['ARRAY_READ', 'ARRAY_COMPARE'] as const) {
      const trace = loadArrayTrace()
      const event = eventsOf(trace, type)[0]
      if (event.type === 'ARRAY_READ') event.value = int(999)
      else event.values = [int(999), event.values[1]]
      expect(() => validateTrace(trace)).toThrow('Observed array value mismatch')
    }
    for (const occurrence of [0, 4]) {
      const trace = loadArrayTrace()
      const compare = eventsOf(trace, 'ARRAY_COMPARE')[occurrence]
      compare.result = !compare.result
      expect(() => validateTrace(trace)).toThrow('comparison result mismatch')
    }
  })

  it('requires read destinations to be declared, compatible locals in the active frame', () => {
    const trace = loadArrayTrace()
    const read = eventsOf(trace, 'ARRAY_READ').find((event) => event.destinationSlotId)!
    read.destinationSlotId = 'missing'
    expect(() => validateTrace(trace)).toThrow('Unknown slot')
    read.destinationSlotId = slotId('nums')
    expect(() => validateTrace(trace)).toThrow('Value type mismatch')
    read.destinationSlotId = slotId('temp')
    const declaration = eventsOf(trace, 'DECLARE_LOCAL').find((event) => event.slot.name === 'temp')!
    declaration.slot.javaType = 'boolean'
    expect(() => validateTrace(trace)).toThrow('Value type mismatch')
  })

  it('checks write origins against concrete current values and live local scope', () => {
    const trace = loadArrayTrace()
    const writes = eventsOf(trace, 'ARRAY_WRITE')
    writes[0].value = int(99)
    expect(() => validateTrace(trace)).toThrow('origin value mismatch')
    writes[0].value = int(3)
    writes[0].from = { kind: 'element', index: 5 }
    expect(() => validateTrace(trace)).toThrow('outside bounds')
    writes[0].from = { kind: 'element', index: 1 }
    writes[1].from = { kind: 'slot', frameId: 'missing', slotId: slotId('temp') }
    expect(() => validateTrace(trace)).toThrow('origin must be a local in the active frame')
    writes[1].from = { kind: 'slot', frameId: mainId, slotId: 'missing' }
    expect(() => validateTrace(trace)).toThrow('Unknown origin slot')
    writes[1].from = { kind: 'slot', frameId: mainId, slotId: slotId('nums') }
    expect(() => validateTrace(trace)).toThrow('must be int')
    writes[1].from = { kind: 'slot', frameId: mainId, slotId: slotId('temp') }
    const before = seek(trace, writes[1].seq)
    const uninitialized = structuredClone(before)
    uninitialized.frames[mainId].locals[slotId('temp')].value = { kind: 'uninitialized' }
    expect(() => applyEvent(uninitialized, writes[1])).toThrow('concrete Java int')
    const changed = structuredClone(before)
    changed.frames[mainId].locals[slotId('temp')].value = int(99)
    expect(() => applyEvent(changed, writes[1])).toThrow('origin value mismatch')
    const removed = applyEvent(before, { ...writes[1], type: 'REMOVE_LOCAL', slotId: slotId('temp') })
    expect(() => applyEvent(removed, atCursor(writes[1], removed.cursor))).toThrow('Unknown origin slot')
  })

  it('rejects unknown arrays, ordinary objects, duplicate identities, and invalid element types', () => {
    const trace = loadArrayTrace()
    const allocation = eventsOf(trace, 'ALLOCATE_ARRAY')[0]
    const allocated = seek(trace, allocation.seq + 1)
    expect(() => applyEvent(allocated, atCursor(allocation, allocated.cursor))).toThrow('Duplicate object')
    expect(() => applyEvent(allocated, { ...atCursor(allocation, allocated.cursor), objectId: 'other-array' })).toThrow('Duplicate display ID')
    const read = eventsOf(trace, 'ARRAY_READ')[0]
    read.objectId = 'missing'
    expect(() => validateTrace(trace)).toThrow('Unknown object')
    read.objectId = objectId
    const before = seek(trace, read.seq)
    const ordinary = applyEvent(before, {
      ...read, type: 'ALLOCATE_OBJECT', objectId: 'person', displayId: 17, className: 'Person', fields: [],
    })
    expect(() => applyEvent(ordinary, { ...atCursor(read, ordinary.cursor), objectId: 'person' })).toThrow('not an int array')
    ;(allocation as unknown as { elementType: string }).elementType = 'double'
    expect(() => validateTrace(trace)).toThrow('Malformed event')
    expect(() => applyEvent(seek(loadArrayTrace(), allocation.seq), allocation)).toThrow('element type must be int')
    const noFrame = applyEvent(createInitialState(), trace.events[0])
    expect(() => applyEvent(noFrame, atCursor(allocation, noFrame.cursor))).toThrow('requires an active frame')
  })

  it('rejects double local removal and use or redeclaration before the old scope exits', () => {
    const trace = loadArrayTrace()
    const removal = eventsOf(trace, 'REMOVE_LOCAL')[0]
    const removed = seek(trace, removal.seq + 1)
    expect(() => applyEvent(removed, atCursor(removal, removed.cursor))).toThrow('Unknown slot')
    const declaration = eventsOf(trace, 'DECLARE_LOCAL').find((event) => event.slot.name === 'temp')!
    const declared = seek(trace, declaration.seq + 1)
    expect(() => applyEvent(declared, atCursor(declaration, declared.cursor))).toThrow('Duplicate slot')
    expect(() => applyEvent(removed, {
      ...atCursor(removal, removed.cursor), type: 'ASSIGN_LOCAL', value: int(2),
    })).toThrow('Unknown slot')
  })

  it('accepts zero-length arrays and Java int endpoints, and rejects reads from an empty array', () => {
    const trace = loadArrayTrace()
    const allocation = eventsOf(trace, 'ALLOCATE_ARRAY')[0]
    const before = seek(trace, allocation.seq)
    const empty = applyEvent(before, { ...allocation, elements: [] })
    expect(empty.objects[objectId].array).toEqual({ elementType: 'int', length: 0, elements: [] })
    const read = eventsOf(trace, 'ARRAY_READ')[0]
    expect(() => applyEvent(empty, atCursor(read, empty.cursor))).toThrow('outside bounds')
    const endpoints = applyEvent(before, { ...allocation, elements: [-2147483648, 2147483647].map(int) })
    expect(cells(endpoints)).toEqual([-2147483648, 2147483647].map(int))
  })
})
