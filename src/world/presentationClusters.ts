import type {Selection} from '../contracts/interaction'
import type {ClusterKey,DetailLevel,LayoutState,PresentedCluster,SceneModel} from '../contracts/worldV2'
import {clusterHierarchy,clusterId,liveDepthId,liveDepthLabel,type ClusterNode} from './clusterHierarchy'
import {recordedOwnership} from './recordedOwnership'

export type ClusterCutLevel='type'|'package'|'ownership'
export interface ResidualGroup {id:string;key:ClusterKey;members:string[]}

/** Exactly one primary key for each residual entity. Other canonical keys
 * remain available in the hierarchy; they never double-count a presented cut. */
export function residualGroups(scene:SceneModel,layout:LayoutState,ids:readonly string[],detail:DetailLevel,coarse:ClusterCutLevel='type'):ResidualGroup[] {
 const groups=new Map<string,ResidualGroup>()
 for(const id of ids){
  const entry=layout.placement[id],entity=scene.entities[id],owner=recordedOwnership(layout,id,scene.cursor)
  const external=detail!=='CLOSE'&&(owner==='JDK'||owner==='LIBRARY')
  let key:ClusterKey|undefined,special:string|undefined
  if(external||coarse==='ownership')key={kind:'ownership',value:owner??'UNKNOWN'}
  if(entity.kind==='frame'&&entity.live){key={kind:'invocation-branch',value:'live stack'};special=liveDepthId}
  if(!key&&coarse==='type'){
   if(entity.kind==='class')key=entry.clusterPath.find(key=>key.kind==='package')
   else if(entity.kind==='frame')key=entry.clusterPath.find(key=>key.kind==='invocation-branch')
   else key=entry.clusterMemberships?.find(item=>item.key.kind==='collection'&&item.fromSeq<scene.cursor&&(item.untilSeq===null||scene.cursor<=item.untilSeq))?.key
  }
  key??=entry.clusterPath.find(key=>key.kind===coarse)||{kind:coarse,value:''}
  const groupId=special??clusterId(layout.anchors[id].region,key),group=groups.get(groupId)??{id:groupId,key,members:[]}
  group.members.push(id);groups.set(groupId,group)
 }
 return [...groups.values()]
}

export function presentationClusters(scene:SceneModel,layout:LayoutState,residual:readonly string[],detail:DetailLevel,limit:number,selection:Selection,focused:boolean,hierarchy:ReadonlyMap<string,ClusterNode>=clusterHierarchy(scene,layout)):PresentedCluster[]{
 let groups=residualGroups(scene,layout,residual,detail)
 if(groups.length>limit)groups=residualGroups(scene,layout,residual,detail,'package')
 if(groups.length>limit)groups=residualGroups(scene,layout,residual,detail,'ownership')
 return groups.map(group=>{
  const node=hierarchy.get(group.id)
  if(!node)throw new Error(`Cluster has no canonical recorded placement: ${group.id}`)
  return{id:group.id,key:group.key,label:group.id===liveDepthId?liveDepthLabel(scene,layout,group.members):node.label,members:group.members.length,memberIds:group.members,selected:selection?.kind==='cluster'&&selection.id===group.id,anchor:node.anchor,opacity:focused?.25:.55,pickable:true}
 })
}
