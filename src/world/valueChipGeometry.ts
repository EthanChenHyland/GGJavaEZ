import type {Vec3,WorldAnchor} from '../contracts/world'

// One physical inset model for the visible value and its reference attachment.
const inset=.28,fillPadding=.04,fillDepth=.012,faceOffset=.025,fillOffset=.050
export function valueChipGeometry(anchor:WorldAnchor,rowY:number,valueWidth:number,pitch:number){
 const [x,,z]=anchor.position,[w,,d]=anchor.size,face=z+d/2+faceOffset
 const centre=x+w/2-inset-valueWidth/2,height=pitch*.62
 return{
  rim:{position:[centre,rowY,face+.042]as Vec3,size:[valueWidth+.12,height+.08,.012]as Vec3},
  fill:{position:[centre,rowY,face+fillOffset]as Vec3,size:[valueWidth+fillPadding,height,fillDepth]as Vec3},
 }
}
export function valueChipReferencePort(anchor:WorldAnchor,rowY:number):Vec3{
 const[x,,z]=anchor.position,[w,,d]=anchor.size
 return[x+w/2-inset+fillPadding/2,rowY,z+d/2+faceOffset+fillOffset+fillDepth/2]
}
