import { describe, expect, it } from 'vitest'
import type { RawRuntimeEvent } from './contracts'
import { TraceNormalizer, type InstrumentationSourceManifest } from './normalize'
import { seek } from '../runtime/seek'
import { applyEvent, createInitialState } from '../runtime/state'

const manifest: InstrumentationSourceManifest = { sources: [], classes: [] }
const enter = { type: 'enter', callerFrameId: null, receiver: null, parameters: [] }
const metadata = { ownership: 'JDK', runtimeType: 'java.util.ArrayList', packageName: 'java.util' }
const ref = (objectId: string, className = 'java.lang.Object') => ({ kind: 'ref', objectId, className })
function run(items: Record<string, unknown>[]) {
  const normalizer = new TraceNormalizer(manifest)
  const raw = items.map((item, seq) => ({ v: 1, coverageVersion: 1, provenanceVersion: 1, seq,
    threadId: '1', frameId: 'f', className: 'Sample', methodName: 'main', descriptor: '()V', site: seq, line: null, ...item })) as RawRuntimeEvent[]
  for (const item of raw) normalizer.append([item])
  const result = normalizer.finish({ status: 'complete', exitCode: 0, diagnostic: null })
  expect(result.capability.diagnostics).not.toEqual(expect.arrayContaining([expect.stringMatching(/^Raw event /)]))
  expect(normalizer.state.status).toBe('ended')
  let plain = createInitialState()
  const roots = [plain]
  for (const event of result.trace.events) { plain = applyEvent(plain, event); roots.push(plain) }
  for (const cursor of [result.trace.events.length, 2, 0, result.trace.events.length - 1, result.trace.events.length]) {
    expect(JSON.stringify(seek(result.trace, cursor))).toBe(JSON.stringify(roots[cursor]))
  }
  return normalizer
}

describe('expanded raw observations through immutable runtime and graph', () => {
  it('preserves cyclic arrays before main, nested aliases, sparse writes and observed reads', () => {
    const result = run([
      { type: 'array', frameId: null, objectId: 'inner', elementType: 'java.lang.Object', length: 1, truncated: false, elements: [ref('outer', 'java.lang.Object[]')] },
      { type: 'array', frameId: null, objectId: 'outer', elementType: 'java.lang.Object', length: 1000000, truncated: true, elements: [ref('inner', 'java.lang.Object[]')] },
      enter,
      { type: 'array_write', objectId: 'outer', elementType: 'java.lang.Object', index: 999999, value: ref('inner', 'java.lang.Object[]') },
      { type: 'array_read', objectId: 'outer', elementType: 'java.lang.Object', index: 0, value: { kind: 'null' } },
      { type: 'exit' },
    ])
    const outer = result.state.objects['jvm:object:outer']
    expect(outer.array!.elements).toHaveLength(1)
    expect(outer.array!.elements[0].value).toEqual({ kind: 'null' })
    expect(outer.array!.sparseElements!['999999'].value).toMatchObject({ objectId: 'jvm:object:inner', javaType: 'java.lang.Object' })
    expect(result.state.objects['jvm:object:inner'].array!.elements[0].value).toMatchObject({ objectId: 'jvm:object:outer' })
    expect(result.state.arrayMutations).toHaveLength(1)
    expect(result.state.arrayMutations[0].before).toMatchObject({ kind: 'unavailable' })
  })

  it.each([
    ['B', 'byte', -128], ['S', 'short', -32768], ['I', 'int', 2147483647],
    ['J', 'long', '9223372036854775807'], ['J', 'long', '-9223372036854775808'],
    ['F', 'float', '-0.0'], ['D', 'double', 'NaN'], ['D', 'double', 'Infinity'], ['D', 'double', '-Infinity'],
    ['Z', 'boolean', true], ['C', 'char', '\ud800'],
  ])('retains exact %s values (%s, %s)', (descriptor, kind, value) => {
    const result = run([enter, { type: 'local', slot: 1, liveRange: 'value', name: 'differentName', descriptor, value: { kind, value } }, { type: 'exit' }])
    expect(result.state.executionGraph!.values[result.state.executionGraph!.storage['jvm:frame:f:local:1:value'].valueId!].value).toEqual({ kind: 'primitive', javaType: kind, value })
  })

  it('preserves class completion through subsequent reads without inventing writers', () => {
    const fields = [{ owner: 'Sample', name: 'total', descriptor: 'J', value: { kind: 'long', value: '9007199254740993' } }]
    const result = run([enter,
      { type: 'class_state', owner: 'Sample', initialization: 'started', fields },
      { type: 'class_state', owner: 'Sample', initialization: 'completed', fields },
      { type: 'static_read', owner: 'Sample', name: 'total', descriptor: 'J', value: fields[0].value },
      { type: 'class_state', owner: 'Sample', initialization: 'observed', fields }, { type: 'exit' },
    ])
    expect(result.state.classes!['jvm:class:Sample'].initialization).toBe('completed')
    const graph = result.state.executionGraph!
    expect(graph.classes!['jvm:class:Sample'].initialization).toBe('completed')
    expect(graph.storage['jvm:class:Sample:field:Sample:total:J'].writerInvocationId).toBeUndefined()
    expect(graph.edges.some(edge => edge.kind === 'STATIC_READ')).toBe(true)
    expect(graph.edges.some(edge => edge.kind === 'STATIC_WRITE')).toBe(false)
  })

  it('retires collection membership in place, preserves aliases and historical roots', () => {
    const result = run([enter,
      { type: 'string_object', objectId: 'text', className: 'java.lang.String', value: 'same', length: 4, truncated: false },
      { type: 'library', objectId: 'list', className: 'java.util.ArrayList', metadata, summary: { kind: 'LIST', size: 2, order: 'index', items: [ref('text', 'java.lang.String'), ref('text', 'java.lang.String')] } },
      { type: 'library', objectId: 'list', className: 'java.util.ArrayList', metadata, summary: { kind: 'LIST', size: 0, order: 'index', items: [] } },
      { type: 'exit' },
    ])
    expect(result.state.objects['jvm:object:list'].fields).toEqual({})
    expect(result.state.executionGraph!.storage['jvm:object:list:summary:item:0']).toBeUndefined()
    const before = result.trace.events.findIndex(event => event.type === 'OBJECT_OBSERVE' && event.library?.size === 0)
    const root = seek(result.trace, before)
    expect(Object.values(root.objects['jvm:object:list'].fields)).toHaveLength(2)
    expect(root.objects['jvm:object:list'].library!.items![0]).toEqual(root.objects['jvm:object:list'].library!.items![1])
  })

  it('enriches a previously thrown exception identity instead of allocating it twice', () => {
    const result = run([enter,
      { type: 'throw', objectId: 'failure', className: 'java.lang.IllegalStateException', message: null, explicit: false },
      { type: 'catch', objectId: 'failure' },
      { type: 'library', objectId: 'failure', className: 'java.lang.IllegalStateException', metadata: { ...metadata, runtimeType: 'java.lang.IllegalStateException', packageName: 'java.lang' }, summary: { kind: 'OPAQUE', reason: 'No safe adapter', truncated: true } },
      { type: 'exit' },
    ])
    expect(Object.keys(result.state.executionGraph!.objects)).toEqual(['jvm:object:failure'])
    expect(result.state.executionGraph!.objects['jvm:object:failure'].metadata?.ownership).toBe('JDK')
  })
})
