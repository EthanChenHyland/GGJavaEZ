import { describe, expect, it } from 'vitest'
import type { Vec3, WorldAnchor } from '../contracts/world'
import { surfaceConnectorPoints } from './connectorRouting'
const anchor = (id: string, position: Vec3): WorldAnchor => ({entityId:id,position,size:[4,3,1.7],region:'heap',ports:{},bodyPort:position})
describe('exterior connector routes', () => {
  it.each(([[-8,2,-4],[8,-3,-2],[0,0,0]] as Vec3[]).map(position=>({position})))('keeps canonical endpoints and approaches information faces from exterior margins ($position)', ({position}) => {
    const source = anchor('source', position), target=anchor('target',[0,0,0])
    const from: Vec3=[position[0]+1.8,position[1]-.5,position[2]+.905],to: Vec3=[-1.84,0,.905]
    const before=JSON.stringify([source,target])
    const points=surfaceConnectorPoints(from,to,source,target)
    expect(points[0]).toEqual(from);expect(points.at(-1)).toEqual(to)
    expect(points[1][0]).toBeGreaterThan(source.position[0]+source.size[0]/2)
    expect(points.at(-2)![0]).toBeLessThan(target.position[0]-target.size[0]/2)
    for(const point of points.slice(2,4))expect(point[1]).toBeGreaterThan(Math.max(source.position[1]+1.5,target.position[1]+1.5))
    expect(JSON.stringify([source,target])).toBe(before)
  })
})
