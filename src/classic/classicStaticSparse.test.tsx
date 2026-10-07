import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Selection } from '../contracts/interaction'
import { arrayElementSlotId } from '../contracts/runtime'
import type { SceneArrayCell, SceneClassNode, SceneModel, SceneSlot, WorldAnchor } from '../contracts/world'
import { ClassicRuntime } from './ClassicRuntime'
import { buildClassicScene, relatedReference, selectedBounds } from './classicScene'

const arrayId = 'observed-array'
const heapId = 'heap:domain.Box:observation-with-a-long-actual-runtime-identity'
const classId = 'class:domain.Registry'
const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
function anchor(id: string, region: WorldAnchor['region'], position: WorldAnchor['position']): WorldAnchor {
  return { entityId: id, region, position, size: [3.8, 4.1, 1.7], ports: {}, bodyPort: [position[0] + 1.66, position[1], position[2] + 0.905] }
}
function cell(index: number, ordinal: number, value: SceneSlot['value'] = int(index)): SceneArrayCell {
  const id = arrayElementSlotId(arrayId, index)
  const reserved = anchor(id, 'heap', [4.6 + ordinal % 4, -Math.floor(ordinal / 4), -Math.floor(ordinal / 16) * 2])
  return { id, name: `[${index}]`, index, javaType: value.kind === 'reference' ? value.javaType : 'int', value, anchor: reserved, port: reserved.bodyPort }
}
function observedScene(indices = [0, 1, 2, 750000, 999999]): SceneModel {
  const storage = anchor(classId, 'class', [4.6, 3.3, -0.85])
  const fields: SceneSlot[] = [
    { id: 'static:counter', name: 'counter', javaType: 'int', value: int(7), port: [6.26, 4.28, 0.055] },
    { id: 'static:entries', name: 'entries', javaType: 'domain.Box[]', value: { kind: 'reference', javaType: 'domain.Box[]', objectId: arrayId }, port: [6.26, 3.76, 0.055] },
    { id: 'static:unknown', name: 'unknown', javaType: 'int', value: { kind: 'unavailable', javaType: 'int', reason: 'not observed' }, port: [6.26, 3.24, 0.055] },
  ]
  storage.ports = Object.fromEntries(fields.map(field => [field.id, field.port]))
  return { layoutKind: 'spatial2', activeEventId: null, detailLevel: 'meso', frames: [],
    classes: [{ kind: 'class', id: classId, className: 'domain.Registry', label: 'domain.Registry', initialization: 'observed', anchor: storage, fields }],
    objects: [
      { kind: 'object', id: arrayId, className: 'domain.Box[]', displayId: 12, label: 'Box[] #12', fields: [], anchor: anchor(arrayId, 'heap', [4.6, 0, -0.85]),
        array: { elementType: 'domain.Box', length: 1000000, cells: indices.map((index, ordinal) => cell(index, ordinal,
          index === 750000 ? { kind: 'reference', javaType: 'domain.Box', objectId: heapId } : int(index))) } },
      { kind: 'object', id: heapId, className: 'domain.Box', displayId: 77, label: 'Box #77', fields: [], anchor: anchor(heapId, 'heap', [30, 0, -0.85]) },
    ],
    references: [{ id: 'static-reference', source: { kind: 'class', classId, slotId: 'static:entries' }, targetObjectId: arrayId, from: fields[1].port, to: [4.6, 0, 0] },
      ...(indices.includes(750000) ? [{ id: 'cell-reference', source: { kind: 'object' as const, objectId: arrayId, slotId: arrayElementSlotId(arrayId, 750000) }, targetObjectId: heapId, from: [4.6, 0, 0] as const, to: [30, 0, 0] as const }] : [])],
  }
}
function render(scene: SceneModel, selection: Selection = null, visible = true) {
  return renderToStaticMarkup(createElement(ClassicRuntime, { scene, selection, visible, event: null, guided: false, onSelect: () => {}, onFocusSelected: () => {} }))
}
const classNode = (scene: SceneModel): SceneClassNode => scene.classes![0]

