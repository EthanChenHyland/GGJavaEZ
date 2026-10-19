export interface ShellSurface {id:symbol;parent:symbol|null;order:number;node:HTMLElement}
/** Mounted surfaces only. Parent links preserve nested priority even when React
 * commits a child's layout effect before its parent's registration. */
export function createSurfaceStack(){
 let next=0,version=0
 const entries=new Map<symbol,ShellSurface>(),listeners=new Set<()=>void>()
 let ordered:readonly ShellSurface[]=[]
 const publish=()=>{
  const siblings=(parent:symbol|null)=>[...entries.values()].filter(entry=>entry.parent===parent||parent===null&&entry.parent!==null&&!entries.has(entry.parent)).sort((a,b)=>a.order-b.order)
  const result:ShellSurface[]=[],visited=new Set<symbol>()
  const visit=(entry:ShellSurface)=>{if(visited.has(entry.id))return;visited.add(entry.id);result.push(entry);for(const child of siblings(entry.id))visit(child)}
  for(const root of siblings(null))visit(root)
  ordered=result;version++;for(const notify of listeners)notify()
 }
 return{
  register(id:symbol,parent:symbol|null,node:HTMLElement){
   if(entries.has(id))throw new Error('Shell surface already mounted')
   for(let ancestor=parent;ancestor!==null;ancestor=entries.get(ancestor)?.parent??null)if(ancestor===id)throw new Error('Shell surface parent cycle')
   const entry={id,parent,node,order:next++};entries.set(id,entry);publish()
   return()=>{if(entries.get(id)!==entry)return;entries.delete(id);publish()}
  },
  subscribe(notify:()=>void){listeners.add(notify);return()=>{listeners.delete(notify)}},
  version:()=>version,
  rank:(id:symbol)=>ordered.findIndex(entry=>entry.id===id),
  top:()=>ordered.at(-1)??null,
  get size(){return entries.size},
 }
}
