import { describe, expect, it } from 'vitest'
import { loadPersonTrace } from '../examples/traces'
import { projectTrace } from '../testing/projectTrace'

describe('recorded Person production projection', () => {
  const trace = loadPersonTrace(), projection = projectTrace(trace), layout = projection.layout
  const sceneAt = projection.project

  it('keeps every surviving entity on its reserved XYZ anchor through all events', () => {
    const origin = layout.anchors['object:person:17'].position, saved = JSON.stringify(layout)
    expect(new Set(origin).size).toBe(3)
    for (let cursor = 0; cursor <= trace.events.length; cursor++) {
      const scene = sceneAt(cursor)
      for (const node of Object.values(scene.entities)) expect(node.anchor.position).toEqual(layout.anchors[node.id].position)
      if (cursor >= 9) expect(scene.entities['object:person:17'].anchor.position).toEqual(origin)
      expect(JSON.stringify(layout)).toBe(saved)
    }
  })

  it('shows captured relationships, the age mutation and retained invocation history', () => {
    const slots = (cursor: number) => sceneAt(cursor).references.map(edge => edge.sourceSlotId.split(':').at(-1))
    expect(sceneAt(9).references).toEqual([])
    expect(slots(10)).toEqual(['this'])
    expect(slots(14)).toEqual(['p', 'this'])
    const constructor = sceneAt(14).references.find(edge => edge.sourceSlotId.endsWith(':this'))!
    expect(sceneAt(14).entities[constructor.sourceId]).toMatchObject({kind:'frame',live:false,status:{kind:'returned'}})
    expect(slots(16)).toEqual(['p', 'this', 'this'])
    const object = sceneAt(18).entities['object:person:17']
    if (object.kind !== 'object') throw new Error('Expected recorded heap object')
    expect(object.groups.flatMap(group => group.rows).find(row => row.name === 'age')?.value).toMatchObject({kind:'primitive',exact:'18'})
    const atExit = sceneAt(19)
    expect(atExit.order.frames).toHaveLength(3)
    expect(atExit.order.frames.map(id => atExit.entities[id])).toMatchObject([
      {live:true,status:{kind:'running'}},{live:false,status:{kind:'returned'}},{live:false,status:{kind:'returning'}},
    ])
    const final = sceneAt(21)
    expect(final.order.frames.map(id => final.entities[id])).toMatchObject(Array(3).fill({live:false,status:{kind:'returned'}}))
    expect(slots(21)).toEqual(['p', 'this', 'this'])
    expect(final.references.every(edge => {
      const source = final.entities[edge.sourceId]
      return source.kind === 'frame' && !source.live
    })).toBe(true)
  })
})
