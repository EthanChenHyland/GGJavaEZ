import type {AppState} from '../../src/state/appState'
import type {Rect} from '../../src/shell/shellLayout'
import type {SceneModel,Vec3} from '../../src/contracts/world'
import type {WorldProjection} from '../../src/qa/worldProjection'
import {Box3,Ray,Vector3} from 'three'
export interface CaptureMeasurements {
 viewport:{width:number;height:number};stateId:string;app:Pick<AppState,'execution'|'overlays'>;scene:Pick<SceneModel,'entities'>
 shell:{header:Rect|null;source:Rect|null;timeDock:Rect|null;inspector:Rect|null;safeFrame:Rect}
 world:WorldProjection
}
export function measurementFailures({viewport:{width:w,height:h},stateId,app,scene,shell,world}:CaptureMeasurements):string[]{
 const misses:string[]=[]
 const near=(label:string,actual:number|undefined,target:number,tolerance:number)=>{if(actual===undefined||!Number.isFinite(actual)||Math.abs(actual-target)>tolerance)misses.push(`${label}: ${actual??'missing'}, expected ${target} ± ${tolerance}`)}
 const narrow=w<1024,short=h<760,clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
 near('Header height',shell.header?.height,narrow||short?56:clamp(.08*h,56,76),2)
 near('Header x',shell.header?.x,0,2);near('Header y',shell.header?.y,0,2);near('Header width',shell.header?.width,w,2)
 near('Time Dock x',shell.timeDock?.x,.009*w,2);near('Time Dock width',shell.timeDock?.width,.982*w,2)
 near('Time Dock height',shell.timeDock?.height,narrow||short?84:clamp(.106*h,84,112),2)
 if(shell.timeDock)near('Time Dock bottom',shell.timeDock.y+shell.timeDock.height,.975*h,2)
 if(narrow){
  near('Source drawer x',shell.source?.x,0,2);near('Source drawer top',shell.source?.y,56,2)
  // Both closed peek rail and user-opened drawer are valid. The actual DOM size
  // must match one, never a third guessed narrow layout.
  if(shell.source){const opened=shell.source.width>40+2;near('Source drawer width',shell.source.width,opened?Math.min(.86*w,520):40,2);if(opened&&shell.timeDock)near('Source drawer height',shell.source.height,shell.timeDock.y-56,2)}else misses.push('Source drawer missing')
 }else{
  near('Source x',shell.source?.x,.006*w,2);near('Source y',shell.source?.y,.1*h,2)
  const focus=app.overlays.includes('FOCUS'),debug=app.execution==='DEBUG_PAUSED'
  // All reference fixtures have a committed runtime world and source collapsed.
  near('Source width',shell.source?.width,focus ? .22*w : debug ? .34*w:clamp(.25*w,340,470),focus ? .02*w : debug ? .03*w : 2)
  near('Source height',shell.source?.height,(debug&&!focus ? .66 : .56)*h,.03*h)
 }
 const frames=Object.values(scene.entities).filter(node=>node.anchor.region==='stack')
 const heap=Object.values(scene.entities).filter(node=>node.anchor.region==='heap')
 if(frames.length&&heap.length){
  const stackRight=Math.max(...frames.map(node=>node.anchor.position[0]+node.anchor.size[0]/2)),heapLeft=Math.min(...heap.map(node=>node.anchor.position[0]-node.anchor.size[0]/2))
  if(stackRight>=heapLeft)misses.push(`Stack/Heap canonical bands overlap: ${stackRight} >= ${heapLeft}`)
 }
 if(stateId==='runtime-hero'&&!narrow){
  if(!world.liveStack)misses.push('Hero live stack projection missing')
  else {near('Hero stack left',world.liveStack.x,.30*w,.03*w);near('Hero stack right',world.liveStack.x+world.liveStack.width,.49*w,.03*w)}
  if(!world.heap)misses.push('Hero heap projection missing')
  else{near('Hero heap left',world.heap.x,.55*w,.03*w);if(world.heap.x+world.heap.width>1.01*w)misses.push(`Hero heap right: ${world.heap.x+world.heap.width} exceeds ${1.01*w}`)}
 }
 return misses
}

export function recursiveHeadingFailures(scene:Pick<SceneModel,'entities'|'liveStack'>,world:WorldProjection,eye:Vec3,
 headings:readonly {entityId:string;kind:'title'|'identity'|'length';inkCorners:readonly Vec3[];fontPixels:number;opacity:number}[]):string[]{
 const origin=new Vector3(...eye),hit=new Vector3(),direction=new Vector3(),ray=new Ray(origin,direction)
 const frames=world.entities.flatMap(body=>{
  const frame=scene.entities[body.id]
  if(frame?.kind!=='frame'||!body.bounds?.visible)return[]
  const {position,size}=frame.anchor
  return[{id:body.id,box:new Box3().setFromCenterAndSize(new Vector3(...position),new Vector3(...size))}]
 })
 const misses:string[]=[]
 for(const id of scene.liveStack.slice(-4))for(const kind of ['title','identity'] as const){
  const heading=headings.find(item=>item.entityId===id&&item.kind===kind)
  if(!heading||heading.inkCorners.length!==4){misses.push(`Recursive ${kind} has no measured ink on ${id}`);continue}
  const shouldShow=kind==='title'||heading.fontPixels>=11
  if((heading.opacity>0)!==shouldShow)misses.push(`Recursive ${kind} on ${id} has unexpected visibility at ${heading.fontPixels.toFixed(2)} px`)
  for(const point of heading.inkCorners){
   const distance=direction.set(...point).sub(origin).length()
   direction.normalize()
   const blocker=frames.find(frame=>frame.id!==id&&ray.intersectBox(frame.box,hit)&&origin.distanceTo(hit)<distance-1e-3)
   if(blocker){misses.push(`Recursive ${kind} on ${id} is covered by ${blocker.id}`);break}
  }
 }
 return misses
}
