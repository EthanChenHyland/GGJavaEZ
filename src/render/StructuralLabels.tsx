import {useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Group,PerspectiveCamera} from 'three'
import type {PresentationPlan,SceneModel} from '../contracts/worldV2'
import type {Rect} from '../shell/shellLayout'
import {color} from '../theme/tokens'
import {ClusterLabels,clusterLabelParts,clusterLabelNames} from './ClusterLabels'
import {WorldText} from './FaceText'
import {fitWorldText,textAdvance} from './text/textSystem'
import {placeStructuralLabels,type StructuralLabelSpec} from './text/structuralLabelLayout'
import {buildSolidBatch} from './SolidBatch'
import {anchorCorners} from '../world/presentationPlanner'
import {screenPoint} from '../camera/projection'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'

export function StructuralLabels({scene,plan,safeFrame,inspectorRect}:{scene:SceneModel;plan:PresentationPlan;safeFrame:Rect;inspectorRect?:Rect|null}) {
 const {camera,size}=useThree(),groups=useRef(new Map<string,Group>()),cache=useRef<{entries:readonly StructuralLabelSpec[];bodies:readonly unknown[];key:string}|null>(null)
 const displayNames=useMemo(()=>clusterLabelNames(plan.clusters),[plan.clusters])
 const entries=useMemo<StructuralLabelSpec[]>(()=>[
  ...plan.clusters.filter(cluster=>clusterLabelParts(cluster).fits).map(cluster=>{const [x,y,z]=cluster.anchor.position,[w,h,d]=cluster.anchor.size;return{id:cluster.id,kind:'cluster' as const,position:[x,y+h/2+.12,z+d/2+.085] as const,size:.3,localBounds:[-w/2+.2,w/2-.2,.08,.83] as const,priority:cluster.selected?0:2,count:cluster.members}}),
  ...plan.headings.map(heading=>{const text=fitWorldText(heading.id,5,.6,600,.18),width=textAdvance(text,600,.18)*.6;return{id:heading.id,kind:'heading' as const,position:heading.position,size:.6,localBounds:[0,width,-.3,.3] as const,priority:1,count:0}}),
 ],[plan.clusters,plan.headings])
 const bodies=useMemo(()=>[...buildSolidBatch(scene,plan).filter(solid=>solid.role!=='face').map(solid=>solid.anchor),...scene.io.map(io=>io.anchor),...(plan.exceptionPanel?[exceptionPanelAnchor(plan.exceptionPanel,scene.recording)]:[])],[scene,plan])
 useFrame(()=>{
  if(!(camera instanceof PerspectiveCamera))return
  const key=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,size.width,size.height,safeFrame,inspectorRect])
  if(cache.current?.entries===entries&&cache.current.bodies===bodies&&cache.current.key===key)return
  cache.current={entries,bodies,key}
  const blocked:Rect[]=inspectorRect?[inspectorRect]:[]
  for(const body of bodies){const points=anchorCorners(body).map(point=>screenPoint(point,camera,size));if(!points.some(point=>point.z>-1&&point.z<1))continue;const xs=points.map(point=>point.x),ys=points.map(point=>point.y);blocked.push({x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)})}
  for(const label of placeStructuralLabels(entries,camera,size,safeFrame,blocked)){
   const group=groups.current.get(label.id);if(!group)continue
   group.visible=label.visible;group.position.set(...label.position);group.scale.setScalar(label.scale);group.updateWorldMatrix(true,true)
  }
 },.25)
 return <group name="structural-labels">{entries.map(entry=>{
  const cluster=entry.kind==='cluster'?plan.clusters.find(cluster=>cluster.id===entry.id):null,heading=entry.kind==='heading'?plan.headings.find(heading=>heading.id===entry.id):null
  return <group key={entry.id} name={`structural-label:${entry.id}`} ref={group=>{if(group)groups.current.set(entry.id,group);else groups.current.delete(entry.id)}} position={[...entry.position]} userData={{structuralLabel:entry}}>
   {cluster?<ClusterLabels cluster={cluster} displayLabel={displayNames.get(cluster.id)}/>:heading?<WorldText position={[0,0,0]} size={.6} weight={600} tracking={.18} width={5} minimumPixels={12} opacity={heading.opacity} tint={heading.id==='STACK'?color.stack.edge:heading.id==='HEAP'?color.heap.edge:heading.id==='RETURNS'?color.semantic.return:color.class.edge}>{heading.id}</WorldText>:null}
  </group>
 })}</group>
}
