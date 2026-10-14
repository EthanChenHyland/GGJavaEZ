import { describe, expect, it, vi } from 'vitest'
import { seek } from '../runtime'
import { applyEvent, createInitialState } from '../runtime/state'
import { historyForTrace } from '../runtime/history'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from '../examples/traces'
import { projectTrace } from '../testing/projectTrace'
import { arrayCellTarget } from '../world/arrayCellTarget'
import { computeArrayWindow } from '../world/arrayWindow'
import { presentedFlowPorts } from '../world/flowTopology'
import type { TraceEvent } from '../contracts/runtime'
import { relevantFlowHistory, semanticFlowPoints, transitionIsFlow } from './flowPresentation'
import { deriveSemanticTransition, transitionsForTrace, type SemanticTransition } from './semanticTransition'

describe('semantic transition pipeline', () => {
  it('keeps field writes destination-only even when a parameter has the same name and value', () => {
    const trace = loadPersonTrace()
    const index = trace.events.findIndex((item) => item.type === 'SET_FIELD' && item.label.includes('age'))
    const before = seek(trace, index)
    const after = seek(trace, index + 1)
    const prior = before.objects['object:person:17'].fields
    const flow = deriveSemanticTransition(before, trace.events[index], after)!
    expect(flow).toMatchObject({ kind: 'field-write', evidence: 'local', value: { value: 18 } })
    expect(flow).not.toHaveProperty('from')
    expect(flow.to?.id).toContain('person:17:age')
    expect(transitionIsFlow(flow)).toBe(false)
    expect(prior).not.toEqual(after.objects['object:person:17'].fields)
    expect(before.objects['object:person:17'].fields).toEqual(prior)
  })

  it.each([loadPersonTrace, loadRecursionTrace, loadArrayTrace, loadControlTrace])('never emits correlated data flow (%#)', (load) => {
    expect(transitionsForTrace(load()).some(item => item.evidence === 'correlated')).toBe(false)
  })

  it('uses explicit array origins and retains cell XYZ across history', () => {
    const trace = loadArrayTrace()
    const flows = transitionsForTrace(trace)
    const write = flows.find((item) => item.kind === 'array-write' && item.from)
    expect(write).toMatchObject({ evidence: 'observed' })
    const projection = projectTrace(trace), final = projection.project(trace.events.length)
    const target = arrayCellTarget(final, write!.to!.id)!
    expect(target).not.toBeNull()
    const window = computeArrayWindow({ recordingId: final.recordingId, arrayId: target.array.id, recordedLength: target.array.length,
      anchor: target.array.anchor, requestedIndices: [target.index], nominalCellBudget: 128 })
    const presented = new Map([[target.array.id, {id:target.array.id,mode:'detailed' as const,detail:'CLOSE' as const,opacity:1,pinned:true,pickable:true,highlight:null}]])
    const windows = new Map([[target.array.id, window]])
    const destination = presentedFlowPorts(final, presented, windows)(write!.to!)!
    expect(destination.point).toEqual(window.mapping.get(write!.to!.id)!.port)
    expect(destination.point).toEqual(projection.layout.anchors[write!.to!.id].bodyPort)
    for (const cursor of [write!.seq + 1, trace.events.length, write!.seq + 1]) {
      expect(presentedFlowPorts(projection.project(cursor), presented, windows)(write!.to!)?.point).toEqual(destination.point)
    }
    expect(relevantFlowHistory(flows, write!.to!.id, trace.events.length).some((item) => item.id === write!.id)).toBe(true)
  })

  it('routes observed input, output, and recursive returns without inventing missing origins', () => {
    const control = transitionsForTrace(loadControlTrace())
    expect(control.some((item) => item.kind === 'input' && item.from?.id === 'stdin' && item.to?.kind === 'slot' && item.evidence === 'observed')).toBe(true)
    expect(control.some((item) => item.kind === 'output' && item.from?.kind === 'slot' && item.to?.id === 'stdout' && item.evidence === 'observed')).toBe(true)
    const recursion = transitionsForTrace(loadRecursionTrace())
    expect(recursion.filter((item) => item.kind === 'return' && item.to?.kind === 'slot')).toHaveLength(5)
  })

  it('attaches semantic movement beside front-face ports for arbitrary endpoint positions', () => {
    for (const [from, to] of [
      [[-4, 2, 1], [3, -1, 0]],
      [[2, -5, -2], [-6, 3, 2]],
    ] as const) {
      const points = semanticFlowPoints([...from], [...to], -4)
      expect(points[0]).toEqual(from)
      expect(points.at(-1)).toEqual(to)
      expect(points[1][2]).toBeGreaterThan(from[2])
      expect(points[2][2]).toBeGreaterThan(Math.max(from[2], to[2]))
      expect(points[3][2]).toBe(points[2][2])
      expect(points.at(-2)![0]).toBeGreaterThan(to[0])
    }
  })

  it('emphasizes a parameter value locally without a caller-frame origin', () => {
    const trace = loadPersonTrace()
    const entry = trace.events.findIndex((event) => event.type === 'ENTER_METHOD' && event.methodName === 'setAge')
    expect(entry).toBeGreaterThan(-1)
    const before = seek(trace, entry + 1)
    const called = trace.events[entry]
    if (called.type !== 'ENTER_METHOD') throw new Error('Expected setAge entry')
    const event = { eventId: 'parameter-probe', seq: 999, source: called.source, label: 'age = 18', importance: 'major' as const,
      type: 'DECLARE_LOCAL' as const, frameId: called.frameId,
      slot: { id: 'age-probe', name: 'age', javaType: 'int', role: 'parameter' as const,
        value: { kind: 'primitive' as const, javaType: 'int' as const, value: 18 } } }
    const transition = deriveSemanticTransition(before, event, before)!
    expect(transition).toMatchObject({ kind: 'parameter', label: 'age = 18', value: { value: 18 },
      to: { kind: 'slot', id: 'age-probe' }, evidence: 'local' })
    expect(transition).not.toHaveProperty('from')
    expect(transitionIsFlow(transition)).toBe(false)
  })

  it('keeps unobserved output origins local while retaining an observed source slot', () => {
    const trace = loadControlTrace()
    const output = trace.events.find((event) => event.type === 'OUTPUT_WRITE')
    if (!output || output.type !== 'OUTPUT_WRITE') throw new Error('Expected an output event')
    const before = seek(trace, output.seq)
    const after = seek(trace, output.seq + 1)
    const observed = deriveSemanticTransition(before, output, after)!
    expect(observed).toMatchObject({ kind: 'output', evidence: 'observed',
      from: { kind: 'slot', id: output.originSlotId }, to: { kind: 'io', id: 'stdout' } })
    expect(transitionIsFlow(observed)).toBe(true)

    const local = deriveSemanticTransition(before, { ...output, originSlotId: undefined }, after)!
    expect(local).toMatchObject({ kind: 'output', evidence: 'local', value: output.value,
      to: { kind: 'io', id: 'stdout' } })
    expect(local).not.toHaveProperty('from')
    expect(transitionIsFlow(local)).toBe(false)

    const consoleWrite: TraceEvent = { eventId: 'console-probe', seq: output.seq,
      source: output.source, label: 'stdout write', importance: 'normal',
      type: 'CONSOLE_WRITE', frameId: output.frameId, channel: 'stdout', text: '18\n' }
    const recorded = deriveSemanticTransition(before, consoleWrite, after)!
    expect(recorded).toMatchObject({ kind: 'output', label: 'stdout write', evidence: 'local',
      value: { value: '18\n' }, to: { kind: 'io', id: 'stdout' } })
    expect(recorded).not.toHaveProperty('from')
    expect(transitionIsFlow(recorded)).toBe(false)
    expect(relevantFlowHistory([recorded], null, output.seq + 1)).toEqual([])
  })

  it('rejects a local-evidence path even if a caller endpoint is supplied', () => {
    const local = { id: 'legacy', seq: 0, kind: 'parameter' as const, label: 'parameter observed',
      source: null, importance: 'normal' as const, evidence: 'local' as const,
      from: { kind: 'frame' as const, id: 'caller' }, to: { kind: 'slot' as const, id: 'parameter' } }
    expect(transitionIsFlow(local)).toBe(false)
    expect(relevantFlowHistory([local], 'parameter', 1)).toEqual([])
  })
})

