import type {TraceEvent} from '../contracts/runtime'
import type {PresentationPlan,SceneModel,Vec3} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {camera as tokens} from '../theme/tokens'
import {anchorCorners} from '../world/presentationPlanner'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {followFraming} from './followFraming'
import {fitToSafeFrame,type OrbitPose,type Size} from './projection'

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
 if(recursion&&(previousRecursion!==true||Math.abs(current.yawDeg-angles.yaw)>.001||Math.abs(current.pitchDeg-angles.pitch)>.001))
  return{pose:fitToSafeFrame(points,angles,safe,viewport),recursion,ids:[...ids],points}
 const resetAngles=!recursion&&previousRecursion===true
 const oriented=resetAngles?{...current,yawDeg:angles.yaw,pitchDeg:angles.pitch}:current
 return{pose:followFraming(points,oriented,safe,viewport)??(resetAngles?oriented:null),recursion,ids:[...ids],points}
}
