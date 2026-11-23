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
import {isDenseWorld,overviewHeapSubject} from '../world/presentationDensity'
import {arrayBackplate,arrayTitlePlate} from '../world/arrayCellGeometry'
export {contextInvocations as homeInvocations} from '../world/invocationContext'
export function homeFraming(scene:SceneModel,plan:PresentationPlan,safeFrame:Rect,viewport:Size,layout?:LayoutState):{pose:OrbitPose;ids:readonly string[];points:readonly Vec3[]} {
 const frames=homeInvocations(scene)
 const dense=isDenseWorld(scene)
 const forensic=plan.exceptionPanel?.content
 const angles=scene.liveStack.length>=tokens.recursion.depth?tokens.recursion:tokens.hero
 const area=compositionFrame(safeFrame,viewport)
 const requiredHeadings=dense&&forensic?[]:plan.headings
 const specs=requiredHeadings.map(heading=>regionHeadingSpec(heading.id,heading.position))
 const body=(id:string)=>{
  const node=scene.entities[id],window=plan.cellWindows.get(id)
  return node.kind==='array'&&window?.virtualized?arrayBackplate(node.anchor,window):node.anchor
 }
 const bodyPoints=(id:string)=>{
  const node=scene.entities[id],window=plan.cellWindows.get(id)
  return node.kind==='array'&&window?.virtualized
   ?[...anchorCorners(body(id)),...anchorCorners(arrayTitlePlate(node.anchor)),...[...window.mapping.values()].flatMap(cell=>anchorCorners(cell.anchor))]
   :anchorCorners(body(id))
 }
 const bodies=[...[...plan.entities.keys()].map(body),...plan.clusters.map(cluster=>cluster.anchor),...scene.io.map(io=>io.anchor),...(plan.exceptionPanel?[exceptionPanelAnchor(plan.exceptionPanel,scene.recording)]:[])]
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
 const selectedId=dense&&!plan.framing.focus?[...plan.entities.keys()].find(selected):undefined
 const selectedWindow=objects.find(node=>node.kind==='array'&&selected(node.id)
   &&[...plan.cellWindows.get(node.id)?.budgetOverflow.reasons.values()??[]].some(reasons=>reasons.includes('selected')))
 const subject=selectedWindow
    ??(selectedId&&scene.entities[selectedId].anchor.region==='heap'?scene.entities[selectedId]:undefined)
    ??(dense&&forensic?.exceptionId?scene.entities[forensic.exceptionId]:undefined)
    ??foreground.find(node=>subjects.has(node.id))
    ??(dense?scene.entities[overviewHeapSubject(scene,frames.at(-1))??'']:undefined)
    ??(isBroadCompletedWorld(scene)?foreground.find(node=>node.kind==='object'):undefined)
    ??foreground.find(node=>related.has(node.id))
    ??foreground[0]
    ??objects.find(node=>node.anchor.region==='heap')
 const companion=subject&&objects.find(node=>node.kind==='object'&&node.anchor.region==='heap'
   &&node.ownership!=='PROJECT'&&scene.references.some(ref=>ref.sourceId===subject.id&&ref.targetId===node.id))
 const classState=scene.order.classes.find(id=>subjects.has(id)||selected(id))??(dense&&forensic?undefined:scene.order.classes[0])
 const path=forensic?[forensic.throwFrameId,...forensic.unwound.slice(-4),forensic.catchFrameId]:[]
 const ids=[...new Set([...frames,subject?.id,classState,selectedId,...path])].filter((id):id is string=>!!id&&!!scene.entities[id])
 const points=[...ids.flatMap(bodyPoints),...requiredHeadings.map(heading=>heading.position)]
 if(dense&&!forensic&&scene.io.length&&subject?.kind!=='array')points.push(...scene.io.flatMap(port=>anchorCorners(port.anchor)))
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
 const groupLimit=dense?(compactHeap?Math.max(2,foreground.length):2):tokens.home.external+(viewport.width<1024?1:2)
 const group=(node:(typeof objects)[number])=>{
  const path=layout?.placement[node.id]?.clusterPath
  return `${node.anchor.region}:${path?JSON.stringify(path):`${node.ownership}:${node.title}`}`
 }
 if(subject&&subject.kind!=='frame'&&subject.kind!=='class')groups.add(group(subject))
 if(companion&&ids.includes(companion.id))groups.add(group(companion))
 // Dense Home ends with the recorded context and at most two representatives.
 // Candidate trials are bounded so a wall of distant objects cannot drive fit.
 for(const node of dense?(forensic?[]:candidates.slice(0,tokens.home.groups)):candidates){
  if(groups.size>=groupLimit)break
  if(node.id===subject?.id||node.anchor.region!=='heap'&&node.anchor.region!=='library')continue
  const key=group(node)
  if(groups.has(key))continue
  const corners=bodyPoints(node.id),candidate=fit([...points,...corners])
  if(candidate.pose.distance>coreDistance*tokens.home.contextScale&&!(compactHeap&&foregroundIds.has(node.id)))continue
  const camera=projectionCamera(candidate.pose,viewport)
  const faceReadable=(id:string)=>{
   const node=scene.entities[id],face=frontFace(node.kind==='array'?arrayTitlePlate(node.anchor):node.anchor),screen=face.map(point=>screenPoint(point,camera,viewport))
   const height=Math.max(...screen.map(point=>point.y))-Math.min(...screen.map(point=>point.y))
   return height>=viewport.height*tokens.home.minRepH&&face.every(point=>projectedPlaneFontPixels(.32,new Vector3(...point),camera,viewport)>=11)
  }
  if(![...ids,node.id].every(faceReadable))continue
  groups.add(key);fitted=candidate;points.push(...corners);ids.push(node.id)
 }
 return{pose:fitted.pose,ids,points:fitted.points}
}
