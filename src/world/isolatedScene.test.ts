import { describe, expect, it } from 'vitest'
import { seek } from '../runtime'
import { loadPersonTrace } from '../examples/traces'
import { layoutForTrace as createLayout } from '../app/layoutForTrace'
import { buildSceneModel } from './sceneModel'
import { isolatedScene } from './isolatedScene'

const trace = loadPersonTrace()
const layout = createLayout(trace)
const at = (cursor: number) => buildSceneModel(seek(trace, cursor), layout, 'meso')

describe('Focus visibility projection', () => {
  it('isolates a field owner without moving it or changing the full runtime world', () => {
    const full = at(18)
    const object = full.objects[0]
    const focused = isolatedScene(full, { kind: 'slot', id: object.fields[0].id })
    expect(focused.objects).toEqual([object])
    expect(focused.frames).toEqual([])
    expect(focused.references).toEqual([])
    expect(focused.objects[0].anchor).toBe(object.anchor)
    expect(full.frames).toHaveLength(3)
  })

  it('retains the same focused call geometry as the method and main complete', () => {
    const id = at(18).frames.at(-1)!.id
    for (const cursor of [18, 19, 21]) {
      const focused = isolatedScene(at(cursor), { kind: 'frame', id })
      expect(focused.frames).toHaveLength(1)
      expect(focused.frames[0].anchor).toBe(layout.anchors[id])
      expect(focused.frames[0].invocationStatus).toBe(cursor === 18 ? 'active' : 'completed')
    }
  })

  it('shows the ordinary world when replay precedes the focused entity', () => {
    const prior = at(1)
    expect(isolatedScene(prior, { kind: 'object', id: 'object:person:17' })).toBe(prior)
  })
})