describe('append-only transition cache', () => {
  const oracle = (events: TraceEvent[]) => {
    let state = createInitialState()
    const result: SemanticTransition[] = []
    for (const event of events) {
      const next = applyEvent(state, event)
      const transition = deriveSemanticTransition(state, event, next)
      if (transition) result.push(transition)
      state = next
    }
    return result
  }

  it.each([loadPersonTrace, loadRecursionTrace, loadArrayTrace, loadControlTrace])('matches the pure reducer at every prefix and retains old transition snapshots (%#)', (load) => {
    const full = load()
    const trace = { ...full, events: [] as TraceEvent[] }
    let before = transitionsForTrace(trace)
    const expected = oracle(full.events)
    for (const event of full.events) {
      const retained = JSON.stringify(before)
      trace.events.push(event)
      const after = transitionsForTrace(trace)
      expect(after).toEqual(expected.filter(item => item.seq < trace.events.length))
      expect(JSON.stringify(before)).toBe(retained)
      for (let index = 0; index < before.length; index++) expect(after[index]).toBe(before[index])
      expect(transitionsForTrace(trace)).toBe(after)
      before = after
    }
  })

  it('uses only suffix materialization in the shared history and leaves the live head unchanged', () => {
    const source = loadPersonTrace()
    const trace = { ...source, events: source.events.slice(0, 9) }
    const history = historyForTrace(trace)
    const materialize = vi.spyOn(history, 'materialize')
    transitionsForTrace(trace)
    expect(materialize.mock.calls.map(([cursor]) => cursor)).toEqual(Array.from({ length: 10 }, (_, i) => i))
    materialize.mockClear()
    const head = history.state
    const retained = transitionsForTrace(trace)
    expect(materialize).not.toHaveBeenCalled()
    trace.events.push(...source.events.slice(9, 12))
    const after = transitionsForTrace(trace)
    expect(materialize.mock.calls.map(([cursor]) => cursor)).toEqual([9, 10, 11, 12])
    expect(after).toEqual(oracle(trace.events))
    expect(history.state.cursor).toBe(12)
    expect(head.cursor).toBe(9)
    expect(retained).toEqual(oracle(source.events.slice(0, 9)))
    materialize.mockRestore()
  })

  it('isolates traces sharing demo IDs and even event IDs with different interior semantics', () => {
    const source = loadPersonTrace()
    const first = { ...source, events: source.events.map(event => ({ ...event })) }
    const second = { ...source, events: source.events.map(event => event.type === 'DECLARE_LOCAL'
      ? { ...event, label: `${event.label} alternate` } : { ...event }) }
    const left = transitionsForTrace(first)
    const right = transitionsForTrace(second)
    expect(left).toEqual(oracle(first.events))
    expect(right).toEqual(oracle(second.events))
    expect(right).not.toEqual(left)
    expect(transitionsForTrace(first)).toBe(left)
  })

  it('rebuilds for truncated/replaced traces with reused event IDs', () => {
    const full = loadPersonTrace()
    const trace = { ...full, events: full.events.slice(0, 12) }
    transitionsForTrace(trace)
    trace.events = full.events.slice(0, 4)
    expect(transitionsForTrace(trace)).toEqual(oracle(trace.events))
    trace.events = full.events.slice(0, 12).map(event => ({ ...event, label: `${event.label} replaced` }))
    expect(transitionsForTrace(trace)).toEqual(oracle(trace.events))
  })

  it.each(['STOPPED_LIMIT', 'STOPPED_UNSUPPORTED', 'STOPPED_ERROR'] as const)('retains partial trace transitions without synthetic completion (%s)', (state) => {
    const full = loadPersonTrace()
    const trace = { ...full, schemaVersion: 2 as const, events: full.events.slice(0, 10) }
    transitionsForTrace(trace)
    trace.events.push({ eventId: 'partial-stop', seq: trace.events.length, label: 'Recording stopped', source: null, importance: 'major',
      type: 'CAPTURE_STOP', recording: { state, reason: 'stopped', budget: state === 'STOPPED_LIMIT' ? 'events' : null,
        lastRecordedSeq: 9, executionContinued: true } })
    expect(transitionsForTrace(trace)).toEqual(oracle(trace.events))
    expect(historyForTrace(trace).state.status).toBe('partial')
  })
})
