import type {PresentationPlan,SceneModel,Vec3} from '../contracts/worldV2'
import type {Rect} from '../shell/shellLayout'
import {camera as tokens} from '../theme/tokens'
import {anchorCorners} from '../world/presentationPlanner'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {alignHeroBands} from './heroBands'
import {fitToSafeFrame,projectionCamera,screenPoint,type OrbitPose,type Size} from './projection'
/** Run entry frames the live tower, mandatory evidence and region headings.
 * Home instead admits readable group representatives at its closest distance.
 * Both are pure camera decisions over the same unchanged world anchors. */
export function heroFraming(scene:SceneModel,plan:PresentationPlan,safe:Rect,viewport:Size):OrbitPose{
 const ids=new Set([...scene.liveStack,...plan.pinned]),points:Vec3[]=[...ids].flatMap(id=>scene.entities[id]?anchorCorners(scene.entities[id].anchor):[])
 for(const heading of plan.headings.filter(heading=>heading.id==='STACK'||heading.id==='HEAP'))points.push(heading.position,[heading.position[0]+2.4,heading.position[1]+.4,heading.position[2]])
 if(plan.exceptionPanel)points.push(...anchorCorners(exceptionPanelAnchor(plan.exceptionPanel,scene.recording)))
 const base=fitToSafeFrame(points,scene.liveStack.length>=4?tokens.recursion:tokens.hero,safe,viewport)
 const attempt=(distance:number)=>{
  const pose=alignHeroBands(scene,{...base,distance},points,safe,viewport)
  if(!pose)return null
  const camera=projectionCamera(pose,viewport)
  return points.every(point=>{const p=screenPoint(point,camera,viewport);return p.z>-1&&p.z<1&&p.x>=safe.x&&p.x<=safe.x+safe.width&&p.y>=safe.y&&p.y<=safe.y+safe.height})?pose:null
 }
 const immediate=attempt(base.distance);if(immediate)return immediate
 // A bounded solve permits the horizontal composition without changing the
 // mandatory set or sacrificing its Safe Frame fit. Huge worlds fall back to
 // the truthful required-evidence fit when canonical hero bands are impossible.
 let lower=base.distance
 for(let step=1;step<=32;step++){
  const upper=base.distance*1.04**step,possible=attempt(upper)
  if(possible){let high=upper,low=lower,result=possible;for(let refine=0;refine<24;refine++){const mid=(low+high)/2,candidate=attempt(mid);if(candidate){high=mid;result=candidate}else low=mid}return result}
  lower=upper
 }
 return base
}
