import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Selection } from '../contracts/interaction'
import { arrayElementSlotId, type ArrayActivity, type ArrayMutation, type TraceEvent } from '../contracts/runtime'
import type { SceneModel, SceneSlot, WorldAnchor } from '../contracts/world'
import { ClassicRuntime } from './ClassicRuntime'
import { buildClassicScene, relatedReference, selectedBounds } from './classicScene'
import { classicHomeView, focusClassicView } from './viewport'
import { seek } from '../runtime'
import { loadArrayTrace } from '../examples/traces'
import { layoutForTrace as createLayout } from '../app/layoutForTrace'
import { buildSceneModel } from '../world/sceneModel'

const objectId = 'array-23'
const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
const anchor = (id: string, region: WorldAnchor['region']): WorldAnchor => ({ entityId: id, region, position: [40, 12, -16], size: [5, 2, 1], ports: {}, bodyPort: [0, 0, 0] })
const local = (name: string, value: SceneSlot['value']): SceneSlot => ({ id: `main:${name}`, name, javaType: name === 'nums' ? 'int[]' : 'int', value, port: [0, 0, 0] })
function sceneAt(values = [3, 8, 1, 6, 2], activity: ArrayActivity | null = null, mutations: ArrayMutation[] = []): SceneModel {
  return {
    layoutKind: 'array', activeEventId: activity?.eventId ?? mutations.at(-1)?.eventId ?? 'allocated', detailLevel: 'meso',
    frames: [{ kind: 'frame', id: 'main', label: 'main()', depth: 0, active: true, anchor: anchor('main', 'stack'), slots: [
      { ...local('nums', { kind: 'reference', javaType: 'int[]', objectId }), displayValue: '→ #23' }, local('i', int(0)), local('j', int(1)), local('temp', int(8)),
    ] }],
    objects: [{ kind: 'object', id: objectId, label: 'int[] #23', className: 'int[]', displayId: 23, anchor: anchor(objectId, 'heap'), fields: [],
      array: { elementType: 'int', length: values.length, cells: values.map((value, index) => ({
        id: arrayElementSlotId(objectId, index), name: `[${index}]`, javaType: 'int', value: int(value), index, port: [index, 0, 0], anchor: anchor(arrayElementSlotId(objectId, index), 'heap'),
      })) } }],
    references: [{ id: 'ref:main:nums', source: { kind: 'frame', frameId: 'main', slotId: 'main:nums' }, targetObjectId: objectId, from: [0, 0, 0], to: [1, 0, 0] }],
    arrayActivity: activity, arrayMutations: mutations,
  }
}
const compare: ArrayActivity = { kind: 'compare', eventId: 'compare', objectId, indices: [1, 2], values: [int(8), int(1)], operator: '>', result: true }
const firstWrite: ArrayMutation = { eventId: 'write-one', objectId, index: 1, before: int(8), after: int(1), from: { kind: 'element', index: 2 } }
const secondWrite: ArrayMutation = { eventId: 'write-two', objectId, index: 2, before: int(1), after: int(8), from: { kind: 'slot', frameId: 'main', slotId: 'main:temp' } }
const event = (eventId: string): TraceEvent => ({ type: 'LINE_EXECUTE', frameId: 'main', eventId, seq: 0, label: eventId, source: null, importance: 'normal' })
const end: TraceEvent = { type: 'PROGRAM_END', eventId: 'end', seq: 0, label: 'Done', source: null, importance: 'major' }
function render(scene: SceneModel, currentEvent: TraceEvent | null = null, guided = true, playing = false, selection: Selection = null, visible = true) {
  return renderToStaticMarkup(createElement(ClassicRuntime, { scene, event: currentEvent, guided, playing, selection, visible, onSelect: () => {}, onFocusSelected: () => {} }))
}

