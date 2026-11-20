import {PerspectiveCamera,Vector3,type Camera} from 'three'
import type {Vec3,WorldAnchor} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import type {Size} from '../camera/projection'
import type {ExceptionPanelLayout} from './exceptionPanelModel'
import {anchorCorners} from '../world/anchorGeometry'

export const exceptionPanelMinimumPixels=12
/** Structural evidence grows left and up beside the throwing frame. Runtime anchors,
 * local font tokens and panel depth remain fixed. Rendering and camera fitting
 * use the same projection; no runtime entity or pick identity is introduced. */
export function projectExceptionPanel(anchor:WorldAnchor,layout:ExceptionPanelLayout,camera:Camera,viewport:Size,safe:Rect):{anchor:WorldAnchor;scale:number}{
 const unchanged={anchor,scale:1}
 if(!(camera instanceof PerspectiveCamera)||viewport.height<=0)return unchanged
 let scale=1
 const fixed=new Vector3(),atOne=new Vector3(),factor=viewport.height/(2*Math.tan(camera.fov*Math.PI/360))
 for(const line of layout.lines){
  // Depth(s)=a+b*s with the right and bottom edges fixed beside the frame.
  // size*s*factor/Depth(s)>=minimum is a linear inequality in s.
  fixed.set(anchor.position[0]+anchor.size[0]/2,anchor.position[1]-anchor.size[1]/2,anchor.position[2]+line.position[2])
  atOne.set(...anchor.position).add(new Vector3(...line.position))
  const a=-fixed.applyMatrix4(camera.matrixWorldInverse).z,b=-atOne.applyMatrix4(camera.matrixWorldInverse).z-a
  const denominator=line.size*factor-exceptionPanelMinimumPixels*b
  if(denominator<=0)return unchanged
  scale=Math.max(scale,exceptionPanelMinimumPixels*a/denominator)
 }
 if(!Number.isFinite(scale)||scale<=1)return unchanged
 const position:Vec3=[anchor.position[0]+anchor.size[0]*(1-scale)/2,anchor.position[1]+anchor.size[1]*(scale-1)/2,anchor.position[2]]
 const presented:WorldAnchor={...anchor,position,size:[anchor.size[0]*scale,anchor.size[1]*scale,anchor.size[2]],bodyPort:position}
 const corners=anchorCorners(presented).map(point=>new Vector3(...point).project(camera))
 const width=(Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)))*viewport.width/2
 const height=(Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y)))*viewport.height/2
 // Pathological wrapped content cannot all fit at the minimum in one viewport.
 // Retain its bounded world panel and exact Error Explorer details in that case.
 if(width>safe.width||height>safe.height||corners.some(p=>!Number.isFinite(p.z)||p.z<=-1||p.z>=1))return unchanged
 return{anchor:presented,scale}
}
