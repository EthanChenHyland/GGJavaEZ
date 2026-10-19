import type {Vec3,WorldAnchor} from '../contracts/world'
export function anchorCorners(anchor:WorldAnchor):Vec3[]{
 return [-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>anchor.position.map((v,axis)=>v+[x,y,z][axis]*anchor.size[axis]/2) as unknown as Vec3)))
}
