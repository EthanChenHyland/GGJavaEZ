import type {Selection} from '../contracts/interaction'
import type {ClusterKey,DetailLevel,LayoutState,Ownership,PresentedCluster,SceneModel,WorldAnchor} from '../contracts/worldV2'
import {clusterAnchor} from './clusterAnchor'
import {recordedOwnership} from './recordedOwnership'
type Group={id:string;key:ClusterKey;label:string;members:string[]}
const keyValue=(layout:LayoutState,id:string,kind:'type'|'package')=>layout.placement[id]?.clusterPath.find(key=>key.kind===kind)?.value??''
const groupId=(region:string,kind:ClusterKey['kind'],value:string)=>kind==='type'?`cluster:${region}:${value}`:`cluster:${kind}:${region}:${value}`
const canonicalCache=new WeakMap<LayoutState['placement'],Map<string,WorldAnchor>>()

/** Region is the fixed spatial scope; keys are truthful ownership or package/
 * type nodes. Representative ordering uses recorded ordinals, never a residual
 * array order or a camera. The first-known key anchor survives empty cuts. */
function canonicalAnchors(layout:LayoutState):Map<string,WorldAnchor>{
 const cached=canonicalCache.get(layout.placement);if(cached)return cached
 const result=new Map<string,WorldAnchor>(),ownershipSeq=new Map<string,number>()
 const entries=Object.entries(layout.placement).sort(([a,x],[b,y])=>x.firstSeq-y.firstSeq||a.localeCompare(b))
 for(const[id,entry]of entries){
  const anchor=layout.anchors[id];if(!anchor||anchor.region==='io')continue
  for(const[kind,value]of [['type',keyValue(layout,id,'type')],['package',keyValue(layout,id,'package')],['package','*']] as const){
   const key=groupId(anchor.region,kind,value);if(!result.has(key))result.set(key,anchor)
  }
  for(const observation of entry.ownershipHistory??[]){
   const key=groupId(anchor.region,'ownership',observation.value),prior=ownershipSeq.get(key)
   if(prior===undefined||observation.seq<prior){result.set(key,anchor);ownershipSeq.set(key,observation.seq)}
  }
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
  const representative=anchors.get(group.id)
  if(!representative)throw new Error(`Cluster has no canonical recorded placement: ${group.id}`)
  return{id:group.id,key:group.key,label:group.label,members:group.members.length,memberIds:group.members,selected:selection?.kind==='cluster'&&selection.id===group.id,anchor:clusterAnchor(group.id,representative),opacity:focused?.25:.55,pickable:true}
 })
}
