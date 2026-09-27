import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { loadPersonTrace, seek } from '../runtime'
import { createLayout } from '../world/layout'
import { buildSceneModel } from '../world/sceneModel'
import { ClassicRuntime } from './ClassicRuntime'
import { buildClassicScene, emphasizedSlot, relatedReference, selectedBounds } from './classicScene'
import { classicHomeView, constrainClassicView, focusClassicView, zoomClassicView } from './viewport'

const trace = loadPersonTrace()
const layout = createLayout(trace)
const sceneAt = (cursor: number) => buildSceneModel(seek(trace, cursor), layout, 'meso')

describe('Classic scene projection', () => {
  it('preserves semantic IDs, labels, named slots, values, and directed references', () => {
    const scene = sceneAt(18)
    const diagram = buildClassicScene(scene)
    expect(diagram.entities.map((entity) => entity.id)).toEqual([...scene.frames, ...scene.objects].map((node) => node.id))
    for (const entity of diagram.entities) {
      const node = [...scene.frames, ...scene.objects].find((node) => node.id === entity.id)!
      expect(entity.label).toBe(node.label)
      expect(entity.slots.map((row) => row.slot.id)).toEqual(('slots' in node ? node.slots : node.fields).map((slot) => slot.id))
    }
    expect(diagram.entities.find((entity) => entity.kind === 'object')?.label).toBe('Person #17')
    expect(diagram.entities.flatMap((entity) => entity.slots).find((row) => row.slot.name === 'p')?.value).toBe('→ #17')
    for (const edge of diagram.references) {
      const runtimeEdge = scene.references.find((reference) => reference.id === edge.id)!
      const row = diagram.entities.flatMap((entity) => entity.slots).find((row) => row.slot.id === runtimeEdge.source.slotId)!
      expect(edge.from).toEqual([row.rect.x + row.rect.width, row.rect.y + row.rect.height / 2])
      expect(edge.targetObjectId).toBe(runtimeEdge.targetObjectId)
      expect(edge.path.startsWith(`M ${edge.from[0]} ${edge.from[1]}`)).toBe(true)
    }
    expect(diagram.references.map((edge) => edge.label)).toEqual(['p', 'this'])
    expect(diagram.references[0].to).not.toEqual(diagram.references[1].to)
  })

  it('keeps surviving entities fixed through every replay cursor and puts callee above caller', () => {
    const positions = new Map<string, { x: number; y: number }>()
    for (let cursor = 0; cursor <= trace.events.length; cursor++) {
      const diagram = buildClassicScene(sceneAt(cursor))
      for (const entity of diagram.entities) {
        const position = { x: entity.rect.x, y: entity.rect.y }
        if (positions.has(entity.id)) expect(position).toEqual(positions.get(entity.id))
        else positions.set(entity.id, position)
        expect(entity.rect.y + entity.rect.height).toBeLessThanOrEqual(560)
      }
      const main = diagram.entities.find((entity) => entity.label === 'main()')
      for (const callee of diagram.entities.filter((entity) => entity.kind === 'frame' && entity.label !== 'main()')) {
        expect(callee.rect.y + callee.rect.height).toBeLessThan(main!.rect.y)
      }
    }
    expect(buildClassicScene(sceneAt(0)).entities).toEqual([])
    expect(buildClassicScene(sceneAt(21)).entities.map((entity) => entity.label)).toEqual(['Person #17'])
    expect(buildClassicScene(sceneAt(21)).references).toEqual([])
  })

  it('mutates the existing slot in place and selects related links without duplicating state', () => {
    const before = buildClassicScene(sceneAt(17)), after = buildClassicScene(sceneAt(18))
    const ageBefore = before.entities.find((entity) => entity.kind === 'object')!.slots.find((row) => row.slot.name === 'age')!
    const ageAfter = after.entities.find((entity) => entity.kind === 'object')!.slots.find((row) => row.slot.name === 'age')!
    expect(ageBefore.value).toBe('0')
    expect(ageAfter.value).toBe('18')
    expect(ageAfter.rect).toEqual(ageBefore.rect)
    expect(ageAfter.slot.id).toBe(ageBefore.slot.id)
    expect(emphasizedSlot(trace.events[17])).toBe(ageAfter.slot.id)
    const person = after.entities.find((entity) => entity.kind === 'object')!
    expect(after.references.every((edge) => relatedReference(edge, { kind: 'object', id: person.id }))).toBe(true)
    expect(selectedBounds(after, { kind: 'slot', id: ageAfter.slot.id })).toEqual(ageAfter.rect)
    expect(selectedBounds(after, { kind: 'reference', id: 'missing' })).toBeNull()
  })

  it('renders keyboard-accessible entities, slots, and arrows with guidance independently controlled', () => {
    const scene = sceneAt(18)
    const render = (guided: boolean) => renderToStaticMarkup(createElement(ClassicRuntime, {
      scene, event: trace.events[17], guided, selection: null, onSelect: () => {}, onFocusSelected: () => {},
    }))
    const guided = render(true), plain = render(false)
    expect(guided).toContain('Person #17')
    expect(guided).toContain('marker-end=')
    expect(guided).toContain('tabindex="0"')
    expect(guided).toContain('points to Person #17')
    expect(guided).toContain('EXECUTING')
    expect(plain).not.toContain('EXECUTING')
    expect(plain).toContain('data-slot-id=')
    expect(plain).toContain('Person #17')
  })

  it('removes hidden representation entities from keyboard traversal', () => {
    const hidden = renderToStaticMarkup(createElement(ClassicRuntime, {
      scene: sceneAt(18), event: trace.events[17], visible: false, guided: true,
      selection: null, onSelect: () => {}, onFocusSelected: () => {},
    }))
    expect(hidden).toContain('aria-hidden="true"')
    expect(hidden).toContain('tabindex="-1"')
    expect(hidden).not.toContain('tabindex="0"')
  })
})

describe('Classic presentation viewport', () => {
  it('constrains zoom and pan while preserving canonical reset', () => {
    let view = classicHomeView
    for (let n = 0; n < 100; n++) view = zoomClassicView(view, 'in')
    expect(view.width).toBe(400)
    for (let n = 0; n < 100; n++) view = zoomClassicView(view, 'out')
    expect(view.width).toBe(1250)
    const pan = constrainClassicView({ x: 1e6, y: -1e6, width: 1000, height: 650 })
    expect(pan.x).toBe(400)
    expect(pan.y).toBe(-260)
    expect(classicHomeView).toEqual({ x: 0, y: 0, width: 1000, height: 650 })
  })

  it('frames entity and path bounds within the available runtime area', () => {
    const diagram = buildClassicScene(sceneAt(18))
    for (const entity of diagram.entities) {
      const view = focusClassicView(entity.rect)
      expect(entity.rect.x).toBeGreaterThanOrEqual(view.x)
      expect(entity.rect.x + entity.rect.width).toBeLessThanOrEqual(view.x + view.width)
      expect(entity.rect.y).toBeGreaterThanOrEqual(view.y)
      expect(entity.rect.y + entity.rect.height).toBeLessThanOrEqual(view.y + view.height * 560 / 650)
    }
    expect(focusClassicView(selectedBounds(diagram, { kind: 'reference', id: diagram.references[0].id })!).width).toBeGreaterThanOrEqual(500)
  })
})
