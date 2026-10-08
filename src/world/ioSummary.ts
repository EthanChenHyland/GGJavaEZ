import type { ExecutionGraph, GraphIO } from '../contracts/executionGraph'
import type { RuntimeState } from '../contracts/runtime'

type Channel = 'stdin' | 'stdout' | 'stderr'
export type IoSummaries = Map<Channel, { observations: number; preview: string }>
const graphCache = new WeakMap<ExecutionGraph['io'], IoSummaries>()
const consoleCache = new WeakMap<RuntimeState['console'], IoSummaries>()
// A presentation accelerator must not keep a departed execution alive.
let previousGraph: WeakRef<ExecutionGraph> | undefined
let previousConsole: WeakRef<RuntimeState['console']> | undefined

function add(summaries: IoSummaries, channel: Channel, text: string) {
  summaries.set(channel, { observations: (summaries.get(channel)?.observations ?? 0) + 1,
    preview: Array.from(text.trim()).slice(0, 40).join('') })
}
function addObservation(summaries: IoSummaries, observation: GraphIO | undefined) {
  if (!observation || observation.channel === 'file' || observation.kind !== 'input-consume' && observation.kind !== 'output') return
  add(summaries, observation.channel, observation.text)
}

/** Exact immutable prefixes share their edge boundary by identity. Only new
 * recorded I/O edges extend a summary; unrelated values are never inferred.
 * Cold imports, backward seeks and different sessions fall back to their own
 * immutable I/O records. Cached summaries are never mutated after publication. */
export function graphIoSummaries(graph: ExecutionGraph): IoSummaries {
  let summaries = graphCache.get(graph.io)
  if (!summaries) {
    const prior = previousGraph?.deref()
    const cached = prior && graphCache.get(prior.io)
    const boundary = prior?.edges.length ?? 0
    if (cached && boundary > 0 && graph.edges.length >= boundary && graph.edges[boundary - 1] === prior!.edges[boundary - 1]) {
      summaries = new Map(cached)
      for (let index = boundary; index < graph.edges.length; index++) {
        const edge = graph.edges[index]
        if (edge.kind === 'OUTPUT') addObservation(summaries, graph.io[edge.to])
        else if (edge.kind === 'INPUT_CONSUME') addObservation(summaries, graph.io[edge.from])
      }
    } else {
      summaries = new Map()
      for (const observation of Object.values(graph.io)) addObservation(summaries, observation)
    }
    graphCache.set(graph.io, summaries)
  }
  previousGraph = new WeakRef(graph)
  return summaries
}

export function consoleIoSummaries(entries: RuntimeState['console']): IoSummaries {
  let summaries = consoleCache.get(entries)
  if (!summaries) {
    const prior = previousConsole?.deref()
    const cached = prior && consoleCache.get(prior)
    const boundary = prior?.length ?? 0
    const extendsPrior = cached && entries.length >= boundary && (boundary === 0 || entries[boundary - 1] === prior![boundary - 1])
    summaries = extendsPrior ? new Map(cached) : new Map()
    for (let index = extendsPrior ? boundary : 0; index < entries.length; index++) {
      const entry = entries[index]
      if (entry.kind === 'input' && !entry.destinationSlotId) continue
      add(summaries, entry.kind === 'input' ? 'stdin' : entry.channel ?? 'stdout', entry.text)
    }
    consoleCache.set(entries, summaries)
  }
  previousConsole = new WeakRef(entries)
  return summaries
}
