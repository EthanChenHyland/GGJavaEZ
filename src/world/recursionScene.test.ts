import { describe, expect, it } from 'vitest'
import { loadRecursionTrace } from '../examples/traces'
import { projectTrace } from '../testing/projectTrace'
import { presentedFlowPorts } from './flowTopology'
import { seek } from '../runtime'
import { planPresentation } from './presentationPlanner'

const trace = loadRecursionTrace(), projection = projectTrace(trace), layout = projection.layout
const sceneAt = projection.project

describe('production recursion projection and anchors', () => {
  it('reserves all six real invocations in XYZ and keeps their captured parameters and anchors', () => {
    const anchors = Object.values(layout.anchors), saved = JSON.stringify(layout)
    expect(anchors).toHaveLength(6)
    expect(new Set(anchors.map(anchor => JSON.stringify(anchor.position))).size).toBe(6)
    expect(new Set(anchors.map(anchor => anchor.position[1])).size).toBe(6)
    expect(new Set(anchors.map(anchor => anchor.position[2])).size).toBe(6)
    for (const anchor of anchors) expect(anchor.size.every(axis => axis > 0)).toBe(true)
    for (let cursor = trace.events.length; cursor >= 0; cursor--) {
      const scene = sceneAt(cursor)
      expect(scene.order.objects).toEqual([])
      for (const id of scene.order.frames) expect(scene.entities[id].anchor).toEqual(layout.anchors[id])
      expect(JSON.stringify(layout)).toBe(saved)
    }
    const deepest = sceneAt(19)
    expect(deepest.order.frames).toHaveLength(6)
    expect(Math.max(...deepest.order.frames.map(id => deepest.entities[id].kind === 'frame' ? deepest.entities[id].depth : -1))).toBe(5)
    expect(deepest.order.frames.slice(1).map(id => {
      const frame = deepest.entities[id]
      return frame.kind === 'frame' ? frame.rows.find(row => row.name === 'n')?.value.exact : null
    })).toEqual(['5','4','3','2','1'])
  })

  it('joins actual return evidence to exact caller storage, without inventing a pending value', () => {
    const pending = sceneAt(19).entities['frame:factorial:1']
    expect(sceneAt(19).returnFlows.some(flow => flow.frameId === pending.id)).toBe(false)
    const returning = sceneAt(20), transfer = seek(trace,20).returns.find(item => item.frameId === pending.id)!
    expect(transfer.value).toMatchObject({kind:'primitive',value:1})
    expect(transfer.destination).toEqual({frameId:'frame:factorial:2',slotId:'slot:factorial:2:child'})
    expect(returning.returnFlows).toEqual([])
    const plan = planPresentation({scene:returning,layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:true,scope:'all'}})
    expect(plan.curves.filter(curve=>curve.kind==='return')).toEqual([])
    expect(plan.headings.some(heading=>heading.id==='RETURNS')).toBe(false)
    const destination=transfer.destination!
    const caller = returning.entities[destination.frameId]
    if (caller.kind !== 'frame') throw new Error('Expected actual caller')
    expect(caller.rows.find(row => row.slotId === destination.slotId)?.value.exact).toBe('1')
    const presented = new Map(returning.order.frames.map(id => [id,{id,mode:'detailed' as const,detail:'CLOSE' as const,opacity:1,pinned:true,pickable:true,highlight:null}]))
    const port = presentedFlowPorts(returning,presented,new Map())
    expect(port({kind:'frame',id:pending.id},true)?.point).toEqual([
      pending.anchor.position[0]+pending.anchor.size[0]/2,pending.anchor.position[1]+pending.anchor.size[1]/2-.85,pending.anchor.position[2]+pending.anchor.size[2]/2,
    ])
    expect(port({kind:'slot',id:destination.slotId})?.point).toEqual(caller.anchor.ports[destination.slotId])
    expect(sceneAt(21).entities[pending.id]).toMatchObject({kind:'frame',live:false,status:{kind:'returning'}})
    expect(sceneAt(22).entities[pending.id]).toMatchObject({kind:'frame',live:false,status:{kind:'returned',value:{exact:'1'}}})
    expect(sceneAt(19).entities[pending.id].anchor).toEqual(pending.anchor)
    const final = sceneAt(36)
    expect(final.order.frames).toHaveLength(6)
    expect(final.order.frames.map(id => final.entities[id])).toMatchObject(Array(6).fill({live:false,status:{kind:'returned'}}))
    expect(seek(trace,36).returns.find(item => item.frameId === 'frame:factorial:5')?.value).toMatchObject({kind:'primitive',value:120})
    expect(final.entities['frame:factorial:5']).toMatchObject({status:{kind:'returned',value:{exact:'120'}}})
    expect(final.returnFlows).toEqual([])
  })
})
