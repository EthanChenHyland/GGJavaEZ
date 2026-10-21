import type {ArrayWindow,FlowPresentation,PresentedEntity,SceneModel,Vec3,WorldAnchor} from '../contracts/world'
import type {FlowEndpoint} from '../motion/semanticTransition'
import type {RecordedFlow,SceneFlow} from './flowCatalog'
import {faceRows,faceRowPort} from './faceRows'
import {collectionEntryFace} from './collectionFace'

export interface FlowPort {point:Vec3;anchor:WorldAnchor}
export interface DrawableFlow {flow:SceneFlow;from:FlowPort;to:FlowPort}
export interface FlowTopologyInput {
 scene:SceneModel;entities:ReadonlyMap<string,PresentedEntity>;cellWindows:ReadonlyMap<string,ArrayWindow>
 flows:readonly RecordedFlow[];limit:number;mandatoryIds:ReadonlySet<string>
 priority(flow:RecordedFlow):number;inScope(flow:RecordedFlow):boolean;aggregate:boolean
}

/** Semantic ports over the chosen cut. A provenance edge cannot use a collapsed
 * cluster, quiet/hidden row, future cell, ellipsis or absent storage lifetime. */
export function presentedFlowPorts(scene:SceneModel,entities:ReadonlyMap<string,PresentedEntity>,windows:ReadonlyMap<string,ArrayWindow>){
 const slots=new Map<string,FlowPort>(),bodies=new Map<string,WorldAnchor>()
 for(const[id,presented]of entities){
  const node=scene.entities[id];if(!node)continue
  const anchor=node.kind==='array'?{...node.anchor,position:[node.anchor.position[0],node.anchor.position[1]+node.anchor.size[1]/2-.45,node.anchor.position[2]]as Vec3,size:[node.anchor.size[0],.9,.12]as Vec3,bodyPort:[node.anchor.position[0],node.anchor.position[1]+node.anchor.size[1]/2-.45,node.anchor.position[2]+.06]as Vec3}:node.anchor
  bodies.set(id,anchor)
  if(presented.mode!=='detailed')continue
  if(node.kind==='array'){
   const window=windows.get(id)
   if(window?.recordingId===scene.recordingId&&window.arrayId===id&&window.mapping.size){
    const observed=new Set(node.cells.map(cell=>cell.slotId))
    for(const[slot,cell]of window.mapping)if(observed.has(slot))slots.set(slot,{point:cell.port,anchor:cell.anchor})
   }
  }else{
   const model=faceRows(node,presented),visible=model.visible
   if(node.kind==='collection'){
    const ids=new Set(visible.map(row=>row.slotId))
    for(const[index,entry]of node.entries.entries())if(ids.has(entry.slotId)){
     const geometry=collectionEntryFace(node.anchor,index,node.collectionKind==='Map');if(!geometry)continue
     slots.set(entry.slotId,{point:geometry.value,anchor})
     if(entry.keySlotId&&geometry.key)slots.set(entry.keySlotId,{point:geometry.key,anchor})
    }
   }else for(const row of visible){const point=faceRowPort(node,presented,row.slotId,model);if(point)slots.set(row.slotId,{point,anchor})}
  }
 }
 return(point:FlowEndpoint|null,returned=false):FlowPort|null=>{
  if(!point)return null
  if(point.kind==='slot')return slots.get(point.id)??null
  if(point.kind==='io'){const io=scene.io.find(io=>io.id===point.id);return io?{point:io.anchor.bodyPort,anchor:io.anchor}:null}
  const anchor=bodies.get(point.id);if(!anchor)return null
  if(returned){
   const frame=scene.entities[point.id]
   if(frame?.kind!=='frame'||entities.get(point.id)?.mode!=='detailed'||!['returning','returned'].includes(frame.status.kind))return null
   return{point:[anchor.position[0]+anchor.size[0]/2,anchor.position[1]+anchor.size[1]/2-.85,anchor.position[2]+anchor.size[2]/2],anchor}
  }
  return{point:anchor.bodyPort,anchor}
 }
}

/** Each supported prefix edge is accounted once. Structural flow bundles group
 * exact directed semantic endpoint pairs and edge roles, never raw value-version
 * IDs or substitute cluster endpoints. Scope and unavailable evidence stay queryable. */
export function buildFlowTopology(input:FlowTopologyInput){
 if(!Number.isSafeInteger(input.limit)||input.limit<0)throw new RangeError('Flow limit must be a non-negative safe integer')
 const port=presentedFlowPorts(input.scene,input.entities,input.cellWindows),available:DrawableFlow[]=[],unavailable:FlowPresentation['unavailable'][number][]=[],scopeExcluded:string[]=[],seen=new Set<string>()
 for(const flow of input.flows){
  if(seen.has(flow.id))throw new Error(`Duplicate recorded flow ID: ${flow.id}`);seen.add(flow.id)
  if(flow.evidenceSeqs.some(seq=>seq>=input.scene.cursor))throw new Error('Flow evidence is outside the applied prefix')
  if(!input.inScope(flow)){scopeExcluded.push(flow.id);continue}
  const from=port(flow.from,flow.kind==='return'),to=port(flow.to)
  if(!from||!to){unavailable.push({id:flow.id,reason:!flow.from?'Recorded evidence has no proved semantic source':!flow.to?'Recorded evidence has no prefix-proved semantic destination':!from?'Source port is absent, retired, quiet or hidden in the current presentation':'Destination port is absent, retired, quiet or hidden in the current presentation'});continue}
  available.push({flow:flow as SceneFlow,from,to})
 }
 // Priority is a pure policy for this cut; evaluate it once per drawable edge.
 const ranks=new Map(available.map(item=>[item,input.priority(item.flow)]))
 const compare=(a:DrawableFlow,b:DrawableFlow)=>ranks.get(a)!-ranks.get(b)!||(b.flow.evidenceSeqs[0]??-1)-(a.flow.evidenceSeqs[0]??-1)||(a.flow.id<b.flow.id?-1:a.flow.id>b.flow.id?1:0)
 const ordered=available.sort(compare),mandatory=ordered.filter(item=>input.mandatoryIds.has(item.flow.id)),optional=ordered.filter(item=>!input.mandatoryIds.has(item.flow.id))
 const individual=[...mandatory,...optional.slice(0,Math.max(0,input.limit-mandatory.length))],emitted=new Set(individual.map(item=>item.flow.id))
 const groups=new Map<string,{id:string;from:FlowPort;to:FlowPort;flows:SceneFlow[]}>()
 for(const item of ordered)if(!emitted.has(item.flow.id)){
  if(!input.aggregate){scopeExcluded.push(item.flow.id);continue}
  const flow=item.flow,id=`presentation:flow-bundle:${JSON.stringify([input.scene.recordingId,flow.from!.kind,flow.from!.id,flow.to.kind,flow.to.id,flow.kind])}`
  const group=groups.get(id)??{id,from:item.from,to:item.to,flows:[]};group.flows.push(flow);groups.set(id,group)
 }
 const bundles=[...groups.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),bundled=bundles.reduce((sum,bundle)=>sum+bundle.flows.length,0)
 const presentation:FlowPresentation={counts:{recorded:input.flows.length,drawable:individual.length+bundled,individual:individual.length,bundled,bundleCurves:bundles.length,unavailable:unavailable.length,scopeExcluded:scopeExcluded.length},individualIds:individual.map(item=>item.flow.id),unavailable,scopeExcluded}
 return{individual,bundles,presentation,mandatory:mandatory.map(item=>item.flow.id)}
}
