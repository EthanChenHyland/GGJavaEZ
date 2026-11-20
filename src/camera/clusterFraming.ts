import type { DetailLevel, PresentedCluster, SceneModel, Vec3, WorldAnchor } from '../contracts/world'
import type { Rect } from '../shell/shellLayout'
import { camera as tokens } from '../theme/tokens'
import { cameraPosition,fitToSafeFrame,nextDetailLevel,projectionCamera,representativeFaceHeight,screenPoint,type OrbitPose,type Size } from './projection'
import {createMemberVisibility} from './memberVisibility'
import {Vector3} from 'three'
import {faceHeading} from '../render/text/faceTypography'
import {projectedFontPixels,projectedPlaneFontPixels} from '../render/text/textSystem'

export interface ClusterDestination { memberId:string;pose:OrbitPose;detailLevel:'MEDIUM'|'CLOSE';canonicalRatio:number }
const corners=(anchor:WorldAnchor):Vec3[]=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>anchor.position.map((v,i)=>v+[x,y,z][i]*anchor.size[i]/2) as unknown as Vec3)))
const overlaps=(a:WorldAnchor,b:WorldAnchor)=>a.position.every((v,i)=>Math.abs(v-b.position[i])<(a.size[i]+b.size[i])/2)
const inside=(point:ReturnType<typeof screenPoint>,safe:Rect)=>point.z>-1&&point.z<1&&point.x>=safe.x&&point.x<=safe.x+safe.width&&point.y>=safe.y&&point.y<=safe.y+safe.height

/** Prefer viewport-centre framing where the real Safe Frame permits it. The
 * semantic metric samples that centre, independently of the presentation cut. */
function centralArea(safe:Rect,viewport:Size):Rect {
  const x=Math.max(safe.x+safe.width*.25,Math.min(safe.x+safe.width*.75,viewport.width/2))
  const y=Math.max(safe.y+safe.height*.25,Math.min(safe.y+safe.height*.75,viewport.height/2))
  const w=Math.min(x-safe.x,safe.x+safe.width-x),h=Math.min(y-safe.y,safe.y+safe.height-y)
  return{x:x-w,y:y-h,width:2*w,height:2*h}
}

/** A bounded physical-pose search. Never sets LOD, mutates anchors, substitutes
 * the proxy for a runtime member, or reads a future/absent member. Admission
 * applies ordinary destination constraints before measuring the final pose. */
export function clusterFraming(scene:SceneModel,cluster:PresentedCluster|undefined,safe:Rect,viewport:Size,current?:OrbitPose,admit:(pose:OrbitPose)=>OrbitPose=pose=>pose):ClusterDestination|null {
  if(!cluster||!cluster.memberIds.length||![safe.x,safe.y,safe.width,safe.height,viewport.width,viewport.height].every(Number.isFinite)
    ||safe.width<=0||safe.height<=0||viewport.width<=0||viewport.height<=0)return null
  const desired=cluster.key.kind==='ownership'?'CLOSE':'MEDIUM',target=desired==='CLOSE'?.2:.1
  const members=cluster.memberIds.map(id=>scene.entities[id]).filter(node=>!!node&&
    (cluster.members===1||!overlaps(node.anchor,cluster.anchor)))
    .sort((a,b)=>Math.hypot(...a.anchor.position.map((v,i)=>v-cluster.anchor.position[i]))-Math.hypot(...b.anchor.position.map((v,i)=>v-cluster.anchor.position[i]))||a.id.localeCompare(b.id)).slice(0,3)
  const ownership=cluster.key.kind==='ownership',visibility=ownership?createMemberVisibility(scene):null
  const angles=[...(current?[{yaw:current.yawDeg,pitch:current.pitchDeg}]:[]),tokens.hero,tokens.focus,
    ...(ownership?[{yaw:8,pitch:-35},{yaw:8,pitch:-55},{yaw:45,pitch:-35},{yaw:-45,pitch:-35},{yaw:65,pitch:-25},{yaw:-65,pitch:-25}]:[])]
    .filter((angle,index,all)=>all.findIndex(other=>other.yaw===angle.yaw&&other.pitch===angle.pitch)===index)
  let best:ClusterDestination|null=null,score=Infinity
  // Centre-biased framing can waste half the available height beside a narrow
  // sheet. Use the full actual Safe Frame only when no centred pose is feasible.
  for(const area of [centralArea(safe,viewport),safe]){
  for(const node of members)for(const angle of angles){
    // Ownership cuts can span distant types. CLOSE removes the outgoing
    // ownership proxy, so its old position must not prevent framing an actual
    // residual member. Generic groups retain the existing proxy-centre rule.
    const points=[...corners(node.anchor),...(ownership?[]:[cluster.anchor.position])],base=fitToSafeFrame(points,angle,area,viewport)
    const center=[0,1,2].map(axis=>(Math.min(...points.map(point=>point[axis]))+Math.max(...points.map(point=>point[axis])))/2) as unknown as Vec3
    for(let sample=0;sample<=32;sample++){
      const factor=2**(sample/8),pose=admit({...base,distance:base.distance*factor,
        target:base.target.map((v,i)=>center[i]+(v-center[i])*factor) as unknown as Vec3})
      if(![...pose.target,pose.distance,pose.yawDeg,pose.pitchDeg].every(Number.isFinite)||pose.distance<=0)continue
      const camera=projectionCamera(pose,viewport)
      camera.near=.05;camera.far=10000;camera.updateProjectionMatrix()
      if(!points.every(point=>inside(screenPoint(point,camera,viewport),safe)))continue
      if(ownership){
        const heading=faceHeading(node)
        if([heading.title,...(heading.identity?[heading.identity]:[]),...(heading.length?[heading.length]:[])].some(label=>{
          const point=new Vector3(...label.position)
          return projectedFontPixels(label.size,point,camera,viewport.height)<12||projectedPlaneFontPixels(label.size,point,camera,viewport)<12||projectedPlaneFontPixels(label.size,point,camera,viewport,'x')<12
        }))continue
      }
      const height=representativeFaceHeight(scene,camera,viewport)
      if(height===null||!(['FAR','MEDIUM','CLOSE'] as DetailLevel[]).every(level=>nextDetailLevel(level,height,viewport.height)===desired))continue
      const ratio=height/viewport.height,error=Math.abs(ratio-target),sightline=visibility?.(node,cameraPosition(pose))
      const ranked=error+(sightline?sightline.blocked+(sightline.centreBlocked?6:0):0)
      if(ranked<score){score=ranked;best={memberId:node.id,pose,detailLevel:desired,canonicalRatio:ratio}}
      if(ranked<.005)return best
    }
  }
  if(best)return best
  }
  return best
}
