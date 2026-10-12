import type {Page} from '@playwright/test'
import type {OrbitPose} from '../../src/camera/projection'
/** Read actual inputs, then run the same pure solver/routing functions. This
 * diagnostic never sets application state, pose, selection or runtime data. */
export async function clusterDiagnostics(page:Page,id:string){return page.evaluate(async id=>{
 const paths=['/src/world/layoutEngine.ts','/src/camera/clusterFraming.ts','/src/camera/CameraRig.tsx','/src/camera/cameraConstraints.ts','/src/camera/guidedTravel.ts','/src/camera/projection.ts','/src/camera/cameraStore.ts','/src/theme/tokens.ts']
 const [layoutModule,framing,rig,constraints,travel,projection,cameraStore,theme]=await Promise.all(paths.map(path=>import(path)))
 const world=window.__ggjavaezWorld!,scene=world.scene(),cluster=world.plan().clusters.find(cluster=>cluster.id===id),eye=window.__ggjavaezQA!.cameraPose(),shell=window.__ggjavaezQA!.shellRects(),viewport={width:innerWidth,height:innerHeight}
 const engine=layoutModule.createLayoutEngine();engine.append(world.recordedEvents());const layout=engine.state,diagonal=Math.hypot(...layout.bounds.size)
 const boxes=constraints.cameraCollisionBoxes(Object.values(scene.entities).map(node=>node.anchor),.05,theme.camera.fov*Math.PI/180,innerWidth/innerHeight),limits={minDistance:theme.camera.minDistance,maxDistance:Math.max(theme.camera.minDistance,3*diagonal),pan:[Math.max(12,diagonal),Math.max(12,diagonal),Math.max(12,diagonal)]}
 const safe={...shell.safeFrame};if(innerWidth<1024&&shell.inspector)safe.height=Math.max(0,Math.min(safe.y+safe.height,shell.inspector.y-innerHeight*.01)-safe.y)
 const destination=framing.clusterFraming(scene,cluster,safe,viewport,rig.orbitPoseFromEye(eye),(pose:OrbitPose)=>{
  const requested={position:projection.cameraPosition(pose),target:pose.target}
  return rig.orbitPoseFromEye(constraints.constrainCameraPose(requested,requested,boxes,layout.bounds.center,limits))
 })
 const route=destination?travel.guidedTravel(eye,[destination.pose],boxes,layout.bounds.center,limits):null
 return{scene,cluster,eye,shell,safe,layout,destination,selection:window.__ggjavaezQA!.selection(),intent:cameraStore.useCameraStore.getState().intent,routeEnd:route?.path.at(-1),requestedEnd:destination?{position:projection.cameraPosition(destination.pose),target:destination.pose.target}:null}
},id)}
