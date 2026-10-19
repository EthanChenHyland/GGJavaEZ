import {useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Group,PerspectiveCamera} from 'three'
import type {PresentationPlan,SceneModel} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {color} from '../theme/tokens'
import {ClusterLabels,clusterLabelParts,clusterLabelNames} from './ClusterLabels'
import {WorldText} from './FaceText'
import {textAdvance} from './text/textSystem'
import {placeStructuralLabels,projectStructuralObstacle,regionHeadingSpec,regionHeadingStyle,type StructuralLabelSpec,type StructuralObstacle} from './text/structuralLabelLayout'
import {buildSolidBatch} from './SolidBatch'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {returnCaptions} from './returnCaptions'

export function StructuralLabels({scene,plan,safeFrame,inspectorRect}:{scene:SceneModel;plan:PresentationPlan;safeFrame:Rect;inspectorRect?:Rect|null}) {
 const {camera,size}=useThree(),groups=useRef(new Map<string,Group>()),cache=useRef<{entries:readonly StructuralLabelSpec[];bodies:readonly unknown[];key:string}|null>(null)
 const displayNames=useMemo(()=>clusterLabelNames(plan.clusters),[plan.clusters])
 const captions=useMemo(()=>returnCaptions(scene,plan.curves),[scene.returnFlows,plan.curves])
 const entries=useMemo<StructuralLabelSpec[]>(()=>[
  ...captions.map(caption=>({id:caption.id,kind:'return' as const,position:caption.position,size:caption.operands?caption.operandSize:caption.size,localBounds:[-.08,caption.width+.08,caption.operands?-.5:-.2,.2] as const,priority:0,count:1})),
  ...plan.clusters.filter(cluster=>clusterLabelParts(cluster).fits).map(cluster=>{const [x,y,z]=cluster.anchor.position,[w,h,d]=cluster.anchor.size;return{id:cluster.id,kind:'cluster' as const,position:[x,y+h/2+.12,z+d/2+.085] as const,size:.3,localBounds:[-w/2+.2,w/2-.2,.08,.83] as const,priority:cluster.selected?-3:2,count:cluster.members}}),
  ...plan.headings.map(heading=>regionHeadingSpec(heading.id,heading.position)),
  ...plan.bundles.map(bundle=>{const text=`${bundle.count} ${bundle.kind==='flow'?'flows':bundle.kind==='binding-history'?'past bindings':'references'}`,width=textAdvance(text,500)*.3;return{id:bundle.id,kind:'bundle' as const,position:bundle.points[Math.floor(bundle.points.length/2)],size:.3,localBounds:[-width/2,width/2,-.15,.15] as const,priority:bundle.widthPx===3.5?0:3,count:bundle.count}}),
 ],[plan.clusters,plan.headings,plan.bundles,captions])
 const bodies=useMemo(()=>[...buildSolidBatch(scene,plan).filter(solid=>solid.role!=='face').map(solid=>solid.anchor),...scene.io.map(io=>io.anchor),...(plan.exceptionPanel?[exceptionPanelAnchor(plan.exceptionPanel,scene.recording)]:[])],[scene,plan])
 useFrame(()=>{
  if(!(camera instanceof PerspectiveCamera))return
  const key=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,size.width,size.height,safeFrame,inspectorRect])
  if(cache.current?.entries===entries&&cache.current.bodies===bodies&&cache.current.key===key)return
  cache.current={entries,bodies,key}
  const blocked:StructuralObstacle[]=inspectorRect?[inspectorRect]:[]
  for(const body of bodies){const obstacle=projectStructuralObstacle(body,camera,size);if(obstacle)blocked.push(obstacle)}
  for(const label of placeStructuralLabels(entries,camera,size,safeFrame,blocked)){
   const group=groups.current.get(label.id);if(!group)continue
   group.visible=label.visible;group.position.set(...label.position);group.scale.setScalar(label.scale);group.updateWorldMatrix(true,true)
  }
 },.25)
 return <group name="structural-labels">{entries.map(entry=>{
  const cluster=entry.kind==='cluster'?plan.clusters.find(cluster=>cluster.id===entry.id):null,heading=entry.kind==='heading'?plan.headings.find(heading=>heading.id===entry.id):null,bundle=entry.kind==='bundle'?plan.bundles.find(bundle=>bundle.id===entry.id):null
  const caption=entry.kind==='return'?captions.find(caption=>caption.id===entry.id):null
  return <group key={entry.id} name={`structural-label:${entry.id}`} ref={group=>{if(group)groups.current.set(entry.id,group);else groups.current.delete(entry.id)}} position={[...entry.position]} userData={{structuralLabel:entry}}>
   {caption?<>
    <mesh position={[caption.width/2,caption.operands?-.15:0,-.025]} userData={{runtimeBloomRole:'protected'}} raycast={()=>undefined}><planeGeometry args={[caption.width+.16,caption.operands?.7:.4]}/><meshBasicMaterial color={color.stack.chip} transparent opacity={caption.opacity} depthWrite={false} toneMapped={false}/></mesh>
    <WorldText position={[0,0,0]} size={caption.size} weight={600} width={caption.width} minimumPixels={12} opacity={caption.opacity} tint={color.semantic.return} returnText={{flowId:caption.flowId,kind:'value'}}>{caption.primary}</WorldText>
    {caption.operands&&<WorldText position={[0,-.32,0]} size={caption.operandSize} width={caption.width} minimumPixels={12} opacity={caption.opacity} tint={color.semantic.return} returnText={{flowId:caption.flowId,kind:'operands'}}>{caption.operands}</WorldText>}
   </>:cluster?<ClusterLabels cluster={cluster} displayLabel={displayNames.get(cluster.id)}/>:heading?<WorldText position={[0,0,0]} size={regionHeadingStyle.size} weight={regionHeadingStyle.weight} tracking={regionHeadingStyle.tracking} width={5} minimumPixels={12} opacity={heading.opacity} tint={heading.id==='STACK'?color.stack.edge:heading.id==='HEAP'?color.heap.edge:heading.id==='RETURNS'?color.semantic.return:color.class.edge}>{heading.id}</WorldText>:bundle?<WorldText position={[0,0,0]} size={.3} weight={500} width={entry.localBounds[1]-entry.localBounds[0]+.02} align="center" minimumPixels={12} opacity={bundle.opacity} tint={color.ui.textSecondary}>{`${bundle.count} ${bundle.kind==='flow'?'flows':bundle.kind==='binding-history'?'past bindings':'references'}`}</WorldText>:null}
  </group>
 })}</group>
}
