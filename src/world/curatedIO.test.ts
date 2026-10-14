import { describe, expect, it } from 'vitest'
import type { ExecutionFact, ExecutionSite } from '../contracts/executionGraph'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import { loadControlTrace } from '../examples/traces'
import { seek } from '../runtime'
import { createSceneProjector } from './sceneProjector'
import { projectTrace } from '../testing/projectTrace'
import { createFlowCatalog } from './flowCatalog'
import { planPresentation } from './presentationPlanner'
import { transitionsForTrace } from '../motion/semanticTransition'
import { transitionIsFlow } from '../motion/flowSelection'

describe('graphless authored I/O through the production projection', () => {
  const trace = loadControlTrace(), projection = projectTrace(trace)
  const firstInput = trace.events.findIndex(event => event.type === 'INPUT_READ')
  const firstOutput = trace.events.findIndex(event => event.type === 'OUTPUT_WRITE')
  const sceneAt = projection.project

  it('shows only consumed/written facts at the current cursor, never future channels or previews', () => {
    expect(firstInput).toBeGreaterThan(-1)
    expect(firstOutput).toBeGreaterThan(firstInput)
    expect(seek(trace, trace.events.length).executionGraph).toBeUndefined()
    expect(sceneAt(0).io).toEqual([])
    expect(sceneAt(firstInput).io).toEqual([])
    expect(sceneAt(firstOutput).io.map(endpoint => endpoint.id)).toEqual(['stdin'])
    for (let cursor = 0; cursor <= trace.events.length; cursor++) {
      const applied = trace.events.slice(0, cursor)
      const expected = (['stdin', 'stdout'] as const).flatMap(id => {
        const facts = applied.filter(event => event.type === (id === 'stdin' ? 'INPUT_READ' : 'OUTPUT_WRITE'))
        if (!facts.length) return []
        const text = facts.map(event => 'text' in event ? event.text : '').join('')
        const lines = text.split('\n'), complete = text.endsWith('\n')
        return [{ id, lines: lines.length - Number(complete), preview: (complete ? lines.at(-2) : lines.at(-1))!.slice(0, 60) }]
      })
      expect(sceneAt(cursor).io.map(({ id, lines, preview }) => ({ id, lines, preview }))).toEqual(expected)
      const current = applied.at(-1)
      expect(sceneAt(cursor).io.find(io => io.id === 'stdin')?.consumedText ?? null).toBe(current?.type === 'INPUT_READ' ? current.text : null)
      for (const io of sceneAt(cursor).io) expect(io.evidence.eventIds.every(id => applied.some(event => event.eventId === id))).toBe(true)
    }
    // Captured inputs contain no separators. Never fabricate line breaks.
    expect(sceneAt(trace.events.length).io).toMatchObject([
      { id: 'stdin', lines: 1, preview: '-742130' }, { id: 'stdout', lines: 4, preview: '142' },
    ])
    expect(trace.events.filter(event => event.type === 'INPUT_READ')).toHaveLength(3)
    expect(trace.events.filter(event => event.type === 'OUTPUT_WRITE')).toHaveLength(4)
  })

  it('does not turn submitted console bytes into consumed input geometry', () => {
    const submitted: TraceDocument = { ...trace, schemaVersion: 2, events: [...trace.events.slice(0, firstInput), {
      type: 'CONSOLE_INPUT', eventId: 'unit/submitted-only', seq: firstInput, source: null,
      label: 'Submitted bytes', importance: 'normal', frameId: null, text: '99\n',
    }] }
    expect(seek(submitted, submitted.events.length).console.at(-1)?.text).toBe('99\n')
    expect(projectTrace(submitted).project(submitted.events.length).io).toEqual([])
  })

  it('retains all seven explicit I/O transitions while drawing no graphless provenance Flow', () => {
    const transitions = transitionsForTrace(trace), catalog = createFlowCatalog()
    const ioEvents = trace.events.filter(event => event.type === 'INPUT_READ' || event.type === 'OUTPUT_WRITE')
    expect(ioEvents).toHaveLength(7)
    for (const event of ioEvents) {
      if (event.type !== 'INPUT_READ' && event.type !== 'OUTPUT_WRITE') throw new Error('Expected I/O event')
      const scene = sceneAt(event.seq + 1), transition = transitions.find(item => item.seq === event.seq)!
      expect(transition).toBeDefined()
      expect(transitionIsFlow(transition)).toBe(true) // Preserved semantic transition classifier, not a graph record.
      expect(transition.evidence).toBe('observed')
      const channel = scene.io.find(io => io.id === (event.type === 'INPUT_READ' ? 'stdin' : 'stdout'))!
      const slotId = event.type === 'INPUT_READ' ? event.destinationSlotId : event.originSlotId!
      expect(channel).toBeDefined()
      expect(transition.from).toEqual({ kind: event.type === 'INPUT_READ' ? 'io' : 'slot', id: event.type === 'INPUT_READ' ? channel.id : slotId })
      expect(transition.to).toEqual({ kind: event.type === 'INPUT_READ' ? 'slot' : 'io', id: event.type === 'INPUT_READ' ? slotId : channel.id })
      const frame = scene.entities[event.frameId]
      if (frame.kind !== 'frame') throw new Error('Expected frame')
      expect(frame.rows.some(row => row.slotId === slotId)).toBe(true)
      const plan = planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: true, scope: 'current' } })
      expect(plan.curves.filter(curve => curve.kind === 'flow')).toEqual([])
      expect(plan.flowPresentation.counts.recorded).toBe(0)
      expect(catalog.recordedProvenanceOf(slotId, scene.cursor)).toEqual([])
    }
  })

  it('keeps channel solids and ports fixed through forward, reverse and out-of-order scrubbing', () => {
    const end = sceneAt(trace.events.length), anchors = new Map(end.io.map(io => [io.id, io.anchor]))
    const reserved = JSON.stringify(projection.layout)
    const cursors = [trace.events.length, firstInput + 1, firstOutput + 1, 0,
      ...trace.events.map((_, index) => index + 1), ...trace.events.map((_, index) => trace.events.length - index)]
    for (const cursor of cursors) for (const io of sceneAt(cursor).io) {
      expect(io.anchor).toBe(anchors.get(io.id))
      expect(io.anchor.position).toEqual(anchors.get(io.id)!.position)
      expect(io.anchor.bodyPort).toEqual(anchors.get(io.id)!.bodyPort)
    }
    const input = anchors.get('stdin')!, output = anchors.get('stdout')!
    expect(input.position.some((value, axis) => Math.abs(value - output.position[axis]) > (input.size[axis] + output.size[axis]) / 2)).toBe(true)
    expect(JSON.stringify(projection.layout)).toBe(reserved)
    expect(sceneAt(0).io).toEqual([])
  })

  it('keeps recorded GraphIO authoritative, prefix-gated, and omits only an actually absent channel anchor', () => {
    // Explicit normalized unit facts, not a JVM capture. Actual reducer and
    // registered event IDs replace the former fabricated graph observations.
    const prefix = trace.events.slice(0, firstOutput + 1), context: ExecutionSite = {
      owner: 'unit.IO', name: 'run', descriptor: '()V', frameId: null, site: null, rawSeq: 1, source: null,
    }
    const facts: ExecutionFact[] = [
      { kind: 'io', channel: 'stdin', text: 'unconsumed bytes', context },
      { kind: 'call', callId: 'unit/read', declared: { owner: 'unit.Reader', name: 'read', descriptor: '()I' }, invokeKind: 'static', receiver: null, arguments: [], argumentOrigins: [], receiverOrigin: { kind: 'unknown' }, context },
      { kind: 'call-return', callId: 'unit/read', value: { kind: 'primitive', javaType: 'int', value: 7 }, inputText: '7', context },
      { kind: 'io', channel: 'stdout', text: 'graph output\n', context },
      { kind: 'file', operation: 'read', path: '/unit/input', text: 'file contents', context },
    ]
    const events: TraceEvent[] = [...prefix, ...facts.map((fact, index): TraceEvent => ({ type: 'EXECUTION_FACT', fact, seq: prefix.length + index,
      eventId: `unit/fact/${index}`, source: null, label: 'Recorded unit fact', importance: 'normal' }))]
    const recorded: TraceDocument = { ...trace, schemaVersion: 2, events }, current = projectTrace(recorded)
    expect(current.project(prefix.length).io).toHaveLength(2)
    expect(current.project(prefix.length + 1).io).toEqual([]) // Graph authority begins; submitted bytes are not consumption.
    expect(current.project(prefix.length + 2).io).toEqual([])
    expect(current.project(prefix.length + 3).io).toMatchObject([{ id: 'stdin', lines: 1, preview: '7', consumedText: '7' }])
    const scene = current.project(events.length)
    expect(scene.io).toHaveLength(2)
    expect(scene.io).toMatchObject([{ id: 'stdin', lines: 1, preview: '7' }, { id: 'stdout', lines: 1, preview: 'graph output' }])
    for (const io of scene.io) expect(io.anchor).toBe(current.layout.anchors[io.id])
    const withoutInput = { ...current.layout, anchors: { ...current.layout.anchors } }
    delete withoutInput.anchors.stdin
    const missing = createSceneProjector(recorded).project(seek(recorded, events.length), withoutInput, {
      sessionEnded: false, pausedAtLiveHead: false, liveHead: events.length, recording: scene.recording,
    })
    expect(missing.io.map(io => io.id)).toEqual(['stdout'])
    expect(missing.io[0].anchor).toBe(scene.io[1].anchor)
  })
})
