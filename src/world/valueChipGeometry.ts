import type {Vec3,WorldAnchor} from '../contracts/world'

// One physical inset model for the visible value and its reference attachment.
const inset=.28,fillPadding=.04,fillDepth=.012,faceOffset=.025,fillOffset=.050
/** Centred values share the same inset construction as right-aligned rows. */
export function centredValueChipGeometry(centre:Vec3,valueWidth:number,pitch:number){
 const [x,y,z]=centre,face=z+faceOffset,height=pitch*.62
 return{
  rim:{position:[x,y,face+.042]as Vec3,size:[valueWidth+.12,height+.08,.012]as Vec3},
  fill:{position:[x,y,face+fillOffset]as Vec3,size:[valueWidth+fillPadding,height,fillDepth]as Vec3},
 }
}
export function centredValueChipReferencePort(centre:Vec3,valueWidth:number):Vec3{
 return[centre[0]+valueWidth/2+fillPadding/2,centre[1],centre[2]+faceOffset+fillOffset+fillDepth/2]
}
export function valueChipGeometry(anchor:WorldAnchor,rowY:number,valueWidth:number,pitch:number){
 const [x,,z]=anchor.position,[w,,d]=anchor.size
 return centredValueChipGeometry([x+w/2-inset-valueWidth/2,rowY,z+d/2],valueWidth,pitch)
}
export function valueChipReferencePort(anchor:WorldAnchor,rowY:number):Vec3{
 const[x,,z]=anchor.position,[w,,d]=anchor.size
 return[x+w/2-inset+fillPadding/2,rowY,z+d/2+faceOffset+fillOffset+fillDepth/2]
}
