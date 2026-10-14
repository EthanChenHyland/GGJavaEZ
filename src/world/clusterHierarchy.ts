import type {ClusterKey,LayoutState,SceneModel,Vec3,WorldAnchor} from '../contracts/worldV2'
import {clusterAnchor,clusterSize} from './clusterAnchor'
import {createOccupancy} from './occupancy'
import {recordedOwnership} from './recordedOwnership'

export interface ClusterNode {
 id:string
 key:ClusterKey
 label:string
 anchor:WorldAnchor
 introducedSeq:number
 memberIds:readonly string[]
 liveIds:readonly string[]
 historicalIds:readonly string[]
 retainedIds:readonly string[]
}
export const clusterId=(region:string,key:ClusterKey)=>key.kind==='type'?`cluster:${region}:${key.value}`:`cluster:${key.kind}:${region}:${key.value}`
export const liveDepthId='cluster:live-depth:stack'
type Reservation=Omit<ClusterNode,'memberIds'|'liveIds'|'historicalIds'|'retainedIds'>
const cache=new WeakMap<LayoutState['placement'],Map<string,Reservation>>()
const label=(key:ClusterKey)=>key.kind==='ownership'&&key.value==='UNKNOWN'?'Ownership unavailable':key.kind==='execution-age'?`Events ${Number(key.value)*4096}–${Number(key.value)*4096+4095}`:key.kind==='package'&&!key.value?'Default package':key.kind==='collection'?`Collection ${key.value}`:key.kind==='invocation-branch'?`Observed branch ${key.value}`:key.value

/** Reserve every first-known key, including inactive collection intervals.
 * Sorting introduction ordinals prevents later metadata on an older object
 * from displacing earlier proxies. Runtime geometry is never moved. */
function reservations(layout:LayoutState) {
 const known=cache.get(layout.placement);if(known)return known
 const offers=new Map<string,{key:ClusterKey;body:WorldAnchor;seq:number}>()
 const offer=(id:string,key:ClusterKey,body:WorldAnchor,seq:number)=>{
  const prior=offers.get(id)
  if(!prior||seq<prior.seq||seq===prior.seq&&body.entityId<prior.body.entityId)offers.set(id,{key,body,seq})
 }
 for(const [id,entry]of Object.entries(layout.placement)){
  const body=layout.anchors[id];if(!body||body.region==='io')continue
  for(const key of entry.clusterPath)if(key.kind!=='ownership')offer(clusterId(body.region,key),key,body,entry.firstSeq)
  const unknown:ClusterKey={kind:'ownership',value:'UNKNOWN'};offer(clusterId(body.region,unknown),unknown,body,entry.firstSeq)
  for(const observation of entry.ownershipHistory??[]){const key:ClusterKey={kind:'ownership',value:observation.value};offer(clusterId(body.region,key),key,body,observation.seq)}
  for(const interval of entry.clusterMemberships??[])offer(clusterId(body.region,interval.key),interval.key,body,Math.max(entry.firstSeq,interval.fromSeq))
  if(body.region==='stack')offer(liveDepthId,{kind:'invocation-branch',value:'live stack'},body,entry.firstSeq)
 }
 const left=Math.min(...[layout.regions.stack,layout.regions.classState].flatMap(bounds=>bounds?[bounds.center[0]-bounds.size[0]/2]:[])),occupied=createOccupancy()
 const result=new Map<string,Reservation>()
 for(const [id,{key,body,seq}]of [...offers].sort(([a,x],[b,y])=>x.seq-y.seq||a.localeCompare(b))){
  const side=body.region==='stack'||body.region==='class',bounds=body.region==='heap'?layout.regions.heap:layout.regions.library
  let position:Vec3=side?[left-clusterSize[0]/2-.4,body.position[1],body.position[2]]:[body.position[0],bounds!.center[1]+bounds!.size[1]/2+clusterSize[1]/2+.4,body.position[2]]
  let anchor=clusterAnchor(id,body,position)
  while(occupied.intersects(anchor)){position=side?[position[0]-clusterSize[0]-.4,position[1],position[2]]:[position[0],position[1],position[2]+clusterSize[2]+.4];anchor=clusterAnchor(id,body,position)}
  occupied.add(anchor);result.set(id,{id,key,label:label(key),anchor,introducedSeq:seq})
 }
 cache.set(layout.placement,result);return result
}

