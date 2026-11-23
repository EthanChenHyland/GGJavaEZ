import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { RuntimeLibrarySummary, RuntimeObject, RuntimeValue } from '../contracts/runtime'
import { VirtualListRowLimit } from '../shell/VirtualList'
import { collectionSummary } from '../world/collectionSummary'
import { InspectorCollection } from './InspectorCollection'

const objectId = 'collection'
const keySlot = `${objectId}:summary:entry:0:key`
const primitive = (value: number): RuntimeValue => ({ kind: 'primitive', javaType: 'int', value })

function preview(className: string, library: RuntimeLibrarySummary, visibleCount: number, selectedSlot: string | null = null, observed = true) {
  const object: RuntimeObject = { id: objectId, className, displayId: 1, fields: {}, library, allocatedAt: 'allocation', observedAt: 'observation' }
  const node = collectionSummary(object, { entityId: objectId, position: [0, 5, 0], size: [5.2, 9.93, 2.3], bodyPort: [0, 5, 1.15], ports: {}, region: 'heap' },
    { cursor: 3, objects: {}, eventSeq: id => id === 'allocation' ? 1 : observed ? 2 : null })!
  return renderToStaticMarkup(<VirtualListRowLimit.Provider value={20}><InspectorCollection node={node} object={object}
    visibleCount={visibleCount} selectedSlot={selectedSlot} onInspect={() => {}}/></VirtualListRowLimit.Provider>)
}

it.each([
  ['LIST', 'ArrayList'], ['SET', 'HashSet'], ['DEQUE', 'ArrayDeque'], ['QUEUE', 'PriorityQueue'],
] as const)('keeps %s previews virtual and separates capture policy from hidden members', (kind, type) => {
  const html = preview(`java.util.${type}`, { kind, size: 1500, items: Array.from({ length: 32 }, (_, index) => primitive(index)), truncated: true, reason: 'Recorder member limit' }, 8)
  expect(html).toContain(`java.util.${type}`)
  expect(html).toContain('TRUNCATED · 24 recorded members hidden on face')
  expect(html).toContain('Recorder member limit')
  expect(html).toContain('aria-setsize="32"')
  expect(html).toContain('Inspect Member 1')
  expect(html).not.toContain('Inspect Member 32')
  expect(html).not.toContain('Inspect Member 33')
})

it('exposes Map keys and values separately, including a selected key and an unavailable value', () => {
  const html = preview('java.util.HashMap', { kind: 'MAP', size: 30, entries: [
    { key: primitive(23), value: { kind: 'unavailable', reason: 'Value capture failed' } },
  ] }, 1, keySlot)
  expect(html).toContain('PARTIALLY OBSERVED')
  expect(html).toContain('aria-label="Inspect Entry 1 key" aria-current="true" title="OBSERVED">23')
  expect(html).toContain('aria-label="Inspect Entry 1 value" title="UNAVAILABLE · Value capture failed">⟨not recorded⟩')
  expect(html).not.toContain('Inspect Entry 2')
})

it('distinguishes a captured empty collection from missing observation evidence', () => {
  const library = { kind: 'LIST' as const, size: 0, items: [] }
  const empty = preview('java.util.ArrayList', library, 0)
  const unavailable = preview('java.util.ArrayList', library, 0, null, false)
  expect(empty).toContain('Membership · OBSERVED')
  expect(unavailable).toContain('Membership · UNAVAILABLE')
  expect(unavailable).toContain('Collection observation event is not available')
  expect(empty).not.toContain('role="list"')
  expect(unavailable).not.toContain('role="list"')
})
