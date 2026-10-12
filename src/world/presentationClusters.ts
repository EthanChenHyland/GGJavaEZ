import type {Selection} from '../contracts/interaction'
import type {ClusterKey,DetailLevel,LayoutState,Ownership,PresentedCluster,SceneModel,Vec3,WorldAnchor} from '../contracts/worldV2'
import {clusterAnchor,clusterSize} from './clusterAnchor'
import {recordedOwnership} from './recordedOwnership'
import {createOccupancy} from './occupancy'
type Group={id:string;key:ClusterKey;label:string;members:string[]}
const keyValue=(layout:LayoutState,id:string,kind:'type'|'package')=>layout.placement[id]?.clusterPath.find(key=>key.kind===kind)?.value??''
const groupId=(region:string,kind:ClusterKey['kind'],value:string)=>kind==='type'?`cluster:${region}:${value}`:`cluster:${kind}:${region}:${value}`
const canonicalCache=new WeakMap<LayoutState['placement'],Map<string,WorldAnchor>>()

/** Region is the fixed spatial scope; keys are truthful ownership or package/
 * type nodes. Representative ordering uses recorded ordinals, never a residual
 * array order or a camera. The first-known key anchor survives empty cuts. */
function canonicalAnchors(layout:LayoutState):Map<string,WorldAnchor>{
 const cached=canonicalCache.get(layout.placement);if(cached)return cached
 const result=new Map<string,WorldAnchor>(),candidates=new Map<string,{body:WorldAnchor;seq:number}>()
 const offer=(key:string,body:WorldAnchor,seq:number)=>{const prior=candidates.get(key);if(!prior||seq<prior.seq||seq===prior.seq&&body.entityId<prior.body.entityId)candidates.set(key,{body,seq})}
 const entries=Object.entries(layout.placement).sort(([a,x],[b,y])=>x.firstSeq-y.firstSeq||a.localeCompare(b))
 for(const[id,entry]of entries){
  const anchor=layout.anchors[id];if(!anchor||anchor.region==='io')continue
  for(const[kind,value]of [['type',keyValue(layout,id,'type')],['package',keyValue(layout,id,'package')],['package','*']] as const){
   offer(groupId(anchor.region,kind,value),anchor,entry.firstSeq)
  }
  for(const observation of entry.ownershipHistory??[]){
   offer(groupId(anchor.region,'ownership',observation.value),anchor,observation.seq)
  }
 }
 // Runtime bands have immutable outer boundaries: heap/library never grow
 // above their first top, and stack/class shelves never grow left of their
 // first left edge. Reserve proxies beyond those boundaries, in introduction
 // order. Future keys cannot displace an earlier reservation.
 const sideLeft=Math.min(...[layout.regions.stack,layout.regions.classState].flatMap(bounds=>bounds?[bounds.center[0]-bounds.size[0]/2]:[]))
 const occupied=createOccupancy()
 for(const[id,{body}]of [...candidates].sort(([a,x],[b,y])=>x.seq-y.seq||a.localeCompare(b))){
  const side=body.region==='stack'||body.region==='class',bounds=body.region==='heap'?layout.regions.heap:layout.regions.library
  let position:Vec3=side?[sideLeft-clusterSize[0]/2-.4,body.position[1],body.position[2]]:[body.position[0],bounds!.center[1]+bounds!.size[1]/2+clusterSize[1]/2+.4,body.position[2]]
  let anchor=clusterAnchor(id,body,position)
  while(occupied.intersects(anchor)){
   position=side?[position[0]-clusterSize[0]-.4,position[1],position[2]]:[position[0],position[1],position[2]+clusterSize[2]+.4]
   anchor=clusterAnchor(id,body,position)
  }
  occupied.add(anchor);result.set(id,anchor)
 }
 canonicalCache.set(layout.placement,result);return result
}
export function presentationClusters(scene:SceneModel,layout:LayoutState,residual:readonly string[],detail:DetailLevel,limit:number,selection:Selection,focused:boolean):PresentedCluster[]{
 const owners=new Map(residual.map(id=>[id,recordedOwnership(layout,id,scene.cursor)]))
 const external=(id:string):Ownership|undefined=>detail!=='CLOSE'&&['JDK','LIBRARY'].includes(owners.get(id)??'')?owners.get(id):undefined
 const form=(coarse:'type'|'package'|'root')=>{
  const groups=new Map<string,Group>()
  for(const id of residual){
   const region=layout.anchors[id].region,ownership=external(id),kind=ownership?'ownership':coarse==='type'?'type':'package'
   const value=ownership??(coarse==='root'?'*':keyValue(layout,id,kind as 'type'|'package'))
   const group=groupId(region,kind,value),label=coarse==='root'&&!ownership?'Packages':value||'Default package'
   const entry=groups.get(group)??{id:group,key:{kind,value},label,members:[]};entry.members.push(id);groups.set(group,entry)
  }
  return groups
 }
 let groups=form('type');if(groups.size>limit)groups=form('package');if(groups.size>limit)groups=form('root')
 const anchors=canonicalAnchors(layout)
 return [...groups.values()].map(group=>{
  const anchor=anchors.get(group.id)
  if(!anchor)throw new Error(`Cluster has no canonical recorded placement: ${group.id}`)
  return{id:group.id,key:group.key,label:group.label,members:group.members.length,memberIds:group.members,selected:selection?.kind==='cluster'&&selection.id===group.id,anchor,opacity:focused?.25:.55,pickable:true}
 })
}
