import { describe, expect, it } from 'vitest'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace, seek } from '../runtime'
import { createLayout } from '../world/layout'
import { buildSceneModel } from '../world/sceneModel'
import { endpointPosition, relevantFlowHistory, semanticFlowPoints } from './flowPresentation'
import { deriveSemanticTransition, transitionsForTrace } from './semanticTransition'

describe('semantic transition pipeline', () => {
  it('derives field mutation from adjacent immutable snapshots and only correlates the same named parameter', () => {
    const trace = loadPersonTrace()
    const index = trace.events.findIndex((item) => item.type === 'SET_FIELD' && item.label.includes('age'))
    const before = seek(trace, index)
    const after = seek(trace, index + 1)
    const prior = before.objects['object:person:17'].fields
    const flow = deriveSemanticTransition(before, trace.events[index], after)!
    expect(flow).toMatchObject({ kind: 'field-write', evidence: 'correlated', value: { value: 18 } })
    expect(flow.from?.id).toContain('setAge:1:age')
    expect(flow.to?.id).toContain('person:17:age')
    expect(prior).not.toEqual(after.objects['object:person:17'].fields)
    expect(before.objects['object:person:17'].fields).toEqual(prior)
  })

  it('uses explicit array origins and retains cell XYZ across history', () => {
    const trace = loadArrayTrace()
    const flows = transitionsForTrace(trace)
    const write = flows.find((item) => item.kind === 'array-write' && item.from)
    expect(write).toMatchObject({ evidence: 'observed' })
    const layout = createLayout(trace)
    const final = buildSceneModel(seek(trace, trace.events.length), layout, 'meso')
    expect(endpointPosition(write!.to, layout, final)).toEqual(layout.anchors[write!.to!.id].bodyPort)
    expect(relevantFlowHistory(flows, write!.to!.id, trace.events.length).some((item) => item.id === write!.id)).toBe(true)
  })

  it('routes observed input, output, and recursive returns without inventing missing origins', () => {
    const control = transitionsForTrace(loadControlTrace())
    expect(control.some((item) => item.kind === 'input' && item.from?.id === 'stdin' && item.to?.kind === 'slot' && item.evidence === 'observed')).toBe(true)
    expect(control.some((item) => item.kind === 'output' && item.to?.id === 'stdout')).toBe(true)
    const recursion = transitionsForTrace(loadRecursionTrace())
    expect(recursion.filter((item) => item.kind === 'return' && item.to?.kind === 'slot')).toHaveLength(5)
  })

  it('routes semantic movement through the rear channel for arbitrary endpoint positions', () => {
    for (const [from, to] of [
      [[-4, 2, 1], [3, -1, 0]],
      [[2, -5, -2], [-6, 3, 2]],
    ] as const) {
      const points = semanticFlowPoints([...from], [...to], -4)
      expect(points[0]).toEqual(from)
      expect(points.at(-1)).toEqual(to)
      expect(points[1][2]).toBeLessThan(Math.min(from[2], to[2]))
      expect(points[2][2]).toBe(points[1][2])
    }
  })

  it('uses the observed caller for parameter arrival without inventing a caller slot', () => {
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
    expect(deriveSemanticTransition(before, event, before)).toMatchObject({ kind: 'parameter',
      from: { kind: 'frame', id: called.callerFrameId }, to: { kind: 'slot', id: 'age-probe' }, evidence: 'local' })
  })
})
