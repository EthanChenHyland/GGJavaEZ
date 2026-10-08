import { describe, expect, it } from 'vitest'
import type { ConsoleEntry } from '../contracts/runtime'
import type { ExecutionGraph, ExecutionSite } from '../contracts/executionGraph'
import { emptyExecutionGraph } from '../runtime/executionGraph'
import { applyEvent, createInitialState } from '../runtime/state'
import { consoleIoSummaries, graphIoSummaries } from './ioSummary'

const context: ExecutionSite = { owner: 'Audit', name: 'main', descriptor: '()V', frameId: null, site: 0, rawSeq: 0, source: null }
function output(graph: ExecutionGraph, index: number, channel: 'stdout' | 'stderr' = 'stdout') {
  return applyEvent({ ...createInitialState(), cursor: 1, status: 'running', executionGraph: graph }, { type: 'EXECUTION_FACT', fact: { kind: 'io', channel, text: `line ${index}\n`, context }, eventId: `event:${index}`, seq: 1, source: null, label: 'Output', importance: 'quiet' }).executionGraph!
}
const entry = (index: number, kind: ConsoleEntry['kind'] = 'output'): ConsoleEntry => ({ eventId: `event:${index}`, frameId: null, source: null, kind,
  text: `line ${index}\n`, value: { kind: 'primitive', javaType: 'int', value: index } })

describe('immutable I/O presentation summaries', () => {
  it('extends actual graph output edges, keeps earlier roots immutable and replays backward and across sessions', () => {
    const empty = emptyExecutionGraph(), first = output(empty, 1), second = output(first, 2, 'stderr'), third = output(second, 3)
    const initial = graphIoSummaries(first)
    expect([...initial]).toEqual([['stdout', { observations: 1, preview: 'line 1' }]])
    expect([...graphIoSummaries(second)]).toEqual([['stdout', { observations: 1, preview: 'line 1' }], ['stderr', { observations: 1, preview: 'line 2' }]])
    expect(graphIoSummaries(third).get('stdout')).toEqual({ observations: 2, preview: 'line 3' })
    expect(graphIoSummaries(first)).toBe(initial)
    expect(initial.get('stdout')).toEqual({ observations: 1, preview: 'line 1' })
    const other = output(emptyExecutionGraph(), 50)
    expect(graphIoSummaries(other).get('stdout')).toEqual({ observations: 1, preview: 'line 50' })
    expect(graphIoSummaries(empty).size).toBe(0)
    expect(graphIoSummaries(third).get('stdout')?.observations).toBe(2)
  })

  it('visits only newly recorded I/O when an immutable output prefix grows', () => {
    let graph = emptyExecutionGraph(), reads = 0, summaryReads = 0
    for (let index = 0; index < 1000; index++) {
      graph = output(graph, index)
      const io = graph.io, counted = new Proxy(io, { get(target, key, receiver) { if (typeof key === 'string' && key in target) reads++; return Reflect.get(target, key, receiver) } })
      graph = { ...graph, io: counted }
      const before = reads
      expect(graphIoSummaries(graph).get('stdout')?.observations).toBe(index + 1)
      summaryReads += reads - before
    }
    // A full map scan for every prefix would read 500,500 observations.
    expect(summaryReads).toBe(1000)
  })

  it('excludes submitted bytes and files while including consumed input and preserves whole Unicode preview codepoints', () => {
    const io: ExecutionGraph['io'] = {
      bytes: { id: 'bytes', kind: 'input-bytes', channel: 'stdin', text: 'unconsumed', eventId: 'b', context },
      consumed: { id: 'consumed', kind: 'input-consume', channel: 'stdin', text: '🟣'.repeat(45), eventId: 'c', context },
      file: { id: 'file', kind: 'file', channel: 'file', text: 'file', eventId: 'f', context },
    }
    const summary = graphIoSummaries({ ...emptyExecutionGraph(), io })
    expect([...summary]).toEqual([['stdin', { observations: 1, preview: '🟣'.repeat(40) }]])
  })

  it('handles graphless prefixes, input consumption, branches, cold roots and unchanged records', () => {
    const first = [entry(1)], second = [...first, entry(2)], branch = [...first, entry(3)]
    const initial = consoleIoSummaries(first)
    expect(consoleIoSummaries(second).get('stdout')?.observations).toBe(2)
    expect(consoleIoSummaries(branch).get('stdout')).toEqual({ observations: 2, preview: 'line 3' })
    expect(initial.get('stdout')).toEqual({ observations: 1, preview: 'line 1' })
    expect(consoleIoSummaries(first)).toBe(initial)
    const input = entry(4, 'input'), consumed = { ...entry(5, 'input'), destinationSlotId: 'answer' }
    expect(consoleIoSummaries([...branch, input, consumed]).get('stdin')).toEqual({ observations: 1, preview: 'line 5' })
    expect(consoleIoSummaries([]).size).toBe(0)
    expect(consoleIoSummaries([entry(90)]).get('stdout')).toEqual({ observations: 1, preview: 'line 90' })
  })
})
