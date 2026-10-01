import type { TraceDocument } from '../contracts/runtime'
import type { LayoutState } from '../contracts/world'
import { createCuratedLayout } from '../examples/curatedLayout'
import { createScopedLayout } from '../examples/scopedLayout'
import { createLayout } from '../world/layout'

/**
 * The single composition seam between generic Spatial layout and curated examples
 * (spec task 0.1, INV-15). Selection rules are exactly the pre-Phase-0 `createLayout`
 * rules, verified by layoutGolden.test.ts:
 *   - curated scope events use the curated scoped layout (audit D1: latent block);
 *   - JVM captures use the generic layout;
 *   - everything else (curated /examples traces) uses the curated layout.
 */
export function layoutForTrace(trace: TraceDocument): LayoutState {
  if (trace.events.some((event) => event.type === 'ENTER_SCOPE')) return createScopedLayout(trace)
  if (trace.capture?.origin === 'jvm') return createLayout(trace)
  return createCuratedLayout(trace)
}
