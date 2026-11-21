import type {TraceEvent} from '../contracts/runtime'
import type {PresentationPlan,SceneModel,Vec3} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {camera as tokens} from '../theme/tokens'
import {anchorCorners} from '../world/anchorGeometry'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {fitForensicFraming} from './forensicFraming'
import {followFraming} from './followFraming'
import {compositionFrame,fitToSafeFrame,projectionCamera,type OrbitPose,type Size} from './projection'
import {regionHeadingSpec,structuralLabelFitPoints} from '../render/text/structuralLabelLayout'

/** Follow the captured caller chain, never other threads or guessed depth. */
export function followInvocations(scene:SceneModel):string[]{
 const ids:string[]=[],seen=new Set<string>()
 let id=scene.liveStack.at(-1)
 while(id&&!seen.has(id)){
  const frame=scene.entities[id]
  if(frame?.kind!=='frame'||!frame.live)break
  seen.add(id);ids.unshift(id);id=frame.callerId??undefined
 }
 return ids
}
export function isFollowSubjectEvent(event:TraceEvent|null):boolean{
 if(!event)return false
 if(['ENTER_METHOD','ALLOCATE_OBJECT','ALLOCATE_ARRAY','THROW_EXCEPTION'].includes(event.type))return true
 if((event.type==='SET_FIELD'||event.type==='ARRAY_WRITE')&&event.importance!=='quiet')return true
 if(event.type!=='EXECUTION_FACT')return false
 const fact=event.fact
 return ['enter','object','throw'].includes(fact.kind)||fact.kind==='write'&&event.importance!=='quiet'&&['field','array-element'].includes(fact.target.kind)
}
/** Explicit Follow composes the real subjects at the current cursor.
 * Subsequent steps only adjust when captured subjects leave the composition.
 */
export function guidedFollow(
 scene:SceneModel,plan:PresentationPlan,event:TraceEvent|null,current:OrbitPose,
 safe:Rect,viewport:Size,previousRecursion:boolean|null,
):{pose:OrbitPose|null;recursion:boolean;ids:readonly string[];points:readonly Vec3[]}{
 const chain=followInvocations(scene),recursion=chain.length>=tokens.recursion.depth
 const ids=new Set(chain.slice(-(recursion?tokens.recursion.context:2)))
 const frame=compositionFrame(safe,viewport)
 // Explicit Follow may start while a proved return is already being shown.
 // Include that recorded transfer's actual two owners on entry, without keeping
 // older returns pinned during subsequent execution steps.
 let returning=false
 if(previousRecursion===null){
  const returned=scene.returnFlows.find(flow=>plan.curves.some(curve=>curve.kind==='return'&&curve.id===flow.id));
  if(returned){returning=true;for(const id of[returned.frameId,returned.destination.entityId])if(scene.entities[id])ids.add(id);}
 }
 // An event passed from outside this prefix must not introduce future subjects.
 if(event?.seq===scene.cursor-1&&isFollowSubjectEvent(event))
  for(const id of scene.cursorEvent?.subjects??[])if(scene.entities[id])ids.add(id)
 if(plan.exceptionPanel){
  const path=plan.exceptionPanel.content
  for(const id of [path.throwFrameId,path.exceptionId])if(id&&scene.entities[id])ids.add(id)
 }
 const points:Vec3[]=[...ids].flatMap(id=>anchorCorners(scene.entities[id].anchor))
 if(plan.exceptionPanel)points.push(...anchorCorners(exceptionPanelAnchor(plan.exceptionPanel,scene.recording)))
 if(!points.length)return{pose:null,recursion,ids:[...ids],points}
 const angles=recursion?tokens.recursion:tokens.hero
 const finish=(pose:OrbitPose|null)=>{
  let framedPoints=points,framedPose=pose
  const headings=plan.headings.filter(heading=>returning&&heading.id==='RETURNS'||recursion&&heading.id==='STACK')
  if(headings.length&&(pose||previousRecursion!==recursion)){
   let next=pose??current
   const specs=headings.map(heading=>regionHeadingSpec(heading.id,heading.position)),bodies=[...plan.entities.keys()].map(id=>scene.entities[id].anchor)
   for(let refine=0;refine<16;refine++){
    framedPoints=[...points,...structuralLabelFitPoints(specs,bodies,projectionCamera(next,viewport),viewport)]
    // Preserve a visible gutter for glyph ink and antialiasing at viewport edges.
    const gutter=Math.min(12,safe.width/8,safe.height/8),clearance={x:safe.x+gutter,y:safe.y+gutter,width:safe.width-2*gutter,height:safe.height-2*gutter}
    const fitted=followFraming(framedPoints,next,clearance,viewport)
    if(!fitted)break
    next=fitted
   }
   framedPose=next===current?null:next
  }
  if(!plan.exceptionPanel)return{pose:framedPose,recursion,ids:[...ids],points:framedPoints}
  const fitted=fitForensicFraming(framedPoints,plan.exceptionPanel,scene.recording,framedPose??current,frame,viewport,(points,pose)=>followFraming(points,pose,frame,viewport)??pose)
  return{pose:fitted.pose===current?null:fitted.pose,recursion,ids:[...ids],points:fitted.points}
 }
 if(previousRecursion===null||recursion&&previousRecursion!==true)
  return finish(fitToSafeFrame(points,angles,frame,viewport))
 const resetAngles=!recursion&&previousRecursion===true
 const oriented=resetAngles?{...current,yawDeg:angles.yaw,pitchDeg:angles.pitch}:current
 return finish(followFraming(points,oriented,frame,viewport)??(resetAngles?oriented:null))
}
