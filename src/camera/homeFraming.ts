import type {PresentationPlan,SceneModel,Vec3,LayoutState} from '../contracts/worldV2'
import type {Rect} from '../shell/shellLayout'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {camera as tokens} from '../theme/tokens'
import {anchorCorners} from '../world/presentationPlanner'
import {fitToSafeFrame,frontFace,projectionCamera,screenPoint,type OrbitPose,type Size} from './projection'
/** Current/deepest invocation plus three actual caller ancestors; completed worlds use most recent entry. */
export function homeInvocations(scene:SceneModel):string[] {
 const latest=scene.liveStack.at(-1)??scene.order.frames.at(-1),ids:string[]=[]
 let id=latest
 while(id&&ids.length<4){const frame=scene.entities[id];if(frame?.kind!=='frame')break;ids.unshift(id);id=frame.callerId??undefined}
 return ids
}
export function homeFraming(scene:SceneModel,plan:PresentationPlan,safeFrame:Rect,viewport:Size,layout?:LayoutState):{pose:OrbitPose;ids:readonly string[];points:readonly Vec3[]} {
 const frames=homeInvocations(scene),frame=scene.entities[frames[0]],angles=tokens.hero
 const headings=plan.headings.filter(heading=>heading.id==='STACK'||heading.id==='HEAP').flatMap(heading=>{
  const position:Vec3=heading.id==='STACK'&&frame?[frame.anchor.position[0],frame.anchor.position[1]+frame.anchor.size[1]/2+.75,frame.anchor.position[2]+frame.anchor.size[2]/2]:heading.position
  return[position,[position[0]+2.4,position[1]+.4,position[2]] as Vec3]
 })
 const ids=[...frames],points=[...headings,...frames.flatMap(id=>anchorCorners(scene.entities[id].anchor)),...(plan.exceptionPanel?anchorCorners(exceptionPanelAnchor(plan.exceptionPanel,scene.recording)):[])]
 let pose=fitToSafeFrame(points,angles,safeFrame,viewport)
 const candidates=scene.order.objects.map(id=>scene.entities[id]).filter(node=>node.anchor.region==='heap'||node.anchor.region==='library').sort((a,b)=>Number(a.anchor.region==='library')-Number(b.anchor.region==='library')||Math.hypot(...a.anchor.position)-Math.hypot(...b.anchor.position)||a.id.localeCompare(b.id))
 const groups=new Set<string>()
 let project=0,external=0
 for(const node of candidates){
  if(node.kind==='class'||node.kind==='frame')continue
  const path=layout?.placement[node.id]?.clusterPath,group=`${node.anchor.region}:${path?JSON.stringify(path):`${node.ownership}:${node.title}`}`
  if(groups.has(group)||(node.anchor.region==='heap'?project>=12:external>=2))continue
  const proposed=[...points,...anchorCorners(node.anchor)],candidate=fitToSafeFrame(proposed,angles,safeFrame,viewport),camera=projectionCamera(candidate,viewport)
  const readable=[...ids,node.id].every(id=>{const screen=frontFace(scene.entities[id].anchor).map(point=>screenPoint(point,camera,viewport));return Math.max(...screen.map(point=>point.y))-Math.min(...screen.map(point=>point.y))>=viewport.height*.04})
  if(!readable)continue
  groups.add(group);pose=candidate;points.push(...anchorCorners(node.anchor));ids.push(node.id);if(node.anchor.region==='heap')project++;else external++
 }
 return{pose,ids,points}
}
