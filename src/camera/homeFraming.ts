import {Vector3} from 'three'
import {projectedPlaneFontPixels} from '../render/text/textSystem'
import type {PresentationPlan,SceneModel,Vec3,LayoutState} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {buildExceptionPanelModel,layoutExceptionPanel} from '../render/exceptionPanelModel'
import {projectExceptionPanel} from '../render/exceptionPanelPresentation'
import {camera as tokens} from '../theme/tokens'
import {anchorCorners} from '../world/anchorGeometry'
import {compositionFrame,fitToSafeFrame,frontFace,projectionCamera,screenPoint,type OrbitPose,type Size} from './projection'
import {contextInvocations as homeInvocations,isBroadCompletedWorld} from '../world/invocationContext'
import {regionHeadingSpec,structuralLabelFitPoints} from '../render/text/structuralLabelLayout'
export {contextInvocations as homeInvocations} from '../world/invocationContext'
export function homeFraming(scene:SceneModel,plan:PresentationPlan,safeFrame:Rect,viewport:Size,layout?:LayoutState):{pose:OrbitPose;ids:readonly string[];points:readonly Vec3[]} {
 const frames=homeInvocations(scene)
 const angles=scene.liveStack.length>=tokens.recursion.depth?tokens.recursion:tokens.hero
 const area=compositionFrame(safeFrame,viewport)
 const requiredHeadings=plan.headings.filter(heading=>heading.id==='STACK'||heading.id==='HEAP'||heading.id==='RETURNS'||heading.id==='CLASS STATE')
 const specs=requiredHeadings.map(heading=>regionHeadingSpec(heading.id,heading.position))
 const bodies=[...[...plan.entities.keys()].map(id=>scene.entities[id].anchor),...plan.clusters.map(cluster=>cluster.anchor),...scene.io.map(io=>io.anchor),...(plan.exceptionPanel?[exceptionPanelAnchor(plan.exceptionPanel,scene.recording)]:[])]
 const evidence=plan.exceptionPanel?{anchor:exceptionPanelAnchor(plan.exceptionPanel,scene.recording),layout:layoutExceptionPanel(buildExceptionPanelModel(plan.exceptionPanel.content,scene.recording.state))}:null
 const fit=(points:readonly Vec3[])=>{
  let pose=fitToSafeFrame(points,angles,area,viewport),fitted=[...points]
  // Structural glyphs retain their projected size as the camera moves, so
  // their physical footprint changes with distance. Converge on the actual
  // new footprint instead of relying on extra zoom-out to conceal clipping.
  for(let refine=0;refine<(evidence?32:16);refine++){
   const camera=projectionCamera(pose,viewport)
   const presented=evidence?projectExceptionPanel(evidence.anchor,evidence.layout,camera,viewport,area):null
   const clearance=presented?bodies.map(body=>body.entityId===presented.anchor.entityId?presented.anchor:body):bodies
   fitted=[...points,...(presented?anchorCorners(presented.anchor):[]),...structuralLabelFitPoints(specs,clearance,camera,viewport)]
   if(fitted.every(point=>{const p=screenPoint(point,camera,viewport);return p.z>-1&&p.z<1&&p.x>=area.x&&p.x<=area.x+area.width&&p.y>=area.y&&p.y<=area.y+area.height}))break
   pose=fitToSafeFrame(fitted,angles,area,viewport)
  }
  return{pose,points:fitted}
 }
 const objects=scene.order.objects.map(id=>scene.entities[id]).filter(node=>node.kind!=='frame'&&node.kind!=='class')
 const subjects=new Set(scene.liveStack.length||scene.cursor<scene.liveHead?scene.cursorEvent?.subjects:[])
 const foreground=objects.filter(node=>node.anchor.region==='heap'&&(node.ownership==='PROJECT'||node.kind==='array'&&node.length>0||node.kind==='collection'))
 const related=new Set(scene.references.filter(reference=>frames.includes(reference.sourceId)).map(reference=>reference.targetId))
 const selected=(id:string)=>{const highlight=plan.entities.get(id)?.highlight;return highlight==='selected'||highlight==='focus'}
 const selectedWindow=objects.find(node=>node.kind==='array'&&selected(node.id)
   &&[...plan.cellWindows.get(node.id)?.budgetOverflow.reasons.values()??[]].some(reasons=>reasons.includes('selected')))
 const subject=selectedWindow
    ??foreground.find(node=>subjects.has(node.id))
    ??(isBroadCompletedWorld(scene)?foreground.find(node=>node.kind==='object'):undefined)
    ??foreground.find(node=>related.has(node.id))
    ??foreground[0]
    ??objects.find(node=>node.anchor.region==='heap')
 const companion=subject&&objects.find(node=>node.kind==='object'&&node.anchor.region==='heap'
   &&node.ownership!=='PROJECT'&&scene.references.some(ref=>ref.sourceId===subject.id&&ref.targetId===node.id))
 const classState=scene.order.classes.find(id=>subjects.has(id)||selected(id))??scene.order.classes[0]
 const ids=[...new Set([...frames,...(subject?[subject.id]:[]),...(classState?[classState]:[])])]
 const points=[...ids.flatMap(id=>anchorCorners(scene.entities[id].anchor)),...requiredHeadings.map(heading=>heading.position)]
 // The moving glyph footprints are included by fit, including the panel.
 let fitted=fit(points)
 const coreDistance=fitted.pose.distance
 if(companion){
  const corners=anchorCorners(companion.anchor),candidate=fit([...points,...corners])
  if(candidate.pose.distance<=coreDistance*tokens.home.contextScale){
   ids.push(companion.id);points.push(...corners);fitted=candidate
  }
 }
 const foregroundIds=new Set(foreground.map(node=>node.id))
 const candidates=[...foreground,...objects.filter(node=>!foregroundIds.has(node.id))]
 const compactHeap=!frames.length&&foreground.length<=3
 const groups=new Set<string>()
 const group=(node:(typeof objects)[number])=>{
  const path=layout?.placement[node.id]?.clusterPath
  return `${node.anchor.region}:${path?JSON.stringify(path):`${node.ownership}:${node.title}`}`
 }
 if(subject)groups.add(group(subject))
 if(companion&&ids.includes(companion.id))groups.add(group(companion))
 for(const node of candidates){
  if(groups.size>=tokens.home.external+(viewport.width<1024?1:2))break
  if(node.id===subject?.id||node.anchor.region!=='heap'&&node.anchor.region!=='library')continue
  const key=group(node)
  if(groups.has(key))continue
  const proposed=[...points,...anchorCorners(node.anchor)],candidate=fit(proposed)
  if(candidate.pose.distance>coreDistance*tokens.home.contextScale&&!(compactHeap&&foregroundIds.has(node.id)))continue
  const camera=projectionCamera(candidate.pose,viewport)
  const faceReadable=(id:string)=>{
   const face=frontFace(scene.entities[id].anchor),screen=face.map(point=>screenPoint(point,camera,viewport))
   const height=Math.max(...screen.map(point=>point.y))-Math.min(...screen.map(point=>point.y))
   return height>=viewport.height*tokens.home.minRepH&&face.every(point=>projectedPlaneFontPixels(.32,new Vector3(...point),camera,viewport)>=11)
  }
  if(![...ids,node.id].every(faceReadable))continue
  groups.add(key);fitted=candidate;points.push(...anchorCorners(node.anchor));ids.push(node.id)
 }
 return{pose:fitted.pose,ids,points:fitted.points}
}
