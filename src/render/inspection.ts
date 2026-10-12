import type { Selection } from '../contracts/interaction'
import type { SceneEntity, SceneModel, ValueText } from '../contracts/worldV2'
import type { FlowCatalog, RecordedProvenance } from '../world/flowCatalog'
import { arrayElementSlotId } from '../contracts/runtime'
import { notRecordedValue } from '../world/valueText'
import { arrayCellTarget } from '../world/arrayCellTarget'
import type {GraphEdge} from '../contracts/executionGraph'
export interface InspectorRow { slotId:string; name:string; type:string; value:ValueText; key?:ValueText }
export function entitySlotIds(node:SceneEntity):string[] {
 return node.kind==='frame'||node.kind==='class'?node.rows.map(row=>row.slotId):node.kind==='object'?node.groups.flatMap(group=>group.rows.map(row=>row.slotId)):node.kind==='array'?node.cells.map(cell=>cell.slotId):node.entries.flatMap(entry=>entry.keySlotId?[entry.slotId,entry.keySlotId]:[entry.slotId])
}
/** Arrays stay sparse in runtime truth; the Inspector synthesizes only the requested unavailable row. */
export function inspectorRows(node:SceneEntity):{count:number;at(index:number):InspectorRow} {
 if(node.kind==='array') { const captured=new Map(node.cells.map(cell=>[cell.index,cell]));return{count:node.length,at(index){const cell=captured.get(index);return{slotId:arrayElementSlotId(node.id,index),name:`[${index}]`,type:node.componentType,value:cell?.value??notRecordedValue()}}} }
 const rows:readonly InspectorRow[]=node.kind==='frame'||node.kind==='class'?node.rows:node.kind==='object'?node.groups.flatMap(group=>group.rows):node.entries.map((entry,index)=>({...entry,name:`[${index}]`,type:'',key:entry.key}))
 return{count:rows.length,at:index=>rows[index]}
}
export function inspectorEntity(scene:SceneModel,selection:Selection):SceneEntity|null {
 if(!selection||selection.kind==='flow'||selection.kind==='cluster'||selection.kind==='bundle')return null
 const reference=selection.kind==='reference'?scene.references.find(reference=>reference.id===selection.id):null
 const id=reference?.sourceId??selection.id
 return scene.entities[id]??arrayCellTarget(scene,id)?.array??Object.values(scene.entities).find(node=>entitySlotIds(node).includes(id))??null
}
/** Geometry budgets never truncate the selected entity's recorded history. */
export function inspectorProvenance(catalog:FlowCatalog|undefined,selection:Selection,node:SceneEntity|null,cursor:number,flow?:GraphEdge):readonly RecordedProvenance[] {
 if(!catalog||!selection||selection.kind==='bundle')return[]
 const ids=selection.kind==='flow'&&flow?[flow.from,flow.to,...(flow.originSlotId?[flow.originSlotId]:[])]:selection.kind==='slot'?[selection.id]:node?[node.id,...entitySlotIds(node)]:[selection.id]
 const evidence=new Map<string,RecordedProvenance>()
 for(const id of ids)for(const item of catalog.recordedProvenanceOf(id,cursor))evidence.set(item.edgeId,item)
 return [...evidence.values()].sort((a,b)=>a.edgeIndex-b.edgeIndex)
}
