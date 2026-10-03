import { describe, expect, it } from 'vitest'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import { applyEvent, createInitialState, getReferences, seek, validateTrace } from './index'
import { loadPersonTrace } from '../examples/traces'

const personId = 'object:person:17'
const mainId = 'frame:main:1'
const ctorId = 'frame:person-constructor:1'
const setAgeId = 'frame:person-setAge:1'

function after(trace: TraceDocument, type: TraceEvent['type'], occurrence = 0) {
  const event = trace.events.filter((candidate) => candidate.type === type)[occurrence]
  if (!event) throw new Error(`Missing ${type} event`)
  return seek(trace, event.seq + 1)
}

describe('Person trace', () => {
  it('has contiguous events, a synchronized Java source, and the required execution story', () => {
    const trace = loadPersonTrace()
    expect(trace.events.map((event) => event.seq)).toEqual(trace.events.map((_, index) => index))
    expect(trace.sourceFiles[0].content).toContain('Person p = new Person("Ethan");')
    expect(trace.events[0].type).toBe('PROGRAM_START')
    expect(trace.events.at(-1)?.type).toBe('PROGRAM_END')

    const allocated = after(trace, 'ALLOCATE_OBJECT')
    expect(allocated.objects[personId]).toMatchObject({ id: personId, displayId: 17, className: 'Person' })
    expect(allocated.objects[personId].fields[`slot:${personId}:age`].value).toEqual({ kind: 'primitive', javaType: 'int', value: 0 })
    expect(allocated.frames[mainId].locals[`slot:${mainId}:x`].value).toMatchObject({ value: 5 })
    expect(allocated.frames[mainId].locals[`slot:${mainId}:y`].value).toMatchObject({ value: 10 })
    expect(allocated.frames[mainId].locals[`slot:${mainId}:p`].value).toEqual({ kind: 'uninitialized' })

    const inConstructor = after(trace, 'ENTER_METHOD', 1)
    expect(inConstructor.activeFrameIds).toEqual([mainId, ctorId])
    expect(getReferences(inConstructor)).toEqual([{
      id: `ref:slot:${ctorId}:this`,
      source: { kind: 'frame', frameId: ctorId, slotId: `slot:${ctorId}:this` },
      targetObjectId: personId,
    }])

    const named = after(trace, 'SET_FIELD')
    expect(named.objects[personId].fields[`slot:${personId}:name`].value).toEqual({ kind: 'stringSummary', javaType: 'String', value: 'Ethan' })
    const mainReference = after(trace, 'CREATE_REFERENCE')
    expect(mainReference.frames[ctorId].status).toBe('returned')
    expect(getReferences(mainReference).map((edge) => edge.source.slotId)).toEqual([`slot:${mainId}:p`])

    const inSetAge = after(trace, 'ENTER_METHOD', 2)
    expect(inSetAge.activeFrameIds).toEqual([mainId, setAgeId])
    expect(getReferences(inSetAge).map((edge) => edge.source.slotId)).toEqual([
      `slot:${mainId}:p`, `slot:${setAgeId}:this`,
    ])
    const aged = after(trace, 'SET_FIELD', 1)
    expect(aged.objects[personId].fields[`slot:${personId}:age`].value).toEqual({ kind: 'primitive', javaType: 'int', value: 18 })
    expect(aged.currentSource).toEqual({ fileId: 'Main.java', line: 10 })
    expect(after(trace, 'EXIT_METHOD', 1).frames[setAgeId].status).toBe('returned')
    expect(seek(trace, trace.events.length)).toMatchObject({ status: 'ended', activeFrameIds: [] })
  })

  it('reconstructs every cursor identically in forward and reverse order', () => {
    const trace = loadPersonTrace()
    const sequential = [createInitialState()]
    for (const event of trace.events) sequential.push(applyEvent(sequential.at(-1)!, event))

    for (let cursor = trace.events.length; cursor >= 0; cursor -= 1) {
      const state = seek(trace, cursor)
      expect(state).toEqual(sequential[cursor])
      expect(state.lastEventId).toBe(cursor === 0 ? null : trace.events[cursor - 1].eventId)
      expect(state.currentSource).toEqual(cursor === 0 ? null : trace.events[cursor - 1].source)
    }
    expect(seek(trace, 0).objects).toEqual({})
    expect(seek(trace, trace.events.length).objects[personId].id).toBe(personId)

    const mutableCopy = seek(trace, 16)
    expect(() => { mutableCopy.objects[personId].fields[`slot:${personId}:age`].value = { kind: 'null' } }).toThrow(TypeError)
    expect(seek(trace, 16).objects[personId].fields[`slot:${personId}:age`].value).toEqual({
      kind: 'primitive', javaType: 'int', value: 0,
    })
  })

  it('keeps reducer inputs unchanged and derives edges from live slots', () => {
    const trace = loadPersonTrace()
    const before = after(trace, 'CREATE_REFERENCE')
    const original = snapshotCopy(before)
    const clear: TraceEvent = {
      type: 'CLEAR_REFERENCE', eventId: 'test:clear', seq: before.cursor,
      source: { fileId: 'Main.java', line: 18 }, label: 'Clear p', importance: 'normal',
      sourceSlot: { kind: 'frame', frameId: mainId, slotId: `slot:${mainId}:p` },
    }
    const cleared = applyEvent(before, clear)
    expect(before).toEqual(original)
    expect(getReferences(before)).toHaveLength(1)
    expect(getReferences(cleared)).toEqual([])
    expect(cleared.frames[mainId].locals[`slot:${mainId}:p`].value).toEqual({ kind: 'null' })
  })

  it('rejects malformed and semantically invalid traces', () => {
    const trace = loadPersonTrace()
    const badSequence = structuredClone(trace)
    badSequence.events[3].seq = 99
    expect(() => validateTrace(badSequence)).toThrow('Non-contiguous event seq')

    const badSource = structuredClone(trace)
    badSource.events[3].source = { fileId: 'Main.java', line: 900 }
    expect(() => validateTrace(badSource)).toThrow('Invalid source location')

    const badTarget = structuredClone(trace)
    const reference = badTarget.events.find((event) => event.type === 'CREATE_REFERENCE')!
    if (reference.type !== 'CREATE_REFERENCE') throw new Error('Missing reference')
    reference.targetObjectId = 'missing'
    expect(() => validateTrace(badTarget)).toThrow('Unknown reference target')

    const badType = structuredClone(trace)
    const fieldWrite = badType.events.find((event) => event.type === 'SET_FIELD' && event.label.includes('age:'))!
    if (fieldWrite.type !== 'SET_FIELD') throw new Error('Missing age write')
    fieldWrite.value = { kind: 'stringSummary', javaType: 'String', value: 'wrong type' }
    expect(() => validateTrace(badType)).toThrow('Value type mismatch')

    expect(() => seek(trace, -1)).toThrow(RangeError)
    expect(() => seek(trace, 1.5)).toThrow(RangeError)
    expect(() => seek(trace, trace.events.length + 1)).toThrow(RangeError)
  })
})

// Persistent seek snapshots cross the wire through JSON; clone only deliberate forged test states.
function snapshotCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
