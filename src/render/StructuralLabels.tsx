import {useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Group,PerspectiveCamera,Vector3} from 'three'
import type {WorldRenderSnapshot} from './worldRenderSnapshot'
import type {Rect} from '../shell/shellLayout'
import {color,presentationScale,world} from '../theme/tokens'
import {ClusterLabels,ClusterSummaryLabel,clusterLabelParts,clusterLabelNames,clusterSummary} from './ClusterLabels'
import {WorldText} from './FaceText'
import {fitWorldText,projectedPlaneFontPixels,textAdvance} from './text/textSystem'
import {faceHeading} from './text/faceTypography'
import {arrayTitlePlate} from '../world/arrayCellGeometry'
import {placeStructuralLabels,projectStructuralObstacle,regionHeadingSpec,regionHeadingStyle,type StructuralLabelSpec,type StructuralObstacle} from './text/structuralLabelLayout'
import {solidsInSnapshot} from './SolidBatch'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {returnCaptions} from './returnCaptions'
import {isDenseWorld} from '../world/presentationDensity'

export function StructuralLabels({snapshot,safeFrame,inspectorRect}:{snapshot:WorldRenderSnapshot;safeFrame:Rect;inspectorRect?:Rect|null}) {
 const { scene, plan } = snapshot.read()
 const {camera,size}=useThree(),groups=useRef(new Map<string,Group>()),cache=useRef<{entries:readonly StructuralLabelSpec[];bodies:readonly unknown[];key:string}|null>(null)
 const displayNames=useMemo(()=>clusterLabelNames(plan.clusters),[plan.clusters])
 const dense=isDenseWorld(scene),compact=size.width<1024||size.height<760
 const clusters=useMemo(()=>{
  if(!dense)return plan.clusters
  return [...plan.clusters].sort((a,b)=>Number(b.selected)-Number(a.selected)||b.members-a.members||a.id.localeCompare(b.id))
    .slice(0,presentationScale.clusterLabels[compact?'compact':'wide'])
 },[plan.clusters,dense,compact])
 const summaries=useMemo(()=>new Map(clusters.filter(cluster=>dense||plan.detailLevel==='FAR'&&cluster.members>1)
   .map(cluster=>[cluster.id,clusterSummary(cluster,scene,displayNames.get(cluster.id)??cluster.label)])),[clusters,dense,displayNames,plan.detailLevel,scene])
 const subjects=useMemo(()=>{
  const labels=new Map<string,{name:string;tint:string;title:ReturnType<typeof faceHeading>['title'];spec:StructuralLabelSpec}>()
  if(!dense)return labels
  const path=plan.exceptionPanel?.content
  const selection=[...plan.entities.values()].find(item=>item.highlight==='selected'||item.highlight==='focus')?.id
  const ids=new Set([selection,path?.current?.frameId,path?.throwFrameId,path?.catchFrameId,path?.unwound.at(-1),scene.liveStack.at(-1),scene.cursorEvent?.subjects[0]])
  for(const id of ids){
   const node=id?scene.entities[id]:undefined
   if(!id||!node||!plan.pinned.has(id))continue
   const {position:[x,y,z],size:[,h,d]}=node.kind==='array'?arrayTitlePlate(node.anchor):node.anchor
   const size=.32,name=fitWorldText(node.title,4.8,size,600,0,25,'end'),width=textAdvance(name,600)*size+.06
   const spec:StructuralLabelSpec={id:`subject:${id}`,kind:'subject',position:[x,y+h/2+.35,z+d/2+.09],size,localBounds:[-width/2,width/2,-.2,.2],priority:-3,count:1,minimumPx:presentationScale.clusterLabelMinimumPx,maximumScale:6}
   const tint=path&&[path.current?.frameId,path.throwFrameId,path.catchFrameId,...path.unwound].includes(id)?color.semantic.exception:color.ui.text
   labels.set(spec.id,{name,tint,title:faceHeading(node).title,spec})
  }
  return labels
 },[dense,plan,scene])
 const captions=useMemo(()=>returnCaptions(scene,plan.curves),[scene.returnFlows,plan.curves])
 const labelledBundles=useMemo(()=>{
  const selected=plan.bundles.filter(bundle=>bundle.widthPx===world.connector.selectedPx)
  const summaries=plan.detailLevel==='FAR'
    ?plan.bundles.filter(bundle=>bundle.widthPx!==world.connector.selectedPx&&bundle.kind==='connector'&&bundle.count>=8)
      .sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id)).slice(0,3):[]
  return [...selected,...summaries]
 },[plan.bundles,plan.detailLevel])
 const entries=useMemo<StructuralLabelSpec[]>(()=>[
  ...[...subjects.values()].map(subject=>subject.spec),
  ...captions.map(caption=>({id:caption.id,kind:'return' as const,position:caption.position,size:caption.operands?caption.operandSize:caption.size,localBounds:[-.08,caption.width+.08,caption.operands?-.5:-.2,.2] as const,priority:0,count:1})),
  ...clusters.filter(cluster=>summaries.has(cluster.id)||clusterLabelParts(cluster).fits).map(cluster=>{
   const [x,y,z]=cluster.anchor.position,[w,h,d]=cluster.anchor.size,summary=summaries.get(cluster.id)
   const base={id:cluster.id,kind:'cluster' as const,position:[x,y+h/2+.12,z+d/2+.085] as const,priority:cluster.selected?-3:2,count:cluster.members}
   return summary?{...base,size:summary.size,localBounds:[-summary.width/2,summary.width/2,-.02,.66] as const,minimumPx:presentationScale.clusterLabelMinimumPx,maximumScale:6}
    :{...base,size:.3,localBounds:[-w/2+.2,w/2-.2,.08,.83] as const}
  }),
  ...plan.headings.map(heading=>regionHeadingSpec(heading.id,heading.position)),
  ...labelledBundles.map(bundle=>{const text=`${bundle.count} ${bundle.kind==='flow'?'flows':bundle.kind==='binding-history'?'past bindings':'references'}`,width=textAdvance(text,500)*.3;return{id:bundle.id,kind:'bundle' as const,position:bundle.points[Math.floor(bundle.points.length/2)],size:.3,localBounds:[-width/2,width/2,-.15,.15] as const,priority:bundle.widthPx===world.connector.selectedPx?0:3,count:bundle.count}}),
 ],[clusters,summaries,plan.headings,labelledBundles,captions,subjects])
 const bodies=useMemo(()=>[...solidsInSnapshot(snapshot).filter(solid=>solid.role!=='face').map(solid=>solid.anchor),...scene.io.map(io=>io.anchor),...(plan.exceptionPanel?[exceptionPanelAnchor(plan.exceptionPanel,scene.recording)]:[])],[snapshot,scene.io,scene.recording,plan.exceptionPanel])
 useFrame(()=>{
  if(!(camera instanceof PerspectiveCamera))return
  const key=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,size.width,size.height,safeFrame,inspectorRect])
  if(cache.current?.entries===entries&&cache.current.bodies===bodies&&cache.current.key===key)return
  cache.current={entries,bodies,key}
  const blocked:StructuralObstacle[]=inspectorRect?[inspectorRect]:[]
  for(const body of bodies){const obstacle=projectStructuralObstacle(body,camera,size);if(obstacle)blocked.push(obstacle)}
  const requested=entries.filter(entry=>{
   const subject=subjects.get(entry.id)
   if(!subject)return true
   const readable=projectedPlaneFontPixels(subject.title.size,new Vector3(...subject.title.position),camera,size)>=11
   if(readable){const group=groups.current.get(entry.id);if(group)group.visible=false}
   return !readable
  })
  for(const label of placeStructuralLabels(requested,camera,size,safeFrame,blocked)){
   const group=groups.current.get(label.id);if(!group)continue
   group.visible=label.visible;group.position.set(...label.position);group.scale.setScalar(label.scale);group.updateWorldMatrix(true,true)
  }
 },.25)
 return <group name="structural-labels">{entries.map(entry=>{
  const cluster=entry.kind==='cluster'?clusters.find(cluster=>cluster.id===entry.id):null,heading=entry.kind==='heading'?plan.headings.find(heading=>heading.id===entry.id):null,bundle=entry.kind==='bundle'?plan.bundles.find(bundle=>bundle.id===entry.id):null
  const summary=cluster?summaries.get(cluster.id):null,subject=subjects.get(entry.id)
  const caption=entry.kind==='return'?captions.find(caption=>caption.id===entry.id):null
  return <group key={entry.id} name={`structural-label:${entry.id}`} ref={group=>{if(group)groups.current.set(entry.id,group);else groups.current.delete(entry.id)}} position={[...entry.position]} userData={{structuralLabel:entry}}>
   {subject?<WorldText position={[0,0,0]} size={entry.size} weight={600} width={entry.localBounds[1]*2} align="center" tint={subject.tint} minimumPixels={presentationScale.clusterLabelMinimumPx}>{subject.name}</WorldText>:caption?<>
    <mesh position={[caption.width/2,caption.operands?-.15:0,-.025]} userData={{runtimeBloomRole:'protected'}} raycast={()=>undefined}><planeGeometry args={[caption.width+.16,caption.operands?.7:.4]}/><meshBasicMaterial color={color.stack.chip} transparent opacity={caption.opacity} depthWrite={false} toneMapped={false}/></mesh>
    <WorldText position={[0,0,0]} size={caption.size} weight={600} width={caption.width} minimumPixels={12} opacity={caption.opacity} tint={color.semantic.return} returnText={{flowId:caption.flowId,kind:'value'}}>{caption.primary}</WorldText>
    {caption.operands&&<WorldText position={[0,-.32,0]} size={caption.operandSize} width={caption.width} minimumPixels={12} opacity={caption.opacity} tint={color.semantic.return} returnText={{flowId:caption.flowId,kind:'operands'}}>{caption.operands}</WorldText>}
   </>:cluster?summary?<ClusterSummaryLabel cluster={cluster} summary={summary}/>:<ClusterLabels cluster={cluster} displayLabel={displayNames.get(cluster.id)}/>:heading?<WorldText position={[0,0,0]} size={regionHeadingStyle.size} weight={regionHeadingStyle.weight} tracking={regionHeadingStyle.tracking} width={entry.localBounds[1]} minimumPixels={12} opacity={heading.opacity} tint={heading.id==='STACK'?color.stack.edge:heading.id==='HEAP'?color.heap.edge:heading.id==='RETURNS'?color.semantic.return:color.class.edge}>{heading.id}</WorldText>:bundle?<WorldText position={[0,0,0]} size={.3} weight={500} width={entry.localBounds[1]-entry.localBounds[0]+.02} align="center" minimumPixels={12} opacity={bundle.opacity} tint={color.ui.textSecondary}>{`${bundle.count} ${bundle.kind==='flow'?'flows':bundle.kind==='binding-history'?'past bindings':'references'}`}</WorldText>:null}
  </group>
 })}</group>
}