describe('Classic arrays from shared semantic nodes', () => {
  it('projects equal indexed cells with heap identity and a live reference name', () => {
    const scene = sceneAt(), diagram = buildClassicScene(scene), array = diagram.entities.find((node) => node.id === objectId)!
    expect(array.label).toBe('int[] #23')
    expect(array.array!.name).toBe('nums')
    expect(array.rect).toEqual({ x: 600, y: 238, width: 330, height: 160 })
    expect(array.array!.cells.map((cell) => [cell.index, cell.value, cell.slot.id])).toEqual([3, 8, 1, 6, 2].map((value, index) => [index, String(value), arrayElementSlotId(objectId, index)]))
    expect(array.array!.cells.every((cell) => cell.rect.width === 66 && cell.rect.height === 72)).toBe(true)
    expect(diagram.references[0].label).toBe('nums')
    for (const node of diagram.entities) {
      expect(node.rect.y + node.rect.height).toBeLessThanOrEqual(560)
      for (const row of node.slots) expect(row.rect.y + row.rect.height).toBeLessThan(node.rect.y + node.rect.height)
    }
  })

  it('preserves cell coordinates and identity across writes, reverse seeks, and Theater anchors', () => {
    const snapshots = [sceneAt(), sceneAt([3, 1, 1, 6, 2], null, [firstWrite]), sceneAt([3, 1, 8, 6, 2], null, [firstWrite, secondWrite]), sceneAt([3, 1, 1, 6, 2], null, [firstWrite]), sceneAt()]
    const first = buildClassicScene(snapshots[0])
    for (const scene of snapshots) {
      scene.presentation = 'theater'
      scene.objects[0].anchor.position = [-60, 100, 30]
      scene.objects[0].array!.cells.reverse()
      const array = buildClassicScene(scene).entities.find((node) => node.id === objectId)!
      expect(array.rect).toEqual(first.entities[1].rect)
      for (const cell of array.array!.cells) expect(cell.rect).toEqual(first.entities[1].array!.cells.find((row) => row.slot.id === cell.slot.id)!.rect)
    }
    const ready = sceneAt()
    ready.objects = []; ready.references = []; ready.frames[0].slots = []
    expect(buildClassicScene(ready).entities[0].rect).toEqual(first.entities[0].rect)
  })

  it('preserves all fixture cells and lexical local rows through complete forward/backward replay', () => {
    const trace = loadArrayTrace(), layout = createLayout(trace)
    const positions = new Map<string, unknown>()
    const cursors = Array.from({ length: trace.events.length + 1 }, (_, index) => index)
    for (const cursor of [...cursors, ...cursors.reverse()]) {
      const scene = buildSceneModel(seek(trace, cursor), layout, 'meso')
      const diagram = buildClassicScene(scene)
      for (const node of diagram.entities) {
        for (const row of [...node.slots, ...(node.array?.cells ?? [])]) {
          if (positions.has(row.slot.id)) expect(row.rect).toEqual(positions.get(row.slot.id))
          else positions.set(row.slot.id, row.rect)
          expect(row.rect.y + row.rect.height).toBeLessThanOrEqual(560)
        }
        if (node.array) expect(node.array.cells.map((row) => row.slot.value)).toEqual(scene.objects.find((object) => object.id === node.id)!.array!.cells.map((cell) => cell.value))
      }
    }
    const final = buildSceneModel(seek(trace, trace.events.length), layout, 'meso')
    expect(render(final, trace.events.at(-1)!)).toContain('Ascending order verified')
  })

  it('uses cell bounds for Focus and relates cell selection to its inbound reference', () => {
    const diagram = buildClassicScene(sceneAt()), cells = diagram.entities[1].array!.cells
    for (const cell of cells) {
      const selection = { kind: 'slot' as const, id: cell.slot.id }
      expect(selectedBounds(diagram, selection)).toEqual(cell.rect)
      const view = focusClassicView(selectedBounds(diagram, selection)!)
      expect(cell.rect.x).toBeGreaterThanOrEqual(view.x)
      expect(cell.rect.x + cell.rect.width).toBeLessThanOrEqual(view.x + view.width)
      expect(cell.rect.y + cell.rect.height).toBeLessThanOrEqual(view.y + view.height)
      expect(relatedReference(diagram.references[0], selection, diagram)).toBe(true)
    }
    expect(selectedBounds(diagram, { kind: 'slot', id: 'missing' })).toBeNull()
    expect(classicHomeView.width).toBe(1000)
  })

  it('shows current read/comparison facts and suppresses stale activity or guidance', () => {
    const compared = sceneAt(undefined, compare)
    expect(buildClassicScene(compared).arrayActivity!.slotIds).toEqual([arrayElementSlotId(objectId, 1), arrayElementSlotId(objectId, 2)])
    expect(render(compared)).toContain('8 &gt; 1 = true')
    expect(render(compared)).toContain('data-array-state="read-or-compare"')
    expect(render(compared, null, false)).not.toContain('data-array-activity=')
    compared.activeEventId = 'next-line'
    expect(buildClassicScene(compared).arrayActivity).toBeNull()
    const read: ArrayActivity = { kind: 'read', eventId: 'read', objectId, index: 1, value: int(8), destinationSlotId: 'main:temp' }
    expect(buildClassicScene(sceneAt(undefined, read)).arrayActivity!.destinationSlotId).toBe('main:temp')
    expect(render(sceneAt(undefined, read))).toContain('Read nums[1] = 8')
  })

  it('shows each actual assignment and its local/element origin without inventing an atomic swap', () => {
    const intermediate = sceneAt([3, 1, 1, 6, 2], { kind: 'write', ...firstWrite }, [firstWrite])
    const diagram = buildClassicScene(intermediate)
    expect(diagram.entities[1].array!.cells.map((cell) => cell.value)).toEqual(['3', '1', '1', '6', '2'])
    expect(diagram.arrayWrites[0].label).toBe('nums[2] → nums[1]: 8 → 1')
    expect(diagram.arrayWrites[0].sourceSlotId).toBe(arrayElementSlotId(objectId, 2))
    const after = sceneAt([3, 1, 8, 6, 2], { kind: 'write', ...secondWrite }, [firstWrite, secondWrite])
    expect(buildClassicScene(after).arrayWrites).toHaveLength(1)
    expect(buildClassicScene(after).arrayWrites[0].label).toBe('temp → nums[2]: 1 → 8')
    expect(render(after)).toContain('changed from 1 to 8')
    expect(render(after)).toContain('data-array-state="write"')
    expect(render(after)).not.toContain('animateMotion')
    expect(render(after, event('write-two'), true, true)).toContain('animateMotion')
    expect(render(after, event('other'), true, true)).not.toContain('animateMotion')
    expect(render(after, event('write-two'), false, true)).not.toContain('data-array-write=')
    after.activeEventId = 'next-line'
    expect(buildClassicScene(after).arrayWrites).toEqual([])
  })

  it('provides accessible array/object and element selection without hidden-view tab stops', () => {
    const selected = { kind: 'slot' as const, id: arrayElementSlotId(objectId, 2) }
    const markup = render(sceneAt(), null, true, false, selected)
    expect(markup).toContain('Heap object nums · int[] #23')
    expect(markup).toContain('nums · int[] #23 index 2, int, value 1')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup.match(/data-array-index=/g)).toHaveLength(5)
    expect(markup).toContain('tabindex="0"')
    expect(render(sceneAt(), null, true, false, null, false)).not.toContain('tabindex="0"')
  })

  it('verifies ascending order from actual values only after completion, including guidance off', () => {
    const sorted = sceneAt([1, 2, 3, 6, 8])
    sorted.activeEventId = end.eventId; sorted.frames = []; sorted.references = []
    expect(buildClassicScene(sorted).entities[0].array!.name).toBeNull()
    expect(render(sorted, end, false)).toContain('Ascending order verified')
    expect(render(sorted)).not.toContain('Ascending order verified')
    expect(render(sceneAt(), end)).not.toContain('Ascending order verified')
    expect(render(sceneAt([1, 2, 2, 6, 8]), end)).toContain('Ascending order verified')
    expect(render(sorted, end)).not.toContain('nums ·')
  })
})
