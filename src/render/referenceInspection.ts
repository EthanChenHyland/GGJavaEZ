import type {RuntimeState} from '../contracts/runtime'
import type {SceneModel,SceneReference} from '../contracts/worldV2'
import {arrayCellTarget} from '../world/arrayCellTarget'
import {inspectorEntityTitle} from './inspection'

/** Holder names are captured storage metadata. Only the canonical array-cell
 * identity helper may recover an index; opaque IDs never become Java names. */
export function referenceInspection(runtime:RuntimeState,scene:SceneModel,reference:SceneReference,historical=false){
 const source=scene.entities[reference.sourceId],target=scene.entities[reference.targetId]
 const slot=historical?undefined:runtime.frames[reference.sourceId]?.locals[reference.sourceSlotId]
  ??runtime.classes?.[reference.sourceId]?.statics[reference.sourceSlotId]
  ??runtime.objects[reference.sourceId]?.fields[reference.sourceSlotId]
 const targetCell=arrayCellTarget(scene,reference.sourceSlotId)
 const cell=targetCell?.array.id===reference.sourceId?targetCell:null
 const prefix=source?.kind==='frame'?'Frame ':source?.kind==='class'?'Class ':''
 let holder=cell?`index [${cell.index}]`:slot?`${source?.kind==='class'?'static field':source?.kind==='frame'?slot.name==='this'?'receiver':slot.role==='parameter'?'parameter':slot.role==='operand'?'operand':'local':'field'} ${slot.name}`:'Captured storage (name not recorded)'
 if(!historical&&!slot&&!cell&&source?.kind==='collection'){
  const index=source.entries.findIndex(entry=>entry.slotId===reference.sourceSlotId||entry.keySlotId===reference.sourceSlotId)
  if(index>=0)holder=`preview entry ${index} ${source.entries[index].keySlotId===reference.sourceSlotId?'key':'value'}`
 }
 return{source:source?prefix+inspectorEntityTitle(source):`${reference.sourceId} · not present`,holder,target:target?inspectorEntityTitle(target):`${reference.targetId} · type not recorded`}
}
