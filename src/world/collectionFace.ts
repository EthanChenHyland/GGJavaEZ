import type {Vec3,WorldAnchor} from '../contracts/worldV2'
import {world} from '../theme/tokens'

/** Reservation geometry only. Callers provide captured entry indices; this
 * function never creates entries or changes the parent's canonical anchor. */
export function collectionEntryFace(anchor:WorldAnchor,index:number,map=false){
 if(!Number.isSafeInteger(index)||index<0||index>=world.collection.rows*world.collection.columns)return null
 const [x,y,z]=anchor.position,[w,h,d]=anchor.size,{rows,columns,pitch,sizeRow}=world.collection
 const row=index%rows,column=Math.floor(index/rows),cy=y+h/2-world.object.header-sizeRow-(row+.5)*pitch
 if(cy-pitch*.365<y-h/2+world.object.pad)return null
 const cx=x-w/2+(column+.5)*w/columns,face=z+d/2
 const width=w/columns-.25,height=pitch*.73
 return{centre:[cx,cy,face]as Vec3,width,height,
  value:[cx+(map?w/(columns*4):0),cy,face+.06]as Vec3,
  key:map?[cx-w/(columns*4),cy,face+.06]as Vec3:null,
  valueWidth:map?width/2-.04:width}
}
