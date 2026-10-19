import type {Selection} from '../contracts/interaction'
import type {PresentationPlan,SceneModel,Vec3} from '../contracts/world'
export interface AccessibleEntity {id:string;label:string;selection:NonNullable<Selection>;x:number;y:number}
export interface Projection {x:number;y:number;visible:boolean}
/** Exactly the actual pickable geometry in the viewport, never a synthetic test inventory. */
export function accessibleEntities(scene:SceneModel,plan:PresentationPlan,project:(point:Vec3)=>Projection):AccessibleEntity[] {
 const result:AccessibleEntity[]=[]
 const add=(id:string,label:string,selection:NonNullable<Selection>,point:Vec3)=>{const screen=project(point);if(screen.visible)result.push({id,label,selection,x:screen.x,y:screen.y})}
 for(const[id,presented]of plan.entities){if(!presented.pickable)continue;const node=scene.entities[id],label=node.kind==='frame'?`${node.title} #${node.invocationNumber}`:node.kind==='class'?`${node.title} static state`:`${node.title} #${node.displayId}`;add(id,label,{kind:node.kind==='frame'?'frame':node.kind==='class'?'class':'object',id},node.anchor.position)
  if(node.kind==='array')for(const[slotId,cell]of plan.cellWindows.get(id)?.mapping??[])add(slotId,`${label} [${cell.index}]`,{kind:'slot',id:slotId},cell.anchor.position)
 }
 for(const cluster of plan.clusters)if(cluster.pickable)add(cluster.id,`Cluster ${cluster.label} ×${cluster.members} recorded entities`,{kind:'cluster',id:cluster.id},cluster.anchor.position)
 return result.sort((a,b)=>a.y-b.y||a.x-b.x||a.id.localeCompare(b.id))
}