describe('Classic class storage', () => {
  it('projects actual class identities and static values without creating an object instance', () => {
    const scene = observedScene(), original = JSON.stringify(scene), diagram = buildClassicScene(scene)
    const storage = diagram.entities.find(entity => entity.id === classId)!
    expect(storage.kind).toBe('class')
    expect(storage.initialization).toBe('observed')
    expect(storage.label).toBe(classNode(scene).label)
    expect(storage.slots.map(row => [row.slot.id, row.value])).toEqual([
      ['static:counter', '7'], ['static:entries', `→ ${arrayId}`], ['static:unknown', 'unavailable (not observed)'],
    ])
    expect(diagram.entities.filter(entity => entity.kind === 'object').map(entity => entity.id)).toEqual(scene.objects.map(object => object.id))
    expect(JSON.stringify(scene)).toBe(original)
    expect(buildClassicScene({ ...scene, classes: undefined }).entities.some(entity => entity.kind === 'class')).toBe(false)
  })

  it('connects static references to the exact class field and heap identity', () => {
    const diagram = buildClassicScene(observedScene())
    const storage = diagram.entities.find(entity => entity.id === classId)!
    const row = storage.slots.find(row => row.slot.id === 'static:entries')!
    const array = diagram.entities.find(entity => entity.id === arrayId)!
    const edge = diagram.references.find(edge => edge.id === 'static-reference')!
    expect(edge.sourceEntityId).toBe(classId)
    expect(edge.sourceSlotId).toBe(row.slot.id)
    expect(edge.targetObjectId).toBe(arrayId)
    expect(edge.from).toEqual([row.rect.x, row.rect.y + row.rect.height / 2])
    expect(edge.to).toEqual([array.rect.x + array.rect.width, array.rect.y + 76])
    expect(relatedReference(edge, { kind: 'class', id: classId }, diagram)).toBe(true)
    expect(relatedReference(edge, { kind: 'slot', id: row.slot.id }, diagram)).toBe(true)
    expect(array.array!.name).toBe('entries')
    expect(selectedBounds(diagram, { kind: 'class', id: classId })).toEqual(storage.rect)
    expect(selectedBounds(diagram, { kind: 'slot', id: row.slot.id })).toEqual(row.rect)
  })

  it('preserves stack/heap rectangles and reserved static rows when classes enter or observations retire', () => {
    const scene = observedScene()
    scene.frames.push({ kind: 'frame', id: 'observed-call', label: 'load()', depth: 0, active: true,
      anchor: anchor('observed-call', 'stack', [-5.6, 1.3, 0]), slots: [] })
    const before = buildClassicScene(scene)
    const without = buildClassicScene({ ...scene, classes: [] })
    for (const entity of without.entities) expect(entity.rect).toEqual(before.entities.find(candidate => candidate.id === entity.id)!.rect)
    const storage = before.entities.find(entity => entity.id === classId)!
    classNode(scene).fields = classNode(scene).fields.slice(1).reverse()
    const after = buildClassicScene(scene).entities.find(entity => entity.id === classId)!
    expect(after.rect).toEqual(storage.rect)
    for (const row of after.slots) expect(row.rect).toEqual(storage.slots.find(candidate => candidate.slot.id === row.slot.id)!.rect)
    classNode(scene).initialization = 'completed'
    expect(buildClassicScene(scene).entities.find(entity => entity.id === classId)!.rect).toEqual(storage.rect)
  })

  it('uses class selection, static headings and accessible full values; hidden views mount no class targets', () => {
    const scene = observedScene(), markup = render(scene, { kind: 'class', id: classId })
    expect(markup).toContain(`data-runtime-id="${classId}" data-runtime-kind="class"`)
    expect(markup).toContain('CLASS STATE · STATIC FIELDS')
    expect(markup).toContain('Class state domain.Registry, initialization observed')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('domain.Registry entries, domain.Box[], → observed-array')
    expect(markup).not.toContain('Heap object domain.Registry')
    expect(render(scene, { kind: 'object', id: classId })).not.toContain('aria-pressed="true"')
    expect(render(scene, null, false)).not.toContain('data-runtime-id=')
    expect(render(scene, null, false)).not.toContain('tabindex="0"')
    classNode(scene).fields = []
    expect(render(scene)).toContain('No observed static fields')
    expect(render(scene)).not.toContain('data-slot-id="static:entries"')
  })
})

