import { describe, expect, it } from 'vitest'
import { layoutForTrace } from '../app/layoutForTrace'
import type { GraphIO } from '../contracts/executionGraph'
import type { SceneIoEndpoint } from '../contracts/world'
import { loadControlTrace } from '../examples/traces'
import { endpointPosition, semanticFlowPoints, transitionIsFlow } from '../motion/flowPresentation'
import { transitionsForTrace } from '../motion/semanticTransition'
import { applyEvent, seek } from '../runtime'
import { emptyExecutionGraph } from '../runtime/executionGraph'
import { createLayout } from './layout'
import { buildSceneModel } from './sceneModel'
import { planSpatialPresentation } from './spatialPresentation'

describe('graphless authored I/O projection', () => {
  const trace = loadControlTrace()
  const layout = layoutForTrace(trace)
  const firstInput = trace.events.findIndex(event => event.type === 'INPUT_READ')
  const firstOutput = trace.events.findIndex(event => event.type === 'OUTPUT_WRITE')
  const sceneAt = (cursor: number) => buildSceneModel(seek(trace, cursor), layout, 'micro')

  it('shows only consumed/written facts at the current cursor, never future channels or previews', () => {
    expect(firstInput).toBeGreaterThan(-1)
    expect(firstOutput).toBeGreaterThan(firstInput)
    expect(layout.scopes).toBeDefined()
    expect(seek(trace, trace.events.length).executionGraph).toBeUndefined()
    expect(sceneAt(0).io).toEqual([])
    expect(sceneAt(firstInput).io).toEqual([])
    expect(sceneAt(firstOutput).io?.map(endpoint => endpoint.id)).toEqual(['stdin'])

    for (let cursor = 0; cursor <= trace.events.length; cursor++) {
      const applied = trace.events.slice(0, cursor)
      const expected = (['stdin', 'stdout'] as const).flatMap(id => {
        const facts = applied.filter(event => event.type === (id === 'stdin' ? 'INPUT_READ' : 'OUTPUT_WRITE'))
        const last = facts.at(-1)
        return last && (last.type === 'INPUT_READ' || last.type === 'OUTPUT_WRITE')
          ? [{ id, observations: facts.length, preview: last.text.trim().slice(0, 40) }] : []
      })
      expect(sceneAt(cursor).io?.map(({ id, observations, preview }) => ({ id, observations, preview }))).toEqual(expected)
    }
    expect(sceneAt(trace.events.length).io).toMatchObject([
      { id: 'stdin', observations: 3, preview: '130' },
      { id: 'stdout', observations: 4, preview: '142' },
    ])
  })

  it('does not turn submitted console bytes into consumed input geometry', () => {
    const before = seek(trace, firstInput)
    const submitted = applyEvent(before, {
      type: 'CONSOLE_INPUT', eventId: 'submitted-only', seq: firstInput, source: null,
      label: 'Submitted bytes', importance: 'normal', frameId: null, text: '99\n',
    })
    expect(submitted.console.at(-1)?.text).toBe('99\n')
    expect(buildSceneModel(submitted, layout, 'micro').io).toEqual([])
  })

  it('retains the existing observed input/output flows at actual channel and canonical slot positions', () => {
    const transitions = transitionsForTrace(trace)
    const ioEvents = trace.events.filter(event => event.type === 'INPUT_READ' || event.type === 'OUTPUT_WRITE')
    expect(ioEvents).toHaveLength(7)
    for (const event of ioEvents) {
      const scene = sceneAt(event.seq + 1)
      const transition = transitions.find(item => item.seq === event.seq)!
      expect(transition).toBeDefined()
      expect(transitionIsFlow(transition)).toBe(true)
      const plan = planSpatialPresentation(scene, null, {
        event, transition, flowHistory: [transition], flowDisplay: 'all', detailLevel: 'micro',
      })
      expect(plan.flows).toEqual([transition])
      expect(plan.flows[0]).toBe(transition)
      const channel = plan.scene.io?.find(endpoint => endpoint.id === (event.type === 'INPUT_READ' ? 'stdin' : 'stdout'))
      expect(channel).toBeDefined()
      if (event.type !== 'INPUT_READ' && event.type !== 'OUTPUT_WRITE') throw new Error('Expected I/O event')
      const slotId = event.type === 'INPUT_READ' ? event.destinationSlotId : event.originSlotId!
      const port = layout.anchors[event.frameId].ports[slotId]
      expect(port).toBeDefined()
      expect(plan.scene.frames.some(frame => frame.slots.some(slot => slot.id === slotId))).toBe(true)
      const from = endpointPosition(transition.from, layout, plan.scene)!
      const to = endpointPosition(transition.to, layout, plan.scene)!
      expect(from).toEqual(event.type === 'INPUT_READ' ? channel!.anchor.bodyPort : port)
      expect(to).toEqual(event.type === 'INPUT_READ' ? port : channel!.anchor.bodyPort)
      const points = semanticFlowPoints(from, to, 0)
      expect(points[0]).toEqual(from)
      expect(points.at(-1)).toEqual(to)
    }
  })

  it('keeps channel solids and ports fixed through forward, reverse and out-of-order scrubbing', () => {
    const end = sceneAt(trace.events.length)
    const anchors = new Map(end.io!.map(endpoint => [endpoint.id, endpoint.anchor]))
    const reserved = structuredClone(layout)
    const cursors = [trace.events.length, firstInput + 1, firstOutput + 1, 0,
      ...trace.events.map((_, index) => index + 1),
      ...trace.events.map((_, index) => trace.events.length - index)]
    for (const cursor of cursors) for (const endpoint of sceneAt(cursor).io ?? []) {
      expect(endpoint.anchor).toBe(anchors.get(endpoint.id))
      expect(endpoint.anchor.position).toEqual(anchors.get(endpoint.id)!.position)
      expect(endpoint.anchor.bodyPort).toEqual(anchors.get(endpoint.id)!.bodyPort)
    }
    const input = anchors.get('stdin')!, output = anchors.get('stdout')!
    expect(Math.abs(input.position[0] - output.position[0])).toBeGreaterThan((input.size[0] + output.size[0]) / 2)
    expect(layout).toEqual(reserved)
    expect(sceneAt(0).io).toEqual([])
  })

  it('keeps GraphIO authoritative and uses only its existing generic anchors', () => {
    const runtime = seek(trace, trace.events.length)
    const generic = createLayout(trace)
    const empty = emptyExecutionGraph()
    expect(buildSceneModel({ ...runtime, executionGraph: empty }, generic, 'micro').io).toEqual([])
    const context: GraphIO['context'] = { owner: 'app.Program', name: 'main', descriptor: '()V', frameId: null, site: null, rawSeq: 1, source: null }
    const observation = (id: string, kind: GraphIO['kind'], channel: GraphIO['channel'], text: string): GraphIO =>
      ({ id, kind, channel, text, eventId: `fact:${id}`, context })
    const graph = { ...empty, io: {
      bytes: observation('bytes', 'input-bytes', 'stdin', 'unconsumed bytes'),
      input: observation('input', 'input-consume', 'stdin', '7'),
      output: observation('output', 'output', 'stdout', 'graph output'),
      file: observation('file', 'file', 'file', 'file contents'),
    } }
    const scene = buildSceneModel({ ...runtime, executionGraph: graph }, generic, 'micro')
    expect(scene.io).toHaveLength(2)
    for (const endpoint of scene.io!) expect(endpoint.anchor).toBe(generic.anchors[`io:${endpoint.id}`])
    expect(scene.io).toMatchObject([
      { id: 'stdin', observations: 1, preview: '7' },
      { id: 'stdout', observations: 1, preview: 'graph output' },
    ])
    const withoutInput = { ...generic, anchors: { ...generic.anchors } }
    delete withoutInput.anchors['io:stdin']
    const endpoints: SceneIoEndpoint[] = buildSceneModel({ ...runtime, executionGraph: graph }, withoutInput, 'micro').io!
    expect(endpoints.map(endpoint => endpoint.id)).toEqual(['stdout'])
  })
})
