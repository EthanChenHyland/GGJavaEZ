import type {PresentationPlan,SceneModel,Vec3} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {buildExceptionPanelModel,layoutExceptionPanel} from '../render/exceptionPanelModel'
import {projectExceptionPanel} from '../render/exceptionPanelPresentation'
import {anchorCorners} from '../world/anchorGeometry'
import {projectionCamera,screenPoint,type OrbitPose,type Size} from './projection'

/** Resolve the actual camera-aware evidence footprint without changing runtime
 * anchors. The caller retains its existing Home/Hero/Follow movement policy. */
export function fitForensicFraming(points:readonly Vec3[],panel:NonNullable<PresentationPlan['exceptionPanel']>,recording:SceneModel['recording'],initial:OrbitPose,safe:Rect,viewport:Size,fit:(points:readonly Vec3[],current:OrbitPose)=>OrbitPose):{pose:OrbitPose;points:readonly Vec3[]}{
 const base=exceptionPanelAnchor(panel,recording),layout=layoutExceptionPanel(buildExceptionPanelModel(panel.content,recording.state))
 let pose=initial,fitted=points
 for(let refine=0;refine<32;refine++){
  const camera=projectionCamera(pose,viewport),presented=projectExceptionPanel(base,layout,camera,viewport,safe)
  fitted=[...points,...anchorCorners(presented.anchor)]
  if(fitted.every(point=>{const p=screenPoint(point,camera,viewport);return p.z>-1&&p.z<1&&p.x>=safe.x-1e-7&&p.x<=safe.x+safe.width+1e-7&&p.y>=safe.y-1e-7&&p.y<=safe.y+safe.height+1e-7}))break
  pose=fit(fitted,pose)
 }
 return{pose,points:fitted}
}