describe('Classic bounded sparse and reference arrays', () => {
  it('keeps readable cell dimensions independent of declared length and uses actual sparse indices', () => {
    const scene = observedScene(), original = JSON.stringify(scene)
    const array = buildClassicScene(scene).entities.find(entity => entity.id === arrayId)!
    expect(array.array!.cells.map(cell => cell.index)).toEqual([0, 1, 2, 750000, 999999])
    expect(array.array!.observedCount).toBe(5)
    expect(array.array!.omittedCount).toBe(0)
    expect(array.array!.ascending).toBe(false)
    for (const cell of array.array!.cells) {
      expect(cell.rect.width).toBeGreaterThanOrEqual(72)
      expect(cell.rect.height).toBe(72)
      expect(cell.rect.x).toBeGreaterThanOrEqual(array.rect.x)
      expect(cell.rect.x + cell.rect.width).toBeLessThanOrEqual(array.rect.x + array.rect.width)
      expect(cell.rect.y).toBeGreaterThanOrEqual(array.rect.y + 64)
      expect(cell.rect.y + cell.rect.height).toBeLessThan(array.rect.y + array.rect.height)
    }
    expect(JSON.stringify(scene)).toBe(original)
    scene.objects[0].array!.length = 2000000
    const expanded = buildClassicScene(scene).entities.find(entity => entity.id === arrayId)!
    expect(expanded.rect).toEqual(array.rect)
    expect(expanded.array!.cells.map(cell => cell.rect)).toEqual(array.array!.cells.map(cell => cell.rect))
  })

  it('retains coordinates through value updates, reordered observations and late sparse append', () => {
    const scene = observedScene([0, 999999]), before = buildClassicScene(scene).entities[0]
    scene.objects[0].array!.cells.reverse()
    scene.objects[0].array!.cells[0] = { ...scene.objects[0].array!.cells[0], value: int(42) }
    scene.objects[0].array!.cells.push(cell(100, 2))
    const after = buildClassicScene(scene).entities[0]
    for (const reserved of before.array!.cells) expect(after.array!.cells.find(cell => cell.slot.id === reserved.slot.id)!.rect).toEqual(reserved.rect)
    expect(after.array!.cells.map(cell => cell.index)).toEqual([0, 999999, 100])
    expect(after.array!.cells.find(cell => cell.index === 999999)!.value).toBe('42')
  })

  it('caps the grid, counts omitted observations, and retains a selected cell outside the prefix', () => {
    const scene = observedScene(Array.from({ length: 40 }, (_, index) => index * 100))
    const selected = arrayElementSlotId(arrayId, 3900)
    const diagram = buildClassicScene(scene, null, { kind: 'slot', id: selected })
    const array = diagram.entities.find(entity => entity.id === arrayId)!
    expect(array.array!.cells).toHaveLength(16)
    expect(array.array!.observedCount).toBe(40)
    expect(array.array!.omittedCount).toBe(24)
    expect(array.rect.height).toBeLessThanOrEqual(408)
    const selectedCell = array.array!.cells.find(cell => cell.slot.id === selected)!
    expect(selectedCell.index).toBe(3900)
    expect(selectedBounds(diagram, { kind: 'slot', id: selected })).toEqual(selectedCell.rect)
    const markup = render(scene, { kind: 'slot', id: selected })
    expect(markup.match(/data-array-index=/g)).toHaveLength(16)
    expect(markup).toContain(`data-array-selection="${selected}"`)
    expect(markup).toContain('16 of 40 observed · +24 · Inspector')
    expect(scene.objects[0].array!.cells).toHaveLength(40)
  })

  it('attaches reference-array edges to actual cells and preserves full long identities outside the bounded text', () => {
    const scene = observedScene(), diagram = buildClassicScene(scene)
    const array = diagram.entities.find(entity => entity.id === arrayId)!
    const row = array.array!.cells.find(cell => cell.index === 750000)!
    const edge = diagram.references.find(edge => edge.id === 'cell-reference')!
    expect(edge.sourceEntityId).toBe(arrayId)
    expect(edge.sourceSlotId).toBe(row.slot.id)
    expect(edge.from).toEqual([row.rect.x + row.rect.width, row.rect.y + row.rect.height / 2])
    expect(edge.targetObjectId).toBe(heapId)
    const gutterPoints = [...edge.path.matchAll(/L ([\d.-]+) ([\d.-]+)/g)].map(match => [Number(match[1]), Number(match[2])])
    expect(gutterPoints.length).toBeGreaterThan(0)
    for (const [x, y] of gutterPoints) for (const cell of array.array!.cells) {
      expect(x > cell.rect.x + 1 && x < cell.rect.x + cell.rect.width - 1 && y > cell.rect.y + 1 && y < cell.rect.y + cell.rect.height - 1).toBe(false)
    }
    expect(relatedReference(edge, { kind: 'slot', id: row.slot.id }, diagram)).toBe(true)
    const markup = render(scene, { kind: 'slot', id: row.slot.id })
    expect(markup).toContain(`value → ${heapId}`)
    expect(markup).toContain(`<title>Index 750000, domain.Box, → ${heapId}</title>`)
    expect(markup).toContain('…</text>')
    expect(markup).toContain('font-size="16"')
    expect(markup).toContain('index 999999, int, value 999999')
    expect(markup).not.toContain('Ascending order verified')
  })

  it('retains selected reference sources and current proven sparse write endpoints within the budget', () => {
    const scene = observedScene(Array.from({ length: 40 }, (_, index) => index))
    const slotId = arrayElementSlotId(arrayId, 39)
    const referenceCell = scene.objects[0].array!.cells.find(cell => cell.id === slotId)!
    referenceCell.value = { kind: 'reference', javaType: 'domain.Box', objectId: heapId }
    referenceCell.javaType = 'domain.Box'
    scene.references.push({ id: 'late-reference', source: { kind: 'object', objectId: arrayId, slotId }, targetObjectId: heapId, from: [0, 0, 0], to: [1, 0, 0] })
    const selected = buildClassicScene(scene, null, { kind: 'reference', id: 'late-reference' })
    expect(selected.references.some(edge => edge.id === 'late-reference' && edge.sourceSlotId === slotId)).toBe(true)
    const writing = observedScene(Array.from({ length: 40 }, (_, index) => index))
    writing.activeEventId = 'write'
    writing.objects[0].array!.cells.find(cell => cell.index === 39)!.value = int(38)
    writing.arrayMutations = [{ eventId: 'write', objectId: arrayId, index: 39, before: int(39), after: int(38), from: { kind: 'element', index: 38 } }]
    const changed = buildClassicScene(writing)
    expect(changed.arrayWrites).toHaveLength(1)
    expect(changed.arrayWrites[0].slotId).toBe(slotId)
    expect(changed.arrayWrites[0].sourceSlotId).toBe(arrayElementSlotId(arrayId, 38))
    expect(changed.entities.find(entity => entity.id === arrayId)!.array!.cells).toHaveLength(16)
  })

  it('keeps existing small curated arrays in their original index bands', () => {
    const scene = observedScene([0, 1, 2, 3, 4])
    scene.layoutKind = 'array'
    scene.objects[0].array!.length = 5
    const array = buildClassicScene(scene).entities.find(entity => entity.id === arrayId)!
    expect(array.rect).toEqual({ x: 600, y: 238, width: 330, height: 160 })
    expect(array.array!.grid).toBe(false)
    expect(array.array!.cells.map(cell => cell.rect)).toEqual(Array.from({ length: 5 }, (_, index) => ({ x: 600 + index * 66, y: 302, width: 66, height: 72 })))
    expect(render(scene)).toContain('Equal cells · fixed indices')
  })

  it('retains current sparse read destinations and drops stale activity without inventing cells', () => {
    const scene = observedScene(Array.from({ length: 40 }, (_, index) => index))
    scene.activeEventId = 'read'
    scene.arrayActivity = { kind: 'read', eventId: 'read', objectId: arrayId, index: 39, value: int(39) }
    const current = buildClassicScene(scene)
    expect(current.arrayActivity!.slotIds).toEqual([arrayElementSlotId(arrayId, 39)])
    expect(current.arrayActivity!.label).toBe('Read entries[39] = 39')
    scene.activeEventId = 'next'
    const stale = buildClassicScene(scene)
    expect(stale.arrayActivity).toBeNull()
    expect(stale.entities.find(entity => entity.id === arrayId)!.array!.cells.some(cell => cell.index === 39)).toBe(false)
    scene.activeEventId = 'read'
    scene.arrayActivity = { kind: 'read', eventId: 'read', objectId: arrayId, index: 999999, value: int(999999) }
    const unavailable = buildClassicScene(scene)
    expect(unavailable.arrayActivity).toBeNull()
    expect(unavailable.entities.find(entity => entity.id === arrayId)!.array!.cells.some(cell => cell.index === 999999)).toBe(false)
  })

  it('does not infer sorted completion from ascending sparse values', () => {
    const scene = observedScene([100, 900])
    expect(buildClassicScene(scene).entities.find(entity => entity.id === arrayId)!.array!.ascending).toBe(false)
  })
})
