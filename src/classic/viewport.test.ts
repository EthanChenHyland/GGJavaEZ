import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SceneModel, WorldAnchor } from '../contracts/world'
import { ClassicRuntime } from './ClassicRuntime'
import { buildClassicScene, selectedBounds, type DiagramEntity, type DiagramRect } from './classicScene'
import { classicDiagramBounds, classicHomeForDiagram, classicHomeView, constrainClassicView, focusClassicView, zoomClassicView } from './viewport'

const entity = (id: string, rect: DiagramRect, kind: DiagramEntity['kind'] = 'object'): DiagramEntity => ({ id, kind, label: id, active: false, rect, slots: [] })
function contains(view: DiagramRect, rect: DiagramRect) {
  expect(rect.x).toBeGreaterThanOrEqual(view.x - 1e-7)
  expect(rect.y).toBeGreaterThanOrEqual(view.y - 1e-7)
  expect(rect.x + rect.width).toBeLessThanOrEqual(view.x + view.width + 1e-7)
  expect(rect.y + rect.height).toBeLessThanOrEqual(view.y + view.height + 1e-7)
}
const intersects = (view: DiagramRect, rect: DiagramRect) => view.x < rect.x + rect.width && view.x + view.width > rect.x && view.y < rect.y + rect.height && view.y + view.height > rect.y
const anchor = (id: string, region: WorldAnchor['region'], position: WorldAnchor['position']): WorldAnchor => ({ entityId: id, region, position, size: [3.8, 4.1, 1.7], ports: {}, bodyPort: position })
function sparseScene(): SceneModel {
  const arrayId = 'actual-array', classId = 'actual-class'
  const position = [29.8, -10.2, -0.85] as const
  const indices = [...Array.from({ length: 15 }, (_, index) => index), 999999]
  return { frames: [], references: [], activeEventId: null, detailLevel: 'meso', layoutKind: 'spatial2',
    objects: [{ kind: 'object', id: arrayId, label: 'int[] #17', className: 'int[]', displayId: 17, fields: [], anchor: anchor(arrayId, 'heap', position),
      array: { elementType: 'int', length: 1000000, cells: indices.map((index, ordinal) => {
        const id = `${arrayId}:element:${index}`
        const reserved = anchor(id, 'heap', [position[0] + ordinal % 4, position[1] - Math.floor(ordinal / 4), position[2]])
        return { id, name: `[${index}]`, index, javaType: 'int', value: { kind: 'primitive' as const, javaType: 'int' as const, value: index }, anchor: reserved, port: reserved.bodyPort }
      }) } }],
    classes: [{ kind: 'class', id: classId, label: 'ObservedClass', className: 'ObservedClass', initialization: 'observed', anchor: anchor(classId, 'class', [35, 3.3, -0.85]),
      fields: [{ id: 'actual-static', name: 'count', javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: 7 }, port: [35, 3.3, 0] }] }],
  }
}

