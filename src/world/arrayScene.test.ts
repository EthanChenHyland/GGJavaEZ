import { describe, expect, it } from 'vitest'
import { loadArrayTrace, seek } from '../runtime'
import { createLayout } from './layout'
import { buildSceneModel } from './sceneModel'

const trace = loadArrayTrace()
const layout = createLayout(trace)
const allocation = trace.events.find((event) => event.type === 'ALLOCATE_ARRAY')!
if (allocation.type !== 'ALLOCATE_ARRAY') throw new Error('Array fixture required')
const objectId = allocation.objectId

describe('array spatial identity and representation', () => {
  it('reserves equal cuboids and unique indexed anchors before execution', () => {
    expect(layout.layoutKind).toBe('array')
    expect(layout.theater).toBeDefined()
    expect(createLayout(trace)).toEqual(layout)
    const cells = Object.values(layout.anchors).filter((node) => node.entityId.includes(':element:'))
    expect(cells).toHaveLength(5)
    expect(new Set(cells.map((cell) => cell.position[0])).size).toBe(5)
    expect(new Set(cells.map((cell) => JSON.stringify(cell.size))).size).toBe(1)
    expect(cells.every((cell) => cell.size.every((axis) => axis > 0))).toBe(true)
    expect(layout.theater!.anchors[objectId].position).toEqual(layout.anchors[objectId].position)
    expect(layout.theater!.anchors[objectId].size[0]).toBeGreaterThan(layout.anchors[objectId].size[0])
  })

  it('keeps IDs, values, references, and reserved cell coordinates across every seek and mode', () => {
    for (const cursor of Array.from({ length: trace.events.length + 1 }, (_, i) => i).reverse()) {
      const state = seek(trace, cursor)
      const spatial = buildSceneModel(state, layout, 'meso', 'spatial')
      const theater = buildSceneModel(state, layout, 'meso', 'theater')
      const object = spatial.objects.find((node) => node.id === objectId)
      const expanded = theater.objects.find((node) => node.id === objectId)
      if (!object || !expanded) continue
      expect(expanded.array!.cells.map((cell) => [cell.id, cell.value])).toEqual(object.array!.cells.map((cell) => [cell.id, cell.value]))
      expect(theater.references.map((edge) => edge.id)).toEqual(spatial.references.map((edge) => edge.id))
      for (const cell of object.array!.cells) expect(cell.anchor).toBe(layout.anchors[cell.id])
      for (const cell of expanded.array!.cells) expect(cell.anchor).toBe(layout.theater!.anchors[cell.id])
      expect(theater.arrayActivity).toEqual(state.arrayActivity)
      expect(theater.bounds).toBe(layout.theater!.bounds)
    }
  })

  it('reserves one local port for each lexical slot despite repeated swap scopes', () => {
    const main = Object.values(layout.anchors).find((node) => node.region === 'stack')!
    const declarations = trace.events.filter((event) => event.type === 'DECLARE_LOCAL').map((event) => event.type === 'DECLARE_LOCAL' ? event.slot.id : '')
    expect(Object.keys(main.ports)).toEqual(expect.arrayContaining([...new Set(declarations)]))
    expect(new Set(Object.values(main.ports).map((port) => port[1])).size).toBe(Object.keys(main.ports).length)
    expect(main.size[1]).toBeLessThan(4)
  })
})
