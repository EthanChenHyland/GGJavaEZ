import { describe, expect, it } from 'vitest'
import { seek } from '../runtime'
import { loadPersonTrace } from '../examples/traces'
import { layoutForTrace as createLayout } from '../app/layoutForTrace'
import { buildSceneModel } from './sceneModel'

describe('Person scene model', () => {
  const trace = loadPersonTrace()
  const layout = createLayout(trace)
  const sceneAt = (cursor: number) => buildSceneModel(seek(trace, cursor), layout, 'meso')

  it('keeps every surviving entity on its reserved XYZ anchor through all events', () => {
    const origin = layout.anchors['object:person:17'].position
    expect(new Set(origin).size).toBe(3)
    for (let cursor = 0; cursor <= trace.events.length; cursor++) {
      const scene = sceneAt(cursor)
      for (const node of [...scene.frames, ...scene.objects]) {
        expect(node.anchor.position).toEqual(layout.anchors[node.id].position)
      }
      if (cursor >= 9) expect(scene.objects[0].anchor.position).toEqual(origin)
    }
  })

  it('shows live relationships during execution and retained invocation history at the end', () => {
    expect(sceneAt(9).references).toEqual([])
    expect(sceneAt(10).references.map((edge) => edge.source.slotId.split(':').at(-1))).toEqual(['this'])
    expect(sceneAt(14).references.map((edge) => edge.source.slotId.split(':').at(-1))).toEqual(['p', 'this'])
    expect(sceneAt(14).references.find((edge) => edge.source.slotId.endsWith(':this'))?.historical).toBe(true)
    expect(sceneAt(16).references.map((edge) => edge.source.slotId.split(':').at(-1))).toEqual(['p', 'this', 'this'])
    expect(sceneAt(18).objects[0].fields.find((field) => field.name === 'age')?.value).toMatchObject({ value: 18 })
    expect(sceneAt(19).frames).toHaveLength(3)
    expect(sceneAt(19).frames.map((frame) => frame.invocationStatus)).toEqual(['active', 'completed', 'completed'])
    expect(sceneAt(21).frames.map((frame) => frame.invocationStatus)).toEqual(['completed', 'completed', 'completed'])
    expect(sceneAt(21).references.map((edge) => edge.source.slotId.split(':').at(-1))).toEqual(['p', 'this', 'this'])
    expect(sceneAt(21).references.every((edge) => edge.historical)).toBe(true)
  })
})