describe('Classic viewport bounds', () => {
  it('retains the exact empty/curated Home and legacy pan/zoom limits', () => {
    const curated = [entity('frame', { x: 72, y: 340, width: 356, height: 200 }, 'frame'), entity('heap', { x: 655, y: 238, width: 300, height: 176 })]
    expect(classicDiagramBounds([])).toBeNull()
    expect(classicHomeForDiagram([])).toEqual({ x: 0, y: 0, width: 1000, height: 650 })
    expect(classicHomeForDiagram(curated)).toEqual(classicHomeView)
    const bounds = classicDiagramBounds(curated)
    const pan = constrainClassicView({ x: 1e6, y: -1e6, width: 1000, height: 650 }, bounds)
    expect(pan).toEqual({ x: 400, y: -260, width: 1000, height: 650 })
    expect(constrainClassicView({ x: 1e6, y: -1e6, width: 1000, height: 650 })).toEqual(pan)
    expect(constrainClassicView({ x: 0, y: 0, width: 1, height: 1 }, bounds).width).toBe(400)
    expect(constrainClassicView({ x: 0, y: 0, width: 1e6, height: 1 }, bounds).width).toBe(1250)
  })

  it('includes actual overflowing rows and observed sparse cells, without including unobserved indices', () => {
    const diagram = buildClassicScene(sparseScene())
    const frame = entity('frame', { x: -2000, y: -600, width: 356, height: 240 }, 'frame')
    frame.slots = [{ slot: { id: 'overflow', name: 'value', javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: 7 }, port: [0, 0, 0] }, value: '7',
      rect: { x: -2000, y: -100, width: 356, height: 40 } }]
    contains(classicDiagramBounds([frame])!, frame.slots[0].rect)
    const entities = [...diagram.entities, frame], bounds = classicDiagramBounds(entities)!
    for (const item of entities) {
      contains(bounds, item.rect)
      for (const row of [...item.slots, ...(item.array?.cells ?? [])]) contains(bounds, row.rect)
    }
    expect(bounds.x).toBe(-2000)
    expect(bounds.y).toBe(-600)
    expect(bounds.width).toBeLessThan(5000)
    expect(diagram.entities[0].array!.cells.map(cell => cell.index)).toContain(999999)
    expect(diagram.entities[0].array!.cells).toHaveLength(16)
  })

  it.each([
    ['last-column sparse cell', { x: 1324.3, y: 943.2, width: 74.5, height: 72 }],
    ['class state', { x: 1033.6, y: 99.2, width: 330, height: 224 }],
    ['distant positive shelf', { x: 50000, y: 20000, width: 330, height: 408 }],
    ['distant negative shelf', { x: -50000, y: -20000, width: 330, height: 408 }],
  ] as const)('focuses %s without clipping its genuine target', (_label, rect) => {
    const entities = [entity('origin', { x: 72, y: 340, width: 356, height: 200 }, 'frame'), entity('target', rect)]
    const bounds = classicDiagramBounds(entities)
    const focused = focusClassicView(rect, bounds)
    contains(focused, rect)
    contains(focusClassicView(rect), rect)
    expect(focused.width).toBeGreaterThanOrEqual(500)
    expect(focused.width).toBeLessThanOrEqual(1000)
    expect(focused.height).toBe(focused.width * 0.65)
  })

  it('focuses actual projected sparse slots and static fields while preserving their identities', () => {
    const scene = sparseScene(), original = JSON.stringify(scene), diagram = buildClassicScene(scene)
    const bounds = classicDiagramBounds(diagram.entities)
    for (const selection of [{ kind: 'slot', id: 'actual-array:element:999999' }, { kind: 'class', id: 'actual-class' }, { kind: 'slot', id: 'actual-static' }] as const) {
      const target = selectedBounds(diagram, selection)!
      contains(focusClassicView(target, bounds), target)
    }
    expect(JSON.stringify(scene)).toBe(original)
  })

  it('allows panning to positive and negative extent corners at minimum zoom', () => {
    const negative = { x: -50000, y: -20000, width: 74.5, height: 72 }
    const positive = { x: 50000, y: 20000, width: 74.5, height: 72 }
    const bounds = classicDiagramBounds([entity('negative', negative), entity('positive', positive)])
    const start = { x: 0, y: 0, width: 400, height: 260 }
    contains(constrainClassicView({ ...start, x: -1e9, y: -1e9 }, bounds), negative)
    contains(constrainClassicView({ ...start, x: 1e9, y: 1e9 }, bounds), positive)
    const far = constrainClassicView({ ...start, x: 1e9, y: 1e9 }, bounds)
    expect(far.x).toBeLessThan(positive.x)
    expect(far.y).toBeLessThan(positive.y)
    expect(far.x + far.width).toBeLessThan(positive.x + positive.width + start.width)
    expect(far.y + far.height).toBeLessThan(positive.y + positive.height + start.height)
  })

  it('keeps a distant cell visible through zoom limits instead of jumping back to the curated region', () => {
    const cell = { x: 1324.3, y: 943.2, width: 74.5, height: 72 }
    const bounds = classicDiagramBounds([entity('array', { x: 1076.8, y: 639.2, width: 330, height: 408 })])
    let view = focusClassicView(cell, bounds)
    for (let step = 0; step < 40; step++) {
      view = zoomClassicView(view, 'in', bounds)
      contains(view, cell)
    }
    expect(view.width).toBe(400)
    for (let step = 0; step < 40; step++) {
      view = zoomClassicView(view, 'out', bounds)
      contains(view, cell)
    }
    expect(view.width).toBe(1250)
  })

  it('fits a compact world outside the old navigation region without increasing maximum zoom', () => {
    const entities = [entity('far', { x: 10000, y: -10000, width: 330, height: 408 })]
    const home = classicHomeForDiagram(entities)
    contains(home, entities[0].rect)
    expect(home.width).toBe(1000)
    expect(home.height).toBe(650)
  })

  it('chooses actual observed cells for Home when a large extent has an empty midpoint', () => {
    const diagram = buildClassicScene(sparseScene())
    const array = diagram.entities.find(item => item.array)!
    const entities = [entity('far-negative', { x: -50000, y: -20000, width: 300, height: 176 }), array]
    const original = JSON.stringify(entities), home = classicHomeForDiagram(entities)
    expect(home.width).toBe(1250)
    expect(array.array!.cells.some(cell => intersects(home, cell.rect))).toBe(true)
    contains(home, array.array!.cells.find(cell => cell.index === 999999)!.rect)
    expect(classicHomeForDiagram([...entities].reverse())).toEqual(home)
    expect(JSON.stringify(entities)).toBe(original)
  })

  it('initializes the rendered viewport around a genuine sparse/static entity', () => {
    const scene = sparseScene(), diagram = buildClassicScene(scene)
    const markup = renderToStaticMarkup(createElement(ClassicRuntime, { scene, event: null, guided: false, selection: null, onSelect: () => {}, onFocusSelected: () => {} }))
    const coordinates = markup.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
    const [x, y, width, height] = coordinates
    const view = { x, y, width, height }
    expect(view).toEqual(classicHomeForDiagram(diagram.entities))
    expect(diagram.entities.some(item => intersects(view, item.rect))).toBe(true)
    expect(markup).toContain('data-array-index="999999"')
    expect(markup).toContain('data-runtime-kind="class"')
  })
})
