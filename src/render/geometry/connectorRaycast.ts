import type {Intersection,Raycaster} from 'three'
import {LineSegments2} from 'three/addons/lines/LineSegments2.js'

export interface ConnectorPickData {ids:readonly string[];order:ReadonlyMap<string,number>;halo:boolean}

// Coincident segments with different endpoints can produce distances one ULP
// apart. Only absorb arithmetic roundoff, never a screen/world-space pick gap.
const roundoff=(distance:number)=>32*Number.EPSILON*Math.max(1,Math.abs(distance))
const data=(hit:Intersection)=>hit.object.userData.runtimeConnectorPick as ConnectorPickData|undefined
function rank(hit:Intersection):number{
 const pick=data(hit),id=pick?.ids[hit.faceIndex??-1]
 return id===undefined?Infinity:pick!.order.get(id)??Infinity
}

export function canonicalConnectorRaycast(this:LineSegments2,raycaster:Raycaster,hits:Intersection[]):void{
 const candidates:Intersection[]=[]
 LineSegments2.prototype.raycast.call(this,raycaster,candidates)
 if(!candidates.length)return
 let nearest=Infinity
 for(const hit of candidates)nearest=Math.min(nearest,hit.distance)
 let chosen:Intersection|undefined
 for(const hit of candidates){
  if(hit.distance-nearest>roundoff(nearest))continue
  if(!chosen||rank(hit)<rank(chosen)||(rank(hit)===rank(chosen)&&(hit.faceIndex??Infinity)<(chosen.faceIndex??Infinity)))chosen=hit
 }
 // Fiber consumes one owner per line batch. Returning that original hit keeps
 // Three's subsequent distance sort from undoing the tie decision.
 if(chosen)hits.push(chosen)
}

export function prioritizeConnectorIntersections<T extends Intersection>(hits:T[]):T[]{
 const result=hits.slice()
 for(let start=0;start<result.length;){
  let end=start+1
  while(end<result.length&&result[end].distance-result[start].distance<=roundoff(result[start].distance))end++
  const group=result.slice(start,end),order=data(group[0])?.order
  // Protected faces and other event layers retain their original precedence.
  // Only reorder bands of the same connector batch.
  if(order&&group.every(hit=>data(hit)?.order===order)){
   group.sort((a,b)=>rank(a)-rank(b)||Number(data(a)!.halo)-Number(data(b)!.halo))
   result.splice(start,group.length,...group)
  }
  start=end
 }
 return result
}
