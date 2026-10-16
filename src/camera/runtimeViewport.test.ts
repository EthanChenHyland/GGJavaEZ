import {describe,expect,it} from 'vitest'
import type {WorldAnchor,Vec3} from '../contracts/worldV2'
import {sparseTrace,sparseArrayId as arrayId,sparseClassId as classId,sparseInt as int} from '../testing/sparseTrace'
import {projectTrace} from '../testing/projectTrace'
import {arrayElementSlotId} from '../contracts/runtime'
import {planPresentation,anchorCorners} from '../world/presentationPlanner'
import {facePlate} from '../world/facePlate'
import {accessibleEntities} from '../interaction/accessibleEntities'
import {inspectorEntity,inspectorRows} from '../render/inspection'
import {buildSolidBatch} from '../render/SolidBatch'
import {homeFraming} from './homeFraming'
import {focusFraming} from './focusFraming'
import {fitToSafeFrame,frontFace,projectionCamera,screenPoint,cameraPosition,type OrbitPose} from './projection'
import {constrainCameraPose,zoomPose} from './cameraConstraints'
import {camera as tokens} from '../theme/tokens'
const viewport={width:1440,height:900},safe={x:380,y:90,width:1030,height:650}
const trace=sparseTrace({indices:[...Array.from({length:15},(_,index)=>index),999999],extra:Array.from({length:20},(_,i)=>({type:'DECLARE_LOCAL',frameId:'observed-call',slot:{id:`overflow:${i}`,name:`value${i}`,javaType:'int',value:int(7)}}))}),projection=projectTrace(trace),scene=projection.project(trace.events.length),layout=projection.layout
const cut=(id?:string)=>planPresentation({scene,layout,detailLevel:'CLOSE',selection:id?{kind:'slot',id}:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
function contains(pose:OrbitPose,points:readonly Vec3[]){const camera=projectionCamera(pose,viewport);for(const point of points){const p=screenPoint(point,camera,viewport);expect(p.x).toBeGreaterThanOrEqual(safe.x-1e-7);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width+1e-7);expect(p.y).toBeGreaterThanOrEqual(safe.y-1e-7);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height+1e-7)}}
/** Pure camera-math targets retain the original four rectangle coordinates and
 * dimensions as physical XYZ test volumes; they are never inserted in a scene. */
function volume(x:number,y:number,width:number,height:number):WorldAnchor{const position:Vec3=[x+width/2,y+height/2,0];return{entityId:'camera-math-volume',region:'heap',position,size:[width,height,1.7],ports:{},bodyPort:position}}

