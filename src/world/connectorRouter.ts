import type {Vec3,WorldAnchor} from '../contracts/world'
import {curvedPath,prepareConnectorFaceClearance,roundedConnectorPoints,surfaceConnectorPoints} from './connectorRouting'

type Route=(from:Vec3,to:Vec3,source?:WorldAnchor,target?:WorldAnchor,left?:boolean)=>readonly Vec3[]
export interface ConnectorRouter {
 forBodies(bodies:readonly WorldAnchor[]):Route
 stats():{contexts:number;routes:number;computedRoutes:number}
}
const contextLimit=2,routeLimit=256
const geometry=(anchor:WorldAnchor|undefined)=>anchor?[anchor.entityId,anchor.position,anchor.size]:null

/** Only represented geometry and exact terminal coordinates determine a route.
 * Two bounded contexts support returning from inspection to the same World.
 * No scene, trace, runtime root, value or provenance record is retained here. */
export function createConnectorRouter():ConnectorRouter {
 const contexts=new Map<string,{route:Route;paths:Map<string,readonly Vec3[]>}>()
 let computedRoutes=0
 return{
  stats:()=>({contexts:contexts.size,routes:[...contexts.values()].reduce((count,context)=>count+context.paths.size,0),computedRoutes}),
  forBodies(bodies){
   // Preserve obstacle ordering: the bounded nearest-obstacle policy uses its
   // stable order for equal-distance ties. Coordinate wrappers may change.
   const key=JSON.stringify(bodies.map(geometry)),prior=contexts.get(key)
   if(prior){contexts.delete(key);contexts.set(key,prior);return prior.route}
   const clears=prepareConnectorFaceClearance(bodies),paths=new Map<string,readonly Vec3[]>()
   const route:Route=(from,to,source,target,left=false)=>{
    const key=JSON.stringify([from,to,geometry(source),geometry(target),left]),cached=paths.get(key)
    if(cached){paths.delete(key);paths.set(key,cached);return cached}
    let points=curvedPath(from,to,left)
    if(source&&target&&!clears(points,source,target)){
     const corridor=surfaceConnectorPoints(from,to,source,target,bodies)
     points=roundedConnectorPoints(corridor)
     for(const radius of [.35,.18,.08]){
      const rounded=roundedConnectorPoints(corridor,radius)
      if(clears(rounded,source,target)){points=rounded;break}
     }
    }
    const immutable=Object.freeze(points.map(point=>Object.freeze([...point]) as Vec3))
    computedRoutes++;paths.set(key,immutable)
    if(paths.size>routeLimit)paths.delete(paths.keys().next().value!)
    return immutable
   }
   contexts.set(key,{route,paths})
   if(contexts.size>contextLimit)contexts.delete(contexts.keys().next().value!)
   return route
  },
 }
}
