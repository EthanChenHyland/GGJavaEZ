import type {AccessibleEntity} from './accessibleEntities'
export interface AccessibleCursor {recordingId:string;cursor:number;item:AccessibleEntity}
interface StepInput {items:readonly AccessibleEntity[];selectionId:string|null;remembered:AccessibleCursor|null;recordingId:string;cursor:number;direction:-1|1;clamp:boolean}
/** Remember only a previously visible catalog point. A cell-window repack may
 * remove the selected projection without changing its semantic selection.
 * Continue from that spatial cut, selecting only a current visible entry. */
export function nextAccessibleEntity({items,selectionId,remembered,recordingId,cursor,direction,clamp}:StepInput):AccessibleEntity|null{
 if(!items.length)return null
 const active=items.findIndex(item=>item.id===selectionId)
 let index=active+direction
 if(active<0&&remembered?.recordingId===recordingId&&remembered.cursor===cursor&&remembered.item.id===selectionId){
  const previous=remembered.item
  const after=items.findIndex(item=>(item.y-previous.y||item.x-previous.x||item.id.localeCompare(previous.id))>0)
  index=(after<0?items.length:after)+(direction===-1?-1:0)
 }
 if(clamp)index=Math.min(items.length-1,Math.max(0,index))
 return items[index]??null
}
