import { describe, expect, it } from 'vitest'
import type { ExecutionFact, ExecutionSite } from '../contracts/executionGraph'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import { seek } from '../runtime'
import { loadPersonTrace, loadRecursionTrace } from '../examples/traces'
import { projectTrace } from '../testing/projectTrace'
import { planPresentation } from './presentationPlanner'
import { prepareConnectorFaceClearance } from './connectorRouting'

describe('retained production call structure', () => {
  it('connects each Person invocation to its recorded caller without linking siblings', () => {
    const trace = { ...loadPersonTrace(), demoId: 'execution:call-tree' }, projection = projectTrace(trace)
    const scene = projection.project(trace.events.length)
    expect(scene.callLinks.map(({ callerId, calleeId }) => [callerId, calleeId])).toEqual([
      ['frame:main:1', 'frame:person-constructor:1'], ['frame:main:1', 'frame:person-setAge:1'],
    ])
    const plan = planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: true, scope: 'all' } })
    const curves = plan.curves.filter(curve => curve.kind === 'call')
    expect(curves).toHaveLength(2)
    const clears = prepareConnectorFaceClearance(Object.values(scene.entities).map(node => node.anchor))
    for (const link of scene.callLinks) {
      const curve = curves.find(curve => curve.id === link.id)!, caller = scene.entities[link.callerId], callee = scene.entities[link.calleeId]
      expect(curve.sourceAnchor).toBe(caller.anchor); expect(curve.destinationAnchor).toBe(callee.anchor)
      expect(curve.points[0][2]).toBe(caller.anchor.position[2] + caller.anchor.size[2] / 2)
      expect(curve.points.at(-1)![2]).toBe(callee.anchor.position[2] + callee.anchor.size[2] / 2)
      expect(clears(curve.points, caller.anchor, callee.anchor),link.id).toBe(true)
    }
    for (let cursor = 0; cursor <= trace.events.length; cursor++) expect(projection.project(cursor).callLinks.every(link => link.callSeq < cursor)).toBe(true)
  })

  it('keeps an observed ancestor distinct from a recorded direct call across opaque code', () => {
    // Explicit normalized unit facts through the real reducer, not JVM evidence
    // or a fabricated presentation-only caller-evidence flag.
    const events: TraceEvent[] = []
    const emit = (event: Omit<TraceEvent, 'eventId' | 'seq' | 'source' | 'label' | 'importance'>) => {
      events.push({ ...event, eventId: `unit/calls/${events.length}`, seq: events.length, source: null, label: 'Explicit unit call', importance: 'normal' } as TraceEvent)
    }
    const enter = (frameId: string, callerFrameId: string | null) => emit({ type: 'ENTER_METHOD', frameId, callerFrameId, className: 'Unit', methodName: frameId, locals: [] } as Omit<Extract<TraceEvent, { type: 'ENTER_METHOD' }>, 'eventId' | 'seq' | 'source' | 'label' | 'importance'>)
    const method = (name: string) => ({ owner: 'Unit', name, descriptor: '()V' })
    const context = (frameId: string | null): ExecutionSite => ({ ...method('main'), frameId, site: 0, rawSeq: 100 + events.length, source: null })
    const fact = (value: ExecutionFact) => emit({ type: 'EXECUTION_FACT', fact: value } as Omit<Extract<TraceEvent, { type: 'EXECUTION_FACT' }>, 'eventId' | 'seq' | 'source' | 'label' | 'importance'>)
    emit({ type: 'PROGRAM_START' }); enter('main', null)
    fact({ kind: 'enter', invocationId: 'main', callerInvocationId: null, method: method('main'), receiver: null, parameters: [], context: context(null) })
    enter('opaque', 'main')
    fact({ kind: 'enter', invocationId: 'opaque', callerInvocationId: 'main', method: method('opaque'), receiver: null, parameters: [], context: context('main') })
    emit({ type: 'EXIT_METHOD', frameId: 'opaque' } as Omit<Extract<TraceEvent, { type: 'EXIT_METHOD' }>, 'eventId' | 'seq' | 'source' | 'label' | 'importance'>)
    fact({ kind: 'exit', invocationId: 'opaque', context: context('opaque') })
    fact({ kind: 'call', callId: 'unit/direct', declared: method('child'), invokeKind: 'static', receiver: null, arguments: [], argumentOrigins: [], receiverOrigin: { kind: 'unknown' }, context: context('main') })
    enter('child', 'main')
    fact({ kind: 'enter', invocationId: 'child', callerInvocationId: 'main', method: method('child'), callId: 'unit/direct', receiver: null, parameters: [], context: context('main') })
    const trace: TraceDocument = { schemaVersion: 2, demoId: 'unit/opaque-call', sourceFiles: [], events }, projection = projectTrace(trace)
    const graph = seek(trace, events.length).executionGraph!
    expect(graph.invocations.opaque.observedAncestorInvocationId).toBe('main')
    expect(graph.invocations.opaque.callerInvocationId).toBeNull()
    expect(projection.project(events.length).callLinks.map(link => [link.callerId, link.calleeId])).toEqual([['main', 'child']])
    for (let cursor = 0; cursor < events.length; cursor++) expect(projection.project(cursor).callLinks).toEqual([])
  })

  it('uses the same recorded parent relationships in deeper recursion at every replay prefix', () => {
    const trace = { ...loadRecursionTrace(), demoId: 'execution:recursion-calls' }, projection = projectTrace(trace)
    const scene = projection.project(trace.events.length)
    expect(scene.callLinks).toHaveLength(scene.order.frames.length - 1)
    for (const link of scene.callLinks) {
      const callee = scene.entities[link.calleeId]
      if (callee.kind !== 'frame') throw new Error('Expected frame')
      expect(callee.callerId).toBe(link.callerId)
      expect(projection.project(link.callSeq).callLinks.some(prior => prior.id === link.id)).toBe(false)
      expect(projection.project(link.callSeq + 1).callLinks.some(prior => prior.id === link.id)).toBe(true)
    }
  })
})