/** Canonical prefix/role/lifetime membership, independent of camera, LOD and
 * the planner's residual cut. Zero-member nodes retain identity and anchor. */
export function clusterHierarchy(scene:SceneModel,layout:LayoutState):ReadonlyMap<string,ClusterNode> {
 const nodes=new Map<string,ClusterNode>()
 for(const [id,node]of reservations(layout))if(node.introducedSeq<scene.cursor)nodes.set(id,{...node,memberIds:[],liveIds:[],historicalIds:[],retainedIds:[]})
 const add=(key:ClusterKey,id:string,specialId?:string)=>{
  const node=nodes.get(specialId??clusterId(layout.anchors[id].region,key));if(!node)throw new Error(`Missing canonical cluster reservation: ${id}/${key.kind}/${key.value}`)
  const entity=scene.entities[id]
  ;(node.memberIds as string[]).push(id)
  const role=entity.kind==='frame'?entity.live?node.liveIds:node.historicalIds:node.retainedIds
  ;(role as string[]).push(id)
 }
 for(const id of [...scene.order.frames,...scene.order.objects,...scene.order.classes]){
  const entry=layout.placement[id];if(!entry||entry.firstSeq>=scene.cursor)continue
  const keys=entry.clusterPath.filter(key=>key.kind!=='ownership')
  keys.push({kind:'ownership',value:recordedOwnership(layout,id,scene.cursor)??'UNKNOWN'})
  for(const interval of entry.clusterMemberships??[])if(interval.fromSeq<scene.cursor&&(interval.untilSeq===null||scene.cursor<=interval.untilSeq))keys.push(interval.key)
  const seen=new Set<string>()
  for(const key of keys){const signature=JSON.stringify(key);if(!seen.has(signature)){add(key,id);seen.add(signature)}}
  if(scene.entities[id].kind==='frame'&&scene.entities[id].live)add({kind:'invocation-branch',value:'live stack'},id,liveDepthId)
 }
 return nodes
}

/** Residual live depth count and frequent captured signature. At equal
 * frequency, the most deeply executing occurrence supplies the label. */
export function liveDepthMethod(scene:SceneModel,layout:LayoutState,members:readonly string[]) {
 const counts=new Map<string,{signature:string;count:number;inner:number;title:string;frameId:string}>()
 const positions=new Map(scene.liveStack.map((id,index)=>[id,index]))
 for(const id of members){const frame=scene.entities[id];if(frame.kind!=='frame')continue
  const method=layout.placement[id]?.method,observations=method?.descriptors??[],position=positions.get(id)??-1
  if(!method)continue
  let low=0,high=observations.length
  while(low<high){const middle=(low+high)>>>1;if(observations[middle].seq<scene.cursor)low=middle+1;else high=middle}
  const descriptor=low?observations[low-1]:undefined
  // Canonical recorded names/descriptors or captured parameter types. Never
  // reconstruct identity from a simplified title or Java source display text.
  const signature=JSON.stringify(descriptor?[descriptor.owner,descriptor.name,descriptor.descriptor]:[method?.owner,method?.name,method?.parameterTypes])
  const item=counts.get(signature)??{signature,count:0,inner:-1,title:frame.title,frameId:id};item.count++
  if(position>item.inner){item.inner=position;item.frameId=id;item.title=frame.title}counts.set(signature,item)
 }
 return [...counts.values()].sort((a,b)=>b.count-a.count||b.inner-a.inner)[0]??null
}
export function liveDepthLabel(scene:SceneModel,layout:LayoutState,members:readonly string[]):string {
 const method=liveDepthMethod(scene,layout,members)
 return method?`Live depth · ${method.title}`:'Live depth · method unavailable'
}
