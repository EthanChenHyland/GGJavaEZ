import type {Vec3,WorldAnchor} from '../contracts/world'

/** One structural cuboid envelope shared by routing, drawing and picking.
 * The canonical representative supplies identity/position, never runtime ports.
 */
export const clusterSize:Vec3=[2.4,1.2,.8]
export function clusterAnchor(id:string,representative:WorldAnchor,position?:Vec3):WorldAnchor {
 const [x,y,z]=representative.position
 const proxy:Vec3=position??(representative.region==='stack'||representative.region==='class'?[x-representative.size[0]/2-clusterSize[0]/2-.4,y,z]:[x,y+representative.size[1]/2+clusterSize[1]/2+.4,z])
 return{entityId:id,region:representative.region,position:proxy,size:clusterSize,ports:{},bodyPort:[proxy[0],proxy[1],proxy[2]+clusterSize[2]/2]}
}
