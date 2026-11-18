import {expect,it} from 'vitest'
import {loadArrayTrace,loadPersonTrace} from '../examples/traces'
import {seek} from '../runtime'
import {createLayoutEngine} from '../world/layoutEngine'
import {createSceneProjector} from '../world/sceneProjector'
import type {SceneEntity,Vec3} from '../contracts/world'
import type {TraceDocument} from '../contracts/runtime'
import {createMemberVisibility} from './memberVisibility'

function nodes(trace:TraceDocument){
 const layout=createLayoutEngine();layout.append(trace.events)
 return Object.values(createSceneProjector(trace).project(seek(trace,trace.events.length),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}).entities)
}
// Geometry-only unit arrangements derived from typed projected fixtures. They
// do not mutate a real runtime world or claim actual-JVM acceptance.
const placed=(node:SceneEntity,id:string,position:Vec3,size:Vec3):SceneEntity=>({...node,id,anchor:{...node.anchor,entityId:id,position,size}})
const object=nodes(loadPersonTrace()).find(node=>node.kind==='object')!
const array=nodes(loadArrayTrace()).find(node=>node.kind==='array')!
it('ranks blocked central faces behind actual cuboids and clear alternate sightlines without moving bodies',()=>{
 const target=placed(object,'unit-target',[0,0,0],[2,2,2]),blocker=placed(object,'unit-blocker',[0,0,4],[4,4,2]),entities={target,blocker},before=JSON.stringify(entities)
 const visibility=createMemberVisibility({entities})
 expect(visibility(target,[0,0,10])).toEqual({blocked:5,centreBlocked:true})
 expect(visibility(target,[10,10,3])).toEqual({blocked:0,centreBlocked:false})
 expect(JSON.stringify(entities)).toBe(before)
})
it('uses the physical tray backing to block covered faces and allows paths around it',()=>{
 const target=placed(object,'unit-target',[0,0,0],[2,2,2]),tray=placed(array,'unit-tray',[0,0,4],[6,8,2]),visibility=createMemberVisibility({entities:{target,tray}})
 expect(visibility(target,[0,0,10])).toEqual({blocked:5,centreBlocked:true})
 expect(visibility(target,[20,0,10])).toEqual({blocked:0,centreBlocked:false})
 const headerTarget=placed(target,'unit-target',[0,3.55,0],[2,2,2])
 expect(visibility(headerTarget,[0,3.55,10]).centreBlocked).toBe(true)
})
it('rejects a face viewed from its back even when no other solid blocks it',()=>{
 const target=placed(object,'unit-target',[0,0,0],[2,2,2]),visibility=createMemberVisibility({entities:{target}})
 expect(visibility(target,[0,0,-10])).toEqual({blocked:5,centreBlocked:true})
})
