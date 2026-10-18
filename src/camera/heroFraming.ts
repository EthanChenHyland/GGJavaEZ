import type {PresentationPlan,SceneModel,Vec3,WorldAnchor} from '../contracts/worldV2'
import type {Rect} from '../shell/shellLayout'
import {camera as tokens} from '../theme/tokens'
import {anchorCorners} from '../world/anchorGeometry'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {alignHeroBands} from './heroBands'
import {fitToSafeFrame,frontFace,projectionCamera,screenPoint,type OrbitPose,type Size} from './projection'
import {Vector3} from 'three'
import {placeStructuralLabels,projectStructuralObstacle,regionHeadingSpec,structuralLabelFitPoints} from '../render/text/structuralLabelLayout'
import {projectedPlaneFontPixels} from '../render/text/textSystem'
export interface HeroViewport {safeFrame:Rect;viewport:Size}
type Headings=PresentationPlan['headings']
function heroPoints(scene:SceneModel,mandatory:Iterable<string>,headings:Headings,heapIds:readonly string[]){
 const ids=new Set([...scene.liveStack,...mandatory,...heapIds]),points:Vec3[]=[...ids].flatMap(id=>scene.entities[id]?anchorCorners(scene.entities[id].anchor):[])
 for(const heading of headings.filter(heading=>heading.id==='STACK'||heading.id==='HEAP'))points.push(heading.position,[heading.position[0]+2.4,heading.position[1]+.4,heading.position[2]])
 return points
}
/** The planner and camera solve the same actual represented heap cut. Null
 * rejects optional context; it never removes correctness-required identities. */
export function solveHeroFraming(scene:SceneModel,mandatory:Iterable<string>,headings:Headings,heapIds:readonly string[],safe:Rect,viewport:Size,readable=false,clearance:readonly WorldAnchor[]=[]):OrbitPose|null{
 const mandatoryIds=[...mandatory],points=heroPoints(scene,mandatoryIds,headings,heapIds)
 const bodyIds=new Set([...scene.liveStack,...mandatoryIds,...heapIds]),bodies=[...[...bodyIds].flatMap(id=>scene.entities[id]?[scene.entities[id].anchor]:[]),...clearance,...scene.io.map(io=>io.anchor)]
 const specs=headings.filter(heading=>heading.id==='STACK'||heading.id==='HEAP').map(heading=>regionHeadingSpec(heading.id,heading.position))
 const angles=scene.liveStack.length>=4?tokens.recursion:tokens.hero,base=fitToSafeFrame(points,angles,safe,viewport)
 if(scene.liveStack.length===0||scene.liveStack.length>=4||!heapIds.length)return base
 const headingPoints=(camera:ReturnType<typeof projectionCamera>)=>structuralLabelFitPoints(specs,bodies,camera,viewport)
 const readableFaces=(camera:ReturnType<typeof projectionCamera>)=>!readable||scene.liveStack.every(id=>frontFace(scene.entities[id].anchor).every(point=>projectedPlaneFontPixels(.32,new Vector3(...point),camera,viewport)>=11))
 const visibleHeadings=(camera:ReturnType<typeof projectionCamera>)=>placeStructuralLabels(specs,camera,viewport,safe,bodies.flatMap(body=>{const obstacle=projectStructuralObstacle(body,camera,viewport);return obstacle?[obstacle]:[]})).every(label=>label.visible)
 if(viewport.width<1024){let pose=base;for(let refine=0;refine<4;refine++)pose=fitToSafeFrame([...points,...headingPoints(projectionCamera(pose,viewport))],angles,safe,viewport);const camera=projectionCamera(pose,viewport);return readableFaces(camera)&&visibleHeadings(camera)?pose:null}
 const attempt=(distance:number)=>{
  let pose:OrbitPose|null={...base,distance},fitted=points
  for(let refine=0;refine<3;refine++){
   const camera=projectionCamera(pose,viewport)
   fitted=[...points,...headingPoints(camera)]
   pose=alignHeroBands(scene,pose,fitted,safe,viewport,heapIds)
   if(!pose)return null
  }
  const camera=projectionCamera(pose,viewport)
  if(!visibleHeadings(camera))return null
  if(!readableFaces(camera))return null
  return fitted.every(point=>{const p=screenPoint(point,camera,viewport);return p.z>-1&&p.z<1&&p.x>=safe.x-1e-7&&p.x<=safe.x+safe.width+1e-7&&p.y>=safe.y-1e-7&&p.y<=safe.y+safe.height+1e-7})?pose:null
 }
 let lower=Math.max(tokens.minDistance,base.distance/1.08)
 for(let step=0;step<=48;step++){
  const upper=Math.max(tokens.minDistance,base.distance/1.08)*1.025**step,possible=attempt(upper)
  if(possible){let high=upper,low=lower,result=possible;for(let refine=0;refine<24;refine++){const mid=(low+high)/2,candidate=attempt(mid);if(candidate){high=mid;result=candidate}else low=mid}return result}
  lower=upper
 }
 return null
}
/** Run entry frames the live tower, mandatory evidence and region headings.
 * Home instead admits readable group representatives at its closest distance.
 * Both are pure camera decisions over the same unchanged world anchors. */
export function heroFraming(scene:SceneModel,plan:PresentationPlan,safe:Rect,viewport:Size):OrbitPose{
 const heapIds=[...plan.entities.keys()].filter(id=>scene.entities[id].anchor.region==='heap')
 const points=heroPoints(scene,plan.pinned,plan.headings,heapIds)
 if(plan.exceptionPanel)points.push(...anchorCorners(exceptionPanelAnchor(plan.exceptionPanel,scene.recording)))
 const base=fitToSafeFrame(points,scene.liveStack.length>=4?tokens.recursion:tokens.hero,safe,viewport)
 // Forensic framing retains its actual panel. Physically incompatible mandatory
 // worlds retain the truthful fit; only optional admission uses rejection.
 const clearance=[...[...plan.entities.keys()].map(id=>scene.entities[id].anchor),...plan.clusters.map(cluster=>cluster.anchor)]
 return plan.exceptionPanel?base:solveHeroFraming(scene,plan.pinned,plan.headings,heapIds,safe,viewport,false,clearance)??base
}
