import { Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { SpatialPresentation } from '../world/spatialPresentation'

declare global {
  interface Window {
    __VJ_QA_RENDER_METRICS__?: boolean
    __VJ_RENDER_METRICS__?: Record<string, number | string>
    __VJ_REFERENCE_PICK_POINTS__?: Record<string, {x:number;y:number}>
  }
}
/** Explicit local QA probe. Disabled by default and omitted from production.
 * Reports CPU/scene counters; it cannot measure physical GPU presentation. */
export function RendererMetrics({plan}:{plan:SpatialPresentation}) {
  const {gl,scene,camera,size}=useThree()
  useFrame(()=>{
    if(!window.__VJ_QA_RENDER_METRICS__)return
    let labels=0,visibleLabels=0,pickTargets=0
    const referencePoints: Record<string, {x:number;y:number}> = {}
    scene.traverse(object=>{
      if(object.userData.referenceId && object.userData.pickPoint) {
        const point=object.localToWorld(new Vector3().fromArray(object.userData.pickPoint)).project(camera)
        referencePoints[object.userData.referenceId]={x:(point.x+1)*size.width/2,y:(1-point.y)*size.height/2}
      }
      if(typeof (object as unknown as {text?:unknown}).text==='string') {
        labels++
        let visible=true,parent:typeof object|null=object
        while(parent){if(!parent.visible){visible=false;break}parent=parent.parent}
        if(visible)visibleLabels++
      }
      if((object as unknown as {__r3f?:{handlers?:{onClick?:unknown}}}).__r3f?.handlers?.onClick)pickTargets++
    })
    window.__VJ_REFERENCE_PICK_POINTS__=referencePoints
    const frameCentersInView = plan.scene.frames.filter(node => {
      const point=new Vector3(...node.anchor.position).project(camera)
      return point.z>=-1&&point.z<=1&&Math.abs(point.x)<0.95&&Math.abs(point.y)<0.9
    }).length
    window.__VJ_RENDER_METRICS__={detailLevel:plan.scene.detailLevel,labels,visibleLabels,pickTargets,
      frameCentersInView,
      frames:plan.scene.frames.length,objects:plan.scene.objects.length,classes:plan.scene.classes?.length??0,
      faceEntities:plan.faceIds.size,references:plan.scene.references.length,flows:plan.flows.length,
      clusters:plan.labelledClusters.length,quietVolumes:plan.quietVolumes.length,
      drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,
      geometries:gl.info.memory.geometries,textures:gl.info.memory.textures}
  })
  return null
}