describe('production viewport successors',()=>{
 it('keeps empty Home finite and deterministic with world-derived bounded zoom',()=>{
  const empty=projection.project(0),plan=planPresentation({scene:empty,layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}}),a=homeFraming(empty,plan,safe,viewport,layout)
  expect(empty.order).toEqual({frames:[],objects:[],classes:[]});expect(homeFraming(empty,plan,safe,viewport,layout)).toEqual(a)
  expect([...a.pose.target,a.pose.distance,a.pose.yawDeg,a.pose.pitchDeg].every(Number.isFinite)).toBe(true)
  expect(a.pose.distance).toBeGreaterThan(0);contains(a.pose,a.points)
 })
 it('contains real overflow chips and sixteen recorded sparse values without materializing other observations',()=>{
  const plan=cut('overflow:19'),node=scene.entities['observed-call'],plate=facePlate(node,plan.entities.get(node.id)!,'overflow:19')!,array=scene.entities[arrayId]
  expect(plate).not.toBeNull();expect(node.anchor.ports['overflow:19']).toBeUndefined()
  expect(plate.position[1]).toBeGreaterThan(node.anchor.position[1]-node.anchor.size[1]/2)
  expect(plate.position[1]).toBeLessThan(node.anchor.position[1]+node.anchor.size[1]/2)
  if(array.kind!=='array')throw new Error('Expected sparse array')
  expect(array.cells.map(cell=>cell.index)).toEqual([...Array.from({length:15},(_,index)=>index),999999])
  expect(inspectorRows(array).at(999999).value.exact).toBe('999999');expect(inspectorRows(array).at(500000).value.kind).toBe('not-recorded')
  expect(buildSolidBatch(scene,plan).some(item=>item.pick.id==='overflow:19')).toBe(true)
 })
 it.each([
  ['last-column sparse cell',1324.3,943.2,74.5,72],['class state',1033.6,99.2,330,224],['distant positive shelf',50000,20000,330,408],['distant negative shelf',-50000,-20000,330,408],
 ] as const)('Focus contains the genuine %s volume at its original distant coordinates',(_name,x,y,width,height)=>{
  const anchor=volume(x,y,width,height),saved=JSON.stringify(anchor),pose=focusFraming(anchor,tokens.focus,safe,viewport)
  contains(pose,frontFace(anchor));expect(JSON.stringify(anchor)).toBe(saved)
  const projected=frontFace(anchor).map(point=>screenPoint(point,projectionCamera(pose,viewport),viewport)),heightPixels=Math.max(...projected.map(point=>point.y))-Math.min(...projected.map(point=>point.y))
  expect(heightPixels/viewport.height).toBeGreaterThanOrEqual(.38);expect(heightPixels/viewport.height).toBeLessThanOrEqual(.52)
 })
 it('Focus resolves actual sparse cells and static storage to their canonical presentation ownership',()=>{
  const original=JSON.stringify(layout)
  for(const id of[arrayElementSlotId(arrayId,999999),'static:counter',classId]){
   const plan=cut(id),owner=inspectorEntity(scene,{kind:id===classId?'class':'slot',id})!
   const anchor=plan.cellWindows.get(arrayId)?.mapping.get(id)?.anchor??owner.anchor
   expect(owner.id).toBe(id.startsWith(arrayId)?arrayId:classId)
   contains(focusFraming(anchor,tokens.focus,safe,viewport),frontFace(anchor))
  }
  expect(JSON.stringify(layout)).toBe(original)
 })
 it('permits finite pan toward both original ±50000/±20000 extents within explicit world limits',()=>{
  const limits={minDistance:tokens.minDistance,maxDistance:400000,pan:[100000,50000,100000] as Vec3},initial={position:[0,0,2000] as Vec3,target:[0,0,0] as Vec3}
  for(const sign of[-1,1]){
   const target:Vec3=[sign*1e9,sign*1e9,0],pose=constrainCameraPose({position:[target[0],target[1],2000],target},initial,[],[0,0,0],limits)
   expect(pose.target[0]*sign).toBeGreaterThanOrEqual(50000);expect(pose.target[1]*sign).toBeGreaterThanOrEqual(20000)
   expect(Math.abs(pose.target[0])).toBeLessThanOrEqual(limits.pan[0]);expect(Math.abs(pose.target[1])).toBeLessThanOrEqual(limits.pan[1]);expect([...pose.target,...pose.position].every(Number.isFinite)).toBe(true)
  }
 })
 it('keeps the distant focused target fixed through forty requests at each zoom bound without jumping to a fixture origin',()=>{
  const anchor=volume(1324.3,943.2,74.5,72),focused=focusFraming(anchor,tokens.focus,safe,viewport),limits={minDistance:tokens.minDistance,maxDistance:10000,pan:[10000,10000,10000] as Vec3}
  let pose={position:cameraPosition(focused),target:focused.target}
  for(const direction of['in','out'] as const)for(let step=0;step<40;step++){pose=zoomPose(pose,direction,limits);expect(pose.target).toEqual(focused.target);const distance=Math.hypot(...pose.position.map((v,i)=>v-pose.target[i]));expect(distance).toBeGreaterThanOrEqual(limits.minDistance-1e-8);expect(distance).toBeLessThanOrEqual(limits.maxDistance+1e-8)}
 })
 it('fits a compact physical world at original 10000/−10000 coordinates without translating its anchors',()=>{
  const anchor=volume(10000,-10000,330,408),points=anchorCorners(anchor),pose=fitToSafeFrame(points,tokens.hero,safe,viewport)
  contains(pose,points);expect(anchor.position).toEqual([10165,-9796,0]);expect(pose.target[0]).toBeGreaterThan(9000);expect(pose.target[1]).toBeLessThan(-9000)
 })
 it('Home frames an actual virtualized sparse window instead of inventing a world at the logical midpoint',()=>{
  const slotId=arrayElementSlotId(arrayId,999999),plan=cut(slotId),home=homeFraming(scene,plan,safe,viewport,layout),cell=plan.cellWindows.get(arrayId)!.mapping.get(slotId)!
  expect(cell).toBeDefined();expect(home.ids).toContain(arrayId);contains(home.pose,home.points)
  const p=screenPoint(cell.anchor.position,projectionCamera(home.pose,viewport),viewport)
  expect(p.x).toBeGreaterThanOrEqual(safe.x);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width);expect(p.y).toBeGreaterThanOrEqual(safe.y);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height)
  expect(inspectorRows(scene.entities[arrayId]).at(999999).value.exact).toBe('999999')
 })
 it('initializes current pickable geometry and the accessible catalog around real sparse/static identities',()=>{
  const slotId=arrayElementSlotId(arrayId,999999),plan=cut(slotId),home=homeFraming(scene,plan,safe,viewport,layout),camera=projectionCamera(home.pose,viewport)
  const catalog=accessibleEntities(scene,plan,point=>{const p=screenPoint(point,camera,viewport);return{x:p.x,y:p.y,visible:p.z>=-1&&p.z<=1&&p.x>=0&&p.x<=viewport.width&&p.y>=0&&p.y<=viewport.height}})
  expect(catalog.some(item=>item.id===arrayId||item.id===classId)).toBe(true);expect(catalog.some(item=>item.id===slotId)).toBe(true)
  expect(inspectorRows(scene.entities[classId]).at(0).value.exact).toBe('7')
 })
})
