import type {TraceEvent} from '../contracts/runtime'
import type {PresentationPlan,SceneModel,Vec3} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {camera as tokens} from '../theme/tokens'
import {anchorCorners} from '../world/presentationPlanner'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {fitForensicFraming} from './forensicFraming'
import {followFraming} from './followFraming'
import {fitToSafeFrame,projectionCamera,type OrbitPose,type Size} from './projection'
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
 if((event.type==='SET_FIELD'||event.type==='ARRAY_WRITE')&&event.importance==='major')return true
 if(event.type!=='EXECUTION_FACT')return false
 const fact=event.fact
 return ['enter','object','throw'].includes(fact.kind)||fact.kind==='write'&&event.importance==='major'&&['field','array-element'].includes(fact.target.kind)
}
/** Requirement 10's four-frame view is independent of Hero/Home headings.
 * The caller supplies null on explicit Follow entry; subsequent steps only
 * pan/dolly if captured subjects leave Safe Frame. This is pure presentation.
 */
export function guidedFollow(
 scene:SceneModel,plan:PresentationPlan,event:TraceEvent|null,current:OrbitPose,
 safe:Rect,viewport:Size,previousRecursion:boolean|null,
):{pose:OrbitPose|null;recursion:boolean;ids:readonly string[];points:readonly Vec3[]}{
 const chain=followInvocations(scene),recursion=chain.length>=4,ids=new Set(recursion?chain.slice(-4):chain.slice(-1))
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
  const heading=returning?plan.headings.find(heading=>heading.id==='RETURNS'):undefined
  if(heading){
   let next=pose??current
   const specs=[regionHeadingSpec(heading.id,heading.position)],bodies=[...plan.entities.keys()].map(id=>scene.entities[id].anchor)
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
  const fitted=fitForensicFraming(framedPoints,plan.exceptionPanel,scene.recording,framedPose??current,safe,viewport,(points,pose)=>followFraming(points,pose,safe,viewport)??pose)
  return{pose:fitted.pose===current?null:fitted.pose,recursion,ids:[...ids],points:fitted.points}
 }
 if(recursion&&(previousRecursion!==true||Math.abs(current.yawDeg-angles.yaw)>.001||Math.abs(current.pitchDeg-angles.pitch)>.001))
  return finish(fitToSafeFrame(points,angles,safe,viewport))
 const resetAngles=!recursion&&previousRecursion===true
 const oriented=resetAngles?{...current,yawDeg:angles.yaw,pitchDeg:angles.pitch}:current
 return finish(followFraming(points,oriented,safe,viewport)??(resetAngles?oriented:null))
}
