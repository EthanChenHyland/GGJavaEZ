import type {Vec3,WorldAnchor} from '../contracts/worldV2'

/** One structural cuboid envelope shared by routing, drawing and picking.
 * The canonical representative supplies identity/position, never runtime ports.
 */
export const clusterSize:Vec3=[2.4,1.2,.8]
export function clusterAnchor(id:string,representative:WorldAnchor):WorldAnchor {
 const [x,y,z]=representative.position
 return{entityId:id,region:representative.region,position:representative.position,size:clusterSize,ports:{},bodyPort:[x,y,z+clusterSize[2]/2]}
}
