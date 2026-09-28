import { describe, expect, it } from 'vitest'
import { applyEvent, createInitialState } from '../runtime/state'
import { validateTrace } from '../runtime/trace'
import type { RawRuntimeEvent } from './contracts'
import { normalizeTrace, type InstrumentationSourceManifest } from './normalize'

const source = 'package demo;\nclass Main {\n static void main(String[] args) {}\n}\nclass Person { int age; }\n'
const manifest: InstrumentationSourceManifest = {
  sources: [{ fileId: 'src/demo/Main.java', name: 'Main.java', content: source, sha256: 'test-hash' }],
  classes: ['demo.Main', 'demo.Person'].map((className) => ({
    className, sourceFile: 'Main.java', fileId: 'src/demo/Main.java', sourceSha256: 'test-hash',
    status: 'resolved', candidates: ['src/demo/Main.java'],
  })),
}
const complete = { status: 'complete' as const, exitCode: 0, diagnostic: null }

function events(...items: Array<Record<string, unknown>>): RawRuntimeEvent[] {
  return items.map((item, seq) => ({
    v: 1, seq, threadId: '1', frameId: item.frameId ?? '1',
    className: 'demo.Main', methodName: 'main', descriptor: '([Ljava/lang/String;)V',
    line: 3, site: seq, ...item,
  })) as RawRuntimeEvent[]
}

function replay(trace: ReturnType<typeof normalizeTrace>['trace']) {
  return trace.events.reduce(applyEvent, createInitialState())
}

