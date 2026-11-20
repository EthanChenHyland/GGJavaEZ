import type {Selection} from '../contracts/interaction'
import type {PresentationPlan,SceneModel,Vec3} from '../contracts/world'
import {anchorCorners} from '../world/anchorGeometry'
import {facePlate} from '../world/facePlate'
import {projectionCamera,screenPoint,type OrbitPose,type Size} from '../camera/projection'
import {inspectorEntity} from './inspection'

/** Resolve only actual presented geometry. Historical/unsupported evidence
 * without a current body or curve never manufactures a spatial target. */
export function inspectorTargetPoints(scene:SceneModel,plan:PresentationPlan,selection:Selection):readonly Vec3[]{
 if(!selection)return[]
 if(selection.kind==='reference'||selection.kind==='flow'||selection.kind==='bundle')return(plan.curves.find(curve=>curve.id===selection.id)??plan.bundles.find(bundle=>bundle.id===selection.id))?.points??[]
 if(selection.kind==='cluster'){const cluster=plan.clusters.find(cluster=>cluster.id===selection.id);return cluster?anchorCorners(cluster.anchor):[]}
 const node=inspectorEntity(scene,selection),presented=node?plan.entities.get(node.id):undefined
 if(!node||!presented)return[]
 if(selection.kind==='slot'){
  const anchor=node.kind==='array'?plan.cellWindows.get(node.id)?.mapping.get(selection.id)?.anchor:presented.mode==='detailed'?facePlate(node,presented,selection.id):null
  return anchor?anchorCorners(anchor):[]
 }
 return anchorCorners(node.anchor)
}
export function inspectorSideForTarget(scene:SceneModel,plan:PresentationPlan,selection:Selection,pose:OrbitPose,viewport:Size):'left'|'right'|null{
 if(viewport.width<=0||viewport.height<=0)return null
 const camera=projectionCamera(pose,viewport),xs=inspectorTargetPoints(scene,plan,selection).map(point=>screenPoint(point,camera,viewport).x).filter(Number.isFinite)
 if(!xs.length)return null
 const center=(Math.min(...xs)+Math.max(...xs))/2
 return center>=viewport.width/2?'left':'right'
}
