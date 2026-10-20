import type {PresentationPlan,SceneModel,Vec3,LayoutState} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {camera as tokens} from '../theme/tokens'
import {anchorCorners} from '../world/anchorGeometry'
import {fitToSafeFrame,frontFace,projectionCamera,screenPoint,type OrbitPose,type Size} from './projection'
import {contextInvocations as homeInvocations} from '../world/invocationContext'
import {regionHeadingSpec,structuralLabelFitPoints} from '../render/text/structuralLabelLayout'
export {contextInvocations as homeInvocations} from '../world/invocationContext'
export function homeFraming(scene:SceneModel,plan:PresentationPlan,safeFrame:Rect,viewport:Size,layout?:LayoutState):{pose:OrbitPose;ids:readonly string[];points:readonly Vec3[]} {
 const frames=homeInvocations(scene),angles=tokens.hero
 const requiredHeadings=plan.headings.filter(heading=>heading.id==='STACK'||heading.id==='HEAP')
 const specs=requiredHeadings.map(heading=>regionHeadingSpec(heading.id,heading.position))
 const bodies=[...[...plan.entities.keys()].map(id=>scene.entities[id].anchor),...plan.clusters.map(cluster=>cluster.anchor),...scene.io.map(io=>io.anchor),...(plan.exceptionPanel?[exceptionPanelAnchor(plan.exceptionPanel,scene.recording)]:[])]
 const fit=(points:readonly Vec3[])=>{
  let pose=fitToSafeFrame(points,angles,safeFrame,viewport),fitted=[...points]
  // Structural glyphs retain their projected size as the camera moves, so
  // their physical footprint changes with distance. Converge on the actual
  // new footprint instead of relying on extra zoom-out to conceal clipping.
  for(let refine=0;refine<16;refine++){
   const camera=projectionCamera(pose,viewport)
   fitted=[...points,...structuralLabelFitPoints(specs,bodies,camera,viewport)]
   if(fitted.every(point=>{const p=screenPoint(point,camera,viewport);return p.z>-1&&p.z<1&&p.x>=safeFrame.x&&p.x<=safeFrame.x+safeFrame.width&&p.y>=safeFrame.y&&p.y<=safeFrame.y+safeFrame.height}))break
   pose=fitToSafeFrame(fitted,angles,safeFrame,viewport)
  }
  return{pose,points:fitted}
 }
 const headings=requiredHeadings.flatMap(heading=>{
  const position=heading.position
  return[position,[position[0]+2.4,position[1]+.4,position[2]] as Vec3]
 })
 const ids=[...frames],points=[...headings,...frames.flatMap(id=>anchorCorners(scene.entities[id].anchor)),...(plan.exceptionPanel?anchorCorners(exceptionPanelAnchor(plan.exceptionPanel,scene.recording)):[])]
 let fitted=fit(points)
 const candidates=scene.order.objects.map(id=>scene.entities[id]).filter(node=>node.anchor.region==='heap'||node.anchor.region==='library').sort((a,b)=>Number(a.anchor.region==='library')-Number(b.anchor.region==='library')||Math.hypot(...a.anchor.position)-Math.hypot(...b.anchor.position)||a.id.localeCompare(b.id))
 const groups=new Set<string>()
 let project=0,external=0
 for(const node of candidates){
  if(node.kind==='class'||node.kind==='frame')continue
  const path=layout?.placement[node.id]?.clusterPath,group=`${node.anchor.region}:${path?JSON.stringify(path):`${node.ownership}:${node.title}`}`
  if(groups.has(group)||(node.anchor.region==='heap'?project>=12:external>=2))continue
  const proposed=[...points,...anchorCorners(node.anchor)],candidate=fit(proposed),camera=projectionCamera(candidate.pose,viewport)
  const readable=[...ids,node.id].every(id=>{const screen=frontFace(scene.entities[id].anchor).map(point=>screenPoint(point,camera,viewport));return Math.max(...screen.map(point=>point.y))-Math.min(...screen.map(point=>point.y))>=viewport.height*.04})
  if(!readable)continue
  groups.add(group);fitted=candidate;points.push(...anchorCorners(node.anchor));ids.push(node.id);if(node.anchor.region==='heap')project++;else external++
 }
 return{pose:fitted.pose,ids,points:fitted.points}
}