describe('normalizeTrace', () => {
  it('normalizes Person identity, constructor this, fields, and source path without invented scopes', () => {
    const raw = events(
      { type: 'enter', frameId: '1', callerFrameId: null, receiver: null, parameters: [] },
      { type: 'local', slot: 1, liveRange: 'x', name: 'x', descriptor: 'I', value: { kind: 'int', value: 5 } },
      { type: 'enter', frameId: '2', callerFrameId: '1', className: 'demo.Person', methodName: '<init>', descriptor: '()V',
        receiver: { kind: 'ref', objectId: '17', className: 'demo.Person' }, parameters: [] },
      { type: 'object', frameId: '2', className: 'demo.Person', methodName: '<init>', descriptor: '()V',
        objectId: '17', fields: [{ owner: 'demo.Person', name: 'age', descriptor: 'I', value: { kind: 'int', value: 0 } }] },
      { type: 'exit', frameId: '2', className: 'demo.Person', methodName: '<init>', descriptor: '()V' },
      { type: 'local', slot: 2, liveRange: 'p', name: 'p', descriptor: 'Ldemo/Person;',
        value: { kind: 'ref', objectId: '17', className: 'demo.Person' } },
      { type: 'enter', frameId: '3', callerFrameId: '1', className: 'demo.Person', methodName: 'setAge', descriptor: '(I)V',
        receiver: { kind: 'ref', objectId: '17', className: 'demo.Person' },
        parameters: [{ slot: 1, name: 'age', descriptor: 'I', liveRange: 'arg-age', value: { kind: 'int', value: 18 } }] },
      { type: 'field', frameId: '3', className: 'demo.Person', methodName: 'setAge',
        objectId: '17', owner: 'demo.Person', name: 'age', descriptor: 'I', value: { kind: 'int', value: 18 } },
      { type: 'exit', frameId: '3', className: 'demo.Person', methodName: 'setAge', descriptor: '(I)V' },
      { type: 'exit', frameId: '1' },
    )
    const result = normalizeTrace(raw, manifest, complete, 'person-real')
    expect(result).toEqual(normalizeTrace(raw, manifest, complete, 'person-real'))
    expect(result.trace.schemaVersion).toBe(2)
    expect(validateTrace(result.trace)).toEqual(result.trace)
    expect(result.trace.sourceFiles[0].fileId).toBe('src/demo/Main.java')
    expect(result.trace.events.some((event) => event.type === 'ENTER_SCOPE' || event.type === 'LOOP_ITERATION')).toBe(false)
    const object = result.trace.events.find((event) => event.type === 'ALLOCATE_OBJECT')
    expect(object).toMatchObject({ objectId: 'jvm:object:17', displayId: 1 })
    const refs = result.trace.events.filter((event) => event.type === 'CREATE_REFERENCE')
    expect(refs).toHaveLength(3)
    expect(refs.every((event) => event.type === 'CREATE_REFERENCE' && event.targetObjectId === 'jvm:object:17')).toBe(true)
    expect(result.trace.events.find((event) => event.type === 'SET_FIELD')).toMatchObject({
      slotId: 'jvm:object:17:field:demo.Person:age:I', value: { kind: 'primitive', value: 18 },
    })
    expect(replay(result.trace)).toMatchObject({ status: 'ended', objects: { 'jvm:object:17': { displayId: 1 } } })
    expect(result.capability.features.references.status).toBe('partial') // constructor receiver preceded safe object observation
  })

  it('preserves recursive invocation IDs and unknown return destinations', () => {
    const raw = events(
      { type: 'enter', frameId: '1', callerFrameId: null, methodName: 'factorial', descriptor: '(I)I',
        receiver: null, parameters: [{ slot: 0, name: 'n', descriptor: 'I', liveRange: 'n', value: { kind: 'int', value: 2 } }] },
      { type: 'enter', frameId: '2', callerFrameId: '1', methodName: 'factorial', descriptor: '(I)I',
        receiver: null, parameters: [{ slot: 0, name: 'n', descriptor: 'I', liveRange: 'n', value: { kind: 'int', value: 1 } }] },
      { type: 'return', frameId: '2', methodName: 'factorial', descriptor: '(I)I', value: { kind: 'int', value: 1 } },
      { type: 'exit', frameId: '2', methodName: 'factorial', descriptor: '(I)I' },
      { type: 'return', frameId: '1', methodName: 'factorial', descriptor: '(I)I', value: { kind: 'int', value: 2 } },
      { type: 'exit', frameId: '1', methodName: 'factorial', descriptor: '(I)I' },
    )
    const result = normalizeTrace(raw, manifest, complete)
    const returns = result.trace.events.filter((event) => event.type === 'RETURN_VALUE')
    expect(returns).toMatchObject([{ destination: null }, { destination: null }])
    expect(replay(result.trace).returns.map((item) => item.frameId)).toEqual(['jvm:frame:2', 'jvm:frame:1'])
  })

  it('records indexed reads/writes and low-level branch without guessing comparisons or write origin', () => {
    const raw = events(
      { type: 'enter', callerFrameId: null, receiver: null, parameters: [] },
      { type: 'array', objectId: '7', elementType: 'int', elements: [3, 1] },
      { type: 'local', slot: 1, liveRange: 'numbers', name: 'numbers', descriptor: '[I',
        value: { kind: 'ref', objectId: '7', className: '[I' } },
      { type: 'array_read', objectId: '7', index: 0, value: 3 },
      { type: 'branch', opcode: 163, left: { kind: 'int', value: 3 }, right: { kind: 'int', value: 1 }, taken: true },
      { type: 'array_write', objectId: '7', index: 0, value: 1 },
      { type: 'exit' },
    )
    const result = normalizeTrace(raw, manifest, complete)
    expect(result.trace.events.find((event) => event.type === 'ARRAY_WRITE')).not.toHaveProperty('from')
    expect(result.trace.events.filter((event) => event.type === 'ARRAY_COMPARE' || event.type === 'EVALUATE_CONDITION')).toHaveLength(0)
    expect(replay(result.trace).objects['jvm:object:7'].array?.elements[0].value).toMatchObject({ value: 1 })
  })

  it('retains the last valid stack and exception on crash, without a success end', () => {
    const raw = events(
      { type: 'enter', callerFrameId: null, receiver: null, parameters: [] },
      { type: 'throw', objectId: '9', className: 'java.lang.IllegalStateException', message: 'boom', explicit: true },
    )
    const result = normalizeTrace(raw, manifest, { status: 'program_crashed', exitCode: 1, diagnostic: 'boom' })
    expect(validateTrace(result.trace)).toEqual(result.trace)
    expect(result.trace.events.at(-1)).toMatchObject({ type: 'PROGRAM_ABORT', reason: 'program_crashed' })
    expect(result.trace.events.some((event) => event.type === 'PROGRAM_END')).toBe(false)
    expect(replay(result.trace)).toMatchObject({ status: 'aborted', activeFrameIds: ['jvm:frame:1'] })
  })

  it('keeps observed unwind and catch transitions in a successful execution', () => {
    const raw = events(
      { type: 'enter', callerFrameId: null, receiver: null, parameters: [] },
      { type: 'enter', frameId: '2', callerFrameId: '1', methodName: 'fail', descriptor: '()V',
        receiver: null, parameters: [] },
      { type: 'throw', frameId: '2', objectId: '9', className: 'java.lang.IllegalStateException',
        message: 'boom', explicit: true },
      { type: 'unwind', frameId: '2', objectId: '9' },
      { type: 'catch', frameId: '1', objectId: '9' },
      { type: 'exit', frameId: '1' },
    )
    const result = normalizeTrace(raw, manifest, complete)
    expect(result.trace.events.find((event) => event.type === 'THROW_EXCEPTION')?.source?.fileId)
      .toBe('src/demo/Main.java')
    expect(result.trace.events.filter((event) => event.type === 'UNWIND_EXCEPTION' || event.type === 'CATCH_EXCEPTION'))
      .toHaveLength(2)
    expect(replay(result.trace).exceptions[0]).toMatchObject({
      unwoundFrameIds: ['jvm:frame:2'], caughtBy: 'jvm:frame:1',
    })
  })

  it('uses explicit class-to-file mapping and leaves ambiguous locations unresolved', () => {
    const twoFiles: InstrumentationSourceManifest = {
      sources: [...manifest.sources, {
        fileId: 'src/demo/Helper.java', name: 'Helper.java', content: 'package demo;\nclass Helper {}', sha256: 'helper-hash',
      }],
      classes: [...manifest.classes, {
        className: 'demo.Helper', sourceFile: 'Helper.java', fileId: 'src/demo/Helper.java',
        sourceSha256: 'helper-hash', status: 'resolved', candidates: ['src/demo/Helper.java'],
      }],
    }
    const raw = events(
      { type: 'enter', callerFrameId: null, receiver: null, parameters: [] },
      { type: 'enter', frameId: '2', callerFrameId: '1', className: 'demo.Helper', methodName: 'work',
        descriptor: '()V', receiver: null, parameters: [], line: 2 },
      { type: 'line', frameId: '2', className: 'demo.Helper', methodName: 'work', descriptor: '()V', line: 2 },
      { type: 'exit', frameId: '2', className: 'demo.Helper', methodName: 'work', descriptor: '()V', line: 2 },
      { type: 'exit', frameId: '1' },
    )
    const mapped = normalizeTrace(raw, twoFiles, complete)
    expect(mapped.trace.events.find((event) => event.type === 'LINE_EXECUTE')?.source?.fileId)
      .toBe('src/demo/Helper.java')
    const ambiguous = structuredClone(twoFiles)
    ambiguous.classes[2] = { ...ambiguous.classes[2], status: 'ambiguous', fileId: null,
      candidates: ['src/demo/Helper.java', 'other/Helper.java'] }
    const unresolved = normalizeTrace(raw, ambiguous, complete)
    expect(unresolved.trace.events.some((event) => event.type === 'LINE_EXECUTE')).toBe(false)
    expect(unresolved.capability.features.sourceMapping.status).toBe('partial')
    expect(replay(unresolved.trace).status).toBe('ended')
  })

  it('stops at a sequence gap and reports an instrumentation failure', () => {
    const raw = events({ type: 'enter', callerFrameId: null, receiver: null, parameters: [] },
      { type: 'exit' })
    raw[1].seq = 3
    const result = normalizeTrace(raw, manifest, complete)
    expect(result.trace.events.at(-1)).toMatchObject({ type: 'PROGRAM_ABORT', reason: 'instrumentation_failed' })
    expect(result.capability.diagnostics[0]).toContain('Raw sequence gap')
    expect(replay(result.trace).activeFrameIds).toEqual(['jvm:frame:1'])
  })
})
