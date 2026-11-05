import type {MaterialRole,PresentationPlan,PresentedCurve,SceneModel,Vec3} from '../contracts/world'
import {faceRows,faceRowPort} from '../world/faceRows'
import {arrayReferenceChipPort,collectionReferenceChipPort} from '../world/structureValueChipGeometry'
import {arrayCellFocusOpacity} from './arrayCellStyle'

export interface ReferenceChipPort {id:string;point:Vec3;opacity:number;colorRole:MaterialRole}
export interface ConnectorPortMarker {point:Vec3;opacity:number;colorRole:MaterialRole;hovered:boolean}

/** Visible captured reference chips own ports even without a drawable curve. */
export function referenceChipPorts(scene:SceneModel,plan:PresentationPlan):ReferenceChipPort[]{
 const ports:ReferenceChipPort[]=[]
 for(const[id,presented]of plan.entities){
  const node=scene.entities[id]
  if(!node||presented.mode!=='detailed')continue
  if(node.kind==='array'){
   const window=plan.cellWindows.get(id);if(!window)continue
   const emphasis=arrayCellFocusOpacity(window)
   for(const[slotId,cell]of window.mapping){
    const value=node.cells.find(item=>item.index===cell.index)?.value
    if(value?.kind==='reference'&&value.observation!=='UNAVAILABLE'&&scene.entities[value.targetId])ports.push({id:slotId,point:arrayReferenceChipPort(cell.anchor),opacity:presented.opacity*emphasis(slotId),colorRole:presented.highlight==='exception'?'exception':'reference'})
   }
   continue
  }
  const model=faceRows(node,presented)
  if(node.kind==='collection'){
   for(const[index,entry]of node.entries.entries())if(model.visible.some(row=>row.slotId===entry.slotId)){
    const add=(slotId:string,value:typeof entry.value,key=false)=>{
     if(value.kind!=='reference'||value.observation==='UNAVAILABLE'||!scene.entities[value.targetId])return
     const point=collectionReferenceChipPort(node.anchor,index,node.collectionKind==='Map',key)
     if(point)ports.push({id:slotId,point,opacity:presented.opacity,colorRole:presented.highlight==='exception'?'exception':'reference'})
    }
    add(entry.slotId,entry.value);if(entry.key&&entry.keySlotId)add(entry.keySlotId,entry.key,true)
   }
   continue
  }
  for(const row of model.visible){
   if(row.value.kind!=='reference'||row.value.observation==='UNAVAILABLE'||!scene.entities[row.value.targetId])continue
   const point=faceRowPort(node,presented,row.slotId,model)
   if(point)ports.push({id:row.slotId,point,opacity:presented.opacity,colorRole:presented.highlight==='exception'?'exception':'reference'})
  }
 }
 return ports
}

/** Merge a curve's chip attachment into its existing marker. A dim port must
 * not be blended twice merely because a connector also terminates there. */
export function connectorPortMarkers(curves:readonly PresentedCurve[],ports:readonly ReferenceChipPort[],hoverId?:string|null):ConnectorPortMarker[]{
 const markers:ConnectorPortMarker[]=ports.map(port=>({point:port.point,opacity:port.opacity,colorRole:port.colorRole,hovered:false}))
 const chips=new Map(ports.map((port,index)=>[JSON.stringify(port.point),index]))
 for(const curve of curves){
  const hovered=curve.id===hoverId
  for(const point of[curve.points[0],curve.points.at(-1)!]){
   const index=chips.get(JSON.stringify(point))
   if(index===undefined){markers.push({point,opacity:hovered?1:curve.opacity,colorRole:curve.colorRole,hovered});continue}
   const marker=markers[index]
   marker.opacity=Math.max(marker.opacity,hovered?1:curve.opacity)
   if(hovered||curve.colorRole==='exception')marker.colorRole=curve.colorRole
   marker.hovered ||= hovered
  }
 }
 return markers
}
