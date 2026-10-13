import {expect,it} from 'vitest'
import fc from 'fast-check'
import type {Vec3,WorldAnchor} from '../contracts/worldV2'
import {createConnectorRouter} from './connectorRouter'
import {connectorClearsFaces} from './connectorRouting'
const anchor=(id:string,position:Vec3):WorldAnchor=>({entityId:id,position,size:[4,3,1.7],region:'heap',ports:{},bodyPort:position})
it('reuses exact immutable routes across equivalent coordinate wrappers',()=>{
 const bodies=[anchor('from',[-8,0,0]),anchor('to',[8,0,0])],router=createConnectorRouter()
 const route=router.forBodies(bodies),from:Vec3=[-6,0,.9],to:Vec3=[6,0,.9]
 const points=route(from,to,bodies[0],bodies[1])
 const copied=bodies.map(body=>({...body,position:[...body.position] as Vec3,size:[...body.size] as Vec3}))
 expect(router.forBodies(copied)([...from],[...to],copied[0],copied[1])).toBe(points)
 expect(points[0]).toEqual(from);expect(points.at(-1)).toEqual(to)
 expect(Object.isFrozen(points)&&points.every(Object.isFrozen)).toBe(true)
 expect(router.stats()).toEqual({contexts:1,routes:1,computedRoutes:1})
})
it('invalidates changed obstacles and exact terminals and reuses a recently visited context',()=>{
 const source=anchor('source',[-8,0,0]),target=anchor('target',[8,0,0]),blocker=anchor('blocker',[0,0,0])
 const from:Vec3=[-6,0,.9],to:Vec3=[6,0,.9],router=createConnectorRouter(),blocked=[source,target,blocker]
 const exterior=router.forBodies(blocked)(from,to,source,target)
 const cleared=[source,target,{...blocker,position:[0,8,0] as Vec3}],direct=router.forBodies(cleared)(from,to,source,target)
 expect(direct).not.toEqual(exterior)
 expect(router.forBodies(blocked)(from,to,source,target)).toBe(exterior)
 const changed:Vec3=[-6,.2,.9],changedPoints=router.forBodies(blocked)(changed,to,source,target)
 expect(changedPoints[0]).toEqual(changed);expect(changedPoints).not.toBe(exterior)
 expect(router.stats()).toEqual({contexts:2,routes:3,computedRoutes:3})
})
it('bounds both geometry contexts and endpoint paths, and recomputes evicted routes',()=>{
 const router=createConnectorRouter()
 for(let context=0;context<3;context++){
  const route=router.forBodies([anchor(`context/${context}`,[1000,context,0])])
  for(let path=0;path<300;path++)route([path,0,0],[path+1,1,0])
  expect(router.stats().contexts).toBeLessThanOrEqual(2);expect(router.stats().routes).toBeLessThanOrEqual(512)
 }
 const before=router.stats().computedRoutes
 const route=router.forBodies([anchor('context/0',[1000,0,0])])
 expect(route([0,0,0],[1,1,0])[0]).toEqual([0,0,0])
 expect(router.stats().computedRoutes).toBe(before+1);expect(router.stats().contexts).toBe(2)
})
it('warm and cold routers agree across represented cuts without mutating geometry (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:-8,max:8}),fc.integer({min:-8,max:8}),fc.integer({min:-6,max:6}),fc.boolean(),(sourceY,targetY,blockerY,left)=>{
  const bodies=[anchor('opaque/source',[-8,sourceY,0]),anchor('opaque/target',[8,targetY,0]),anchor('opaque/blocker',[0,blockerY,0])]
  const before=JSON.stringify(bodies),router=createConnectorRouter(),from:Vec3=[-6,sourceY,.9],to:Vec3=[6,targetY,.9]
  const points=router.forBodies(bodies)(from,to,bodies[0],bodies[1],left)
  const altered=bodies.map(body=>({...body,position:[body.position[0],body.position[1]+4,body.position[2]] as Vec3}))
  router.forBodies(altered)(from,to,altered[0],altered[1],left)
  expect(router.forBodies(bodies)(from,to,bodies[0],bodies[1],left)).toBe(points)
  expect(points).toEqual(createConnectorRouter().forBodies(bodies)(from,to,bodies[0],bodies[1],left))
  expect(connectorClearsFaces(points,bodies[0],bodies[1],bodies)).toBe(true)
  expect(JSON.stringify(bodies)).toBe(before)
 }),{numRuns:100})
})
it('preserves arbitrary actual left/right row terminals and clears intervening faces (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:-8,max:8}),fc.integer({min:-8,max:8}),fc.integer({min:-6,max:6}),fc.boolean(),fc.boolean(),(sourceY,targetY,blockerY,sourceRight,targetRight)=>{
  const bodies=[anchor('source',[-8,sourceY,0]),anchor('target',[8,targetY,0]),anchor('blocker',[0,blockerY,0])]
  const from:Vec3=[-8+(sourceRight?1.84:-1.84),sourceY-.4,.905],to:Vec3=[8+(targetRight?1.84:-1.84),targetY+.3,.905]
  const points=createConnectorRouter().forBodies(bodies)(from,to,bodies[0],bodies[1])
  expect(points[0]).toEqual(from);expect(points.at(-1)).toEqual(to)
  expect(connectorClearsFaces(points,bodies[0],bodies[1],bodies)).toBe(true)
 }),{numRuns:100})
})
