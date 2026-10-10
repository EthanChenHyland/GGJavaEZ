import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { Vec3, WorldAnchor } from '../contracts/world'
import { roundedConnectorPoints, surfaceConnectorPoints } from './connectorRouting'
const anchor = (id: string, position: Vec3): WorldAnchor => ({entityId:id,position,size:[4,3,1.7],region:'heap',ports:{},bodyPort:position})
describe('exterior connector routes', () => {
  it('keeps rounded routes outside represented information faces without moving canonical ports (100 runs)', () => {
    fc.assert(fc.property(fc.integer({ min: -8, max: 8 }), fc.integer({ min: -8, max: 8 }), fc.integer({ min: -6, max: 6 }), (sourceY, targetY, obstacleY) => {
      const source = anchor('source', [-8, sourceY, 0]), target = anchor('target', [8, targetY, 0]), obstruction = anchor('obstruction', [0, obstacleY, 0])
      const bodies = [source, target, obstruction], before = JSON.stringify(bodies)
      const from: Vec3 = [-6, sourceY, .9], to: Vec3 = [6, targetY, .9]
      const points = roundedConnectorPoints(surfaceConnectorPoints(from, to, source, target, bodies))
      expect(points[0]).toEqual(from); expect(points.at(-1)).toEqual(to)
      expect(points).toEqual(roundedConnectorPoints(surfaceConnectorPoints(from, to, source, target, bodies)))
      for (let i = 1; i < points.length; i++) for (const body of bodies) {
        const a = points[i - 1], b = points[i], [x, y] = body.position, [width, height] = body.size
        expect(Math.min(a[0], b[0]) < x + width / 2 && Math.max(a[0], b[0]) > x - width / 2
          && Math.min(a[1], b[1]) < y + height / 2 && Math.max(a[1], b[1]) > y - height / 2).toBe(false)
      }
      expect(JSON.stringify(bodies)).toBe(before)
    }), { numRuns: 100 })
  })
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
  it('clears an array header and adjacent cell while preserving exact terminal attachments', () => {
    const source: WorldAnchor = { ...anchor('cell', [0, 0, 0]), size: [1.12, 1.15, 1.15] }
    const neighbor: WorldAnchor = { ...source, entityId: 'neighbor', position: [1.28, 0, 0] }
    const header: WorldAnchor = { ...anchor('array-header', [0, 1.6, 0]), size: [3.8, 0.85, 0.45] }
    const target: WorldAnchor = { ...header, entityId: 'target-header', position: [8, 3, 0] }
    const bodies = [source, neighbor, header, target], before = JSON.stringify(bodies)
    const from: Vec3 = [0.44, 0, 0.63], to: Vec3 = [6.26, 3, 0.28]
    const points = surfaceConnectorPoints(from, to, source, target, bodies)
    expect(points[0]).toEqual(from); expect(points.at(-1)).toEqual(to)
    expect(points[1][0]).toBeLessThan(neighbor.position[0] - neighbor.size[0] / 2)
    for (let i = 2; i < points.length - 2; i++) {
      const a = points[i - 1], b = points[i]
      for (const body of bodies) {
        const [x, y] = body.position, [width, height] = body.size
        expect(Math.min(a[0], b[0]) < x + width / 2 && Math.max(a[0], b[0]) > x - width / 2
          && Math.min(a[1], b[1]) < y + height / 2 && Math.max(a[1], b[1]) > y - height / 2, `${body.entityId}: ${i}`).toBe(false)
      }
    }
    expect(JSON.stringify(bodies)).toBe(before)
  })
})
