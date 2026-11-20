import {describe,expect,it} from 'vitest'
import {loadPersonTrace} from '../examples/traces'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import {faceRows,faceRowPort} from '../world/faceRows'
import {buildSolidBatch} from './SolidBatch'
import {inspectorEntity,inspectorRows} from './inspection'
import {accessibleEntities} from '../interaction/accessibleEntities'
import {cameraPosition,frontFace,projectionCamera,screenPoint} from '../camera/projection'
import {homeFraming} from '../camera/homeFraming'
import {focusFraming} from '../camera/focusFraming'
import {constrainCameraPose,zoomPose} from '../camera/cameraConstraints'
import {camera as tokens} from '../theme/tokens'
import type {Selection} from '../contracts/interaction'
import type {SceneModel} from '../contracts/world'
const trace=loadPersonTrace(),projection=projectTrace(trace),layout=projection.layout
const sceneAt=projection.project
const cut=(scene:SceneModel,selection:Selection=null)=>planPresentation({scene,layout,detailLevel:'CLOSE',selection,focusTargetId:null,trace:{active:false,scope:'relevant'}})
const screen=(point:readonly[number,number,number])=>({x:point[0],y:-point[1],visible:true})

describe('production runtime scene successors',()=>{
 it('preserves semantic identities, named storage, exact values and directed Person references',()=>{
  const scene=sceneAt(18),plan=cut(scene),solids=buildSolidBatch(scene,plan)
  expect([...plan.entities.keys()].sort()).toEqual(Object.keys(scene.entities).sort())
  for(const node of Object.values(scene.entities)){
   expect(solids.some(solid=>solid.anchor===node.anchor)).toBe(true)
   if(node.kind==='array'||node.kind==='collection')throw new Error('Unexpected fixture body')
   const rows=faceRows(node,plan.entities.get(node.id)!)
   expect(rows.visible.map(row=>row.slotId)).toEqual(rows.rows.map(row=>row.slotId))
  }
  expect(scene.entities['object:person:17']).toMatchObject({title:'Person',displayId:17})
  expect(inspectorRows(scene.entities['frame:main:1']).at(2)).toMatchObject({name:'p',value:{kind:'reference',exact:'Person #17',targetId:'object:person:17'}})
  expect(scene.references.map(reference=>inspectorRows(scene.entities[reference.sourceId])).map((rows,index)=>Array.from({length:rows.count},(_,i)=>rows.at(i)).find(row=>row.slotId===scene.references[index].sourceSlotId)!.name)).toEqual(['p','this','this'])
  expect(scene.references.filter(reference=>{const node=scene.entities[reference.sourceId];return node.kind==='frame'&&!node.live})).toHaveLength(1)
  for(const reference of scene.references){
   expect(reference.targetId).toBe('object:person:17')
   const curve=plan.curves.find(curve=>curve.id===reference.id)!
   expect(curve.points[0]).toEqual(faceRowPort(scene.entities[reference.sourceId],plan.entities.get(reference.sourceId)!,reference.sourceSlotId))
   expect(curve.destinationAnchor).toBe(scene.entities[reference.targetId].anchor)
  }
 })
 it('retains every canonical body at every replay prefix with actual callee depth below its caller',()=>{
  const saved=JSON.stringify(layout)
  for(let cursor=0;cursor<=trace.events.length;cursor++){
   const scene=sceneAt(cursor)
   for(const node of Object.values(scene.entities)){
    expect(node.anchor).toBe(layout.anchors[node.id])
    if(node.kind==='frame'&&node.callerId){const parent=scene.entities[node.callerId].anchor;expect(node.anchor.position[1]+node.anchor.size[1]/2).toBeLessThan(parent.position[1]-parent.size[1]/2)}
   }
  }
  expect(sceneAt(0).order).toEqual({frames:[],objects:[],classes:[]})
  expect(sceneAt(21).order.frames).toHaveLength(3)
  expect(Object.values(sceneAt(21).entities).filter(node=>node.kind==='frame').every(node=>!node.live)).toBe(true)
  expect(JSON.stringify(layout)).toBe(saved)
 })
 it('mutates the same age storage and chip in place and resolves exact Inspector selections',()=>{
  const before=sceneAt(17),after=sceneAt(18),a=before.entities['object:person:17'],b=after.entities[a.id]
  const row=(node:typeof a)=>{const rows=inspectorRows(node);return Array.from({length:rows.count},(_,i)=>rows.at(i)).find(row=>row.name==='age')!}
  expect(row(a).value.exact).toBe('0');expect(row(b).value.exact).toBe('18');expect(row(a).slotId).toBe(row(b).slotId)
  expect(buildSolidBatch(before,cut(before)).find(solid=>solid.pick.id===row(a).slotId)?.anchor).toEqual(buildSolidBatch(after,cut(after)).find(solid=>solid.pick.id===row(b).slotId)?.anchor)
  expect(inspectorEntity(after,{kind:'slot',id:row(b).slotId})).toBe(b)
  expect(inspectorEntity(after,{kind:'reference',id:'missing'})).toBeNull()
  expect(after.references.every(reference=>reference.targetId===b.id)).toBe(true)
 })
 it('exposes actual pickable entity identities and exact Inspector values independently of camera guidance',()=>{
  const scene=sceneAt(18),plan=cut(scene),catalog=accessibleEntities(scene,plan,screen)
  expect(catalog.find(item=>item.id==='object:person:17')).toMatchObject({label:'Person #17',selection:{kind:'object',id:'object:person:17'}})
  for(const item of catalog)expect(plan.entities.get(item.id)?.pickable).toBe(true)
  expect(inspectorRows(scene.entities['frame:main:1']).at(2).value.kind).toBe('reference')
  expect(scene.entities['frame:person-setAge:1']).toMatchObject({kind:'frame',topOfStack:true,status:{kind:'running'}})
  expect(catalog.map(item=>item.id).sort()).toEqual([...plan.entities.keys()].sort())
 })
 it('omits hidden geometry from keyboard traversal and picking without removing semantic identities',()=>{
  const scene=sceneAt(18),plan=cut(scene),ids=Object.keys(scene.entities)
  const hidden={...plan,entities:new Map([...plan.entities].map(([id,item])=>[id,{...item,pickable:false}])),clusters:plan.clusters.map(cluster=>({...cluster,pickable:false}))}
  expect(accessibleEntities(scene,hidden,screen)).toEqual([])
  expect(buildSolidBatch(scene,hidden).some(solid=>solid.pickable)).toBe(false)
  expect(accessibleEntities(scene,plan,()=>({x:0,y:0,visible:false}))).toEqual([])
  expect(Object.keys(scene.entities)).toEqual(ids)
 })
 it('bounds 100 repeated zoom requests and extreme pan while Home remains deterministic',()=>{
  const scene=sceneAt(18),viewport={width:1440,height:900},safe={x:380,y:90,width:1030,height:650},plan=cut(scene)
  const home=homeFraming(scene,plan,safe,viewport,layout),initial={position:cameraPosition(home.pose),target:home.pose.target},diagonal=Math.hypot(...layout.bounds!.size),limits={minDistance:tokens.minDistance,maxDistance:3*diagonal,pan:[diagonal,diagonal,diagonal] as const}
  let pose=initial
  for(let i=0;i<100;i++)pose=zoomPose(pose,'in',limits)
  expect(Math.hypot(...pose.position.map((v,i)=>v-pose.target[i]))).toBeCloseTo(limits.minDistance)
  for(let i=0;i<100;i++)pose=zoomPose(pose,'out',limits)
  expect(Math.hypot(...pose.position.map((v,i)=>v-pose.target[i]))).toBeCloseTo(limits.maxDistance)
  const pan=constrainCameraPose({position:[1e6,-1e6,1e6],target:[1e6,-1e6,0]},initial,[],layout.bounds!.center,limits)
  expect([...pan.position,...pan.target].every(Number.isFinite)).toBe(true)
  for(let i=0;i<3;i++)expect(Math.abs(pan.target[i]-layout.bounds!.center[i])).toBeLessThanOrEqual(diagonal)
  expect(homeFraming(scene,plan,safe,viewport,layout)).toEqual(home)
 })
 it('Focus frames actual body faces above the shelf and reference inspection resolves its real source',()=>{
  const scene=sceneAt(18),viewport={width:1440,height:900},safe={x:380,y:90,width:1030,height:650}
  for(const node of Object.values(scene.entities)){
   const pose=focusFraming(node.anchor,tokens.focus,safe,viewport),camera=projectionCamera(pose,viewport),points=frontFace(node.anchor).map(point=>screenPoint(point,camera,viewport))
   for(const point of points){expect(point.x).toBeGreaterThanOrEqual(safe.x);expect(point.x).toBeLessThanOrEqual(safe.x+safe.width);expect(point.y).toBeGreaterThanOrEqual(safe.y);expect(point.y).toBeLessThanOrEqual(safe.y+safe.height)}
   const height=Math.max(...points.map(point=>point.y))-Math.min(...points.map(point=>point.y));expect(height/viewport.height).toBeGreaterThanOrEqual(.38);expect(height/viewport.height).toBeLessThanOrEqual(.52)
  }
  const reference=scene.references[0]
  expect(inspectorEntity(scene,{kind:'reference',id:reference.id})).toBe(scene.entities[reference.sourceId])
  expect(scene.entities[reference.id]).toBeUndefined()
 })
})
