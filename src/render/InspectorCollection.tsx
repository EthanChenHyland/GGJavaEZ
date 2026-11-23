import type { RuntimeObject } from '../contracts/runtime'
import type { SceneCollection, ValueText } from '../contracts/world'
import { VirtualList } from '../shell/VirtualList'
import { collectionFaceSummary } from '../world/collectionFace'
import type { InspectorRow } from './inspection'

export function InspectorCollection({ node, object, visibleCount, selectedSlot, onInspect }: {
  node: SceneCollection
  object?: RuntimeObject
  visibleCount: number
  selectedSlot: string | null
  onInspect(row: InspectorRow): void
}) {
  const { hidden, unrecorded } = collectionFaceSummary(node, visibleCount)
  const library = object?.library
  const observation = node.evidence.kind === 'unavailable' ? 'UNAVAILABLE'
    : library?.truncated ? 'TRUNCATED'
    : unrecorded > 0 ? 'PARTIALLY OBSERVED' : 'OBSERVED'
  const reason = library?.reason ?? (observation === 'UNAVAILABLE' ? node.evidence.unavailableReason : undefined)
  const selectedIndex = selectedSlot === null ? -1 : node.entries.findIndex(entry => entry.slotId === selectedSlot || entry.keySlotId === selectedSlot)
  const concreteType = object?.metadata?.runtimeType ?? object?.className ?? node.title

  return <section className="inspector-collection" aria-label="Collection observation">
    <p className="inspector-collection-type">{concreteType} · {node.collectionKind}</p>
    <p>Membership · {observation}
      {hidden > 0 && ` · ${hidden} recorded members hidden on face`}
    </p>
    {reason && <p>{reason}</p>}
    {node.entries.length > 0 && <VirtualList key={selectedSlot ?? node.id} className="inspector-collection-members"
      count={node.entries.length} initialIndex={Math.max(0, selectedIndex)} rowHeight={48} label="Recorded collection members">
      {index => {
        const entry = node.entries[index]
        const isMap = node.collectionKind === 'Map'
        const name = `${isMap ? 'Entry' : 'Member'} ${index + 1}`
        const button = (slotId: string, value: ValueText, part?: 'key' | 'value') => {
          const label = part ? `${name} ${part}` : name
          return <button aria-label={`Inspect ${label}`} aria-current={selectedSlot === slotId ? 'true' : undefined}
            title={`${value.observation}${value.reason ? ` · ${value.reason}` : ''}`}
            onClick={() => onInspect({ slotId, name: label, type: value.kind === 'reference' ? value.targetType : '', value })}>
            {value.text}
          </button>
        }
        return <div className="inspector-collection-member">
          <span title={entry.slotId}>{index + 1}</span>
          {entry.key && entry.keySlotId && <>{button(entry.keySlotId, entry.key, 'key')}<span aria-hidden="true">→</span></>}
          {button(entry.slotId, entry.value, isMap ? 'value' : undefined)}
        </div>
      }}
    </VirtualList>}
  </section>
}
