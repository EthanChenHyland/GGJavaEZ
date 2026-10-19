import type {RuntimeLibrarySummary,TraceEvent} from '../contracts/runtime'
import type {ClusterMembership,PlacementInfo} from '../contracts/world'

/** Index only recorded relationships. A collection preview replaces the prior
 * captured membership; omitted entries are unknown, never retained as current.
 * Pending histories cover a referenced ID before its first object observation. */
export function createClusterMembershipIndex() {
 const histories=new Map<string,ClusterMembership[]>(),collections=new Map<string,Set<string>>()
 const history=(id:string)=>histories.get(id)??[]
 const update=(id:string,items:ClusterMembership[],placement:Readonly<Record<string,PlacementInfo>>,put:(id:string,entry:PlacementInfo)=>void)=>{
  histories.set(id,items)
  if(placement[id])put(id,{...placement[id],clusterMemberships:items})
 }
 return {
  history,
  observe(event:TraceEvent,placement:Readonly<Record<string,PlacementInfo>>,put:(id:string,entry:PlacementInfo)=>void) {
   if(event.type==='EXECUTION_FACT'&&(event.fact.kind==='object'||event.fact.kind==='observe')&&event.fact.context.frameId){
    const id=event.fact.objectId,branch=placement[event.fact.context.frameId]?.clusterPath.find(key=>key.kind==='invocation-branch')
    if(branch&&!history(id).some(item=>item.key.kind==='invocation-branch'))update(id,[...history(id),{key:branch,fromSeq:event.seq,untilSeq:null}],placement,put)
   }
   if(event.type!=='OBJECT_OBSERVE'||!event.library)return
   const summary:RuntimeLibrarySummary=event.library,id=event.objectId
   const captured=new Set<string>()
   if(['LIST','SET','MAP','QUEUE','DEQUE'].includes(summary.kind)){
    captured.add(id)
    for(const value of [...(summary.items??[]),...(summary.entries??[]).flatMap(entry=>[entry.key,entry.value])])if(value.kind==='reference')captured.add(value.objectId)
   }
   const prior=collections.get(id)??new Set<string>(),key={kind:'collection' as const,value:id}
   for(const member of prior)if(!captured.has(member))update(member,history(member).map(item=>item.key.kind==='collection'&&item.key.value===id&&item.untilSeq===null?{...item,untilSeq:event.seq}:item),placement,put)
   for(const member of captured)if(!prior.has(member))update(member,[...history(member),{key,fromSeq:event.seq,untilSeq:null}],placement,put)
   collections.set(id,captured)
  },
 }
}
