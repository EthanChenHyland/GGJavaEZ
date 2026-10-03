import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import type { LayoutState } from '../contracts/world'
import { createCuratedLayout } from '../examples/curatedLayout'
import { createScopedLayout } from '../examples/scopedLayout'
import { createLayoutBuilder } from '../world/layout'

type LayoutCache = {
  count: number
  first: TraceEvent | undefined
  last: TraceEvent | undefined
  origin: NonNullable<TraceDocument['capture']>['origin'] | undefined
  hasScopes: boolean
  builder: ReturnType<typeof createLayoutBuilder>
  state: LayoutState | undefined
}
const layouts = new WeakMap<TraceDocument, LayoutCache>()

/**
 * The single composition seam between generic Spatial layout and curated examples
 * (spec task 0.1, INV-15). Selection rules preserve the pre-Phase-0 batch output:
 * scope events select the existing scoped layout, JVM captures use generic layout,
 * and all other traces use curated layout. Only the JVM builder advances by delta.
 * Immutable events and stable trace identity are the append-only cache contract.
 */
export function layoutForTrace(trace: TraceDocument): LayoutState {
  let cache = layouts.get(trace)
  const origin = trace.capture?.origin
  if (!cache || cache.origin !== origin || cache.count > trace.events.length ||
    (cache.count > 0 && (trace.events[0] !== cache.first || trace.events[cache.count - 1] !== cache.last))) {
    cache = { count: 0, first: undefined, last: undefined, origin, hasScopes: false,
      builder: createLayoutBuilder(), state: undefined }
    layouts.set(trace, cache)
  }
  if (cache.state && cache.count === trace.events.length) return cache.state
  for (let index = cache.count; index < trace.events.length; index++) {
    if (trace.events[index].type === 'ENTER_SCOPE') { cache.hasScopes = true; break }
  }
  if (cache.hasScopes) cache.state = createScopedLayout(trace)
  else if (origin === 'jvm') {
    cache.builder.append(trace.events, cache.count)
    cache.state = cache.builder.state
  } else cache.state = createCuratedLayout(trace)
  cache.count = trace.events.length
  cache.first = trace.events[0]
  cache.last = trace.events[cache.count - 1]
  return cache.state
}
