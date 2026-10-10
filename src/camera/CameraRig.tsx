import {useEffect,useMemo,useRef,type RefObject} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {OrbitControls} from '@react-three/drei'
import {PerspectiveCamera,Vector3,MOUSE} from 'three'
import type {OrbitControls as Controls} from 'three-stdlib'
import type {LayoutState,PresentationPlan,SceneModel,Vec3} from '../contracts/worldV2'
import type {Rect} from '../shell/shellLayout'
import {useCameraStore} from './cameraStore'
import {useInteractionStore} from '../interaction/interactionStore'
import {camera as tokens,motion} from '../theme/tokens'
import {cameraPosition,fitToSafeFrame,frontFace,nextDetailLevel,representativeFaceHeight,type OrbitPose} from './projection'
import {cameraCollisionBoxes,collisionSafeRoute,constrainCameraPose,type EyePose} from './cameraConstraints'
import {anchorCorners} from '../world/presentationPlanner'
import {homeFraming} from './homeFraming'
import {followFraming} from './followFraming'
import {requestAnimationFrameRender} from '../render/renderActivity'
export interface CameraInput {cancel():void;key(key:string,shift:boolean):void;wheel(dx:number,dy:number,pixelPan:boolean):void;shift(value:boolean):void}
export const cameraReadiness={moving:false}
const tuple=(v:Vector3):Vec3=>[v.x,v.y,v.z]
const ease=(t:number)=>t<.5?4*t*t*t:1-(-2*t+2)**3/2
export function orbitPoseFromEye(eye:EyePose):OrbitPose {
 const delta=new Vector3(...eye.position).sub(new Vector3(...eye.target)),distance=delta.length()
 return{target:eye.target,distance,yawDeg:Math.atan2(delta.x,delta.z)*180/Math.PI,pitchDeg:-Math.asin(Math.max(-1,Math.min(1,delta.y/Math.max(distance,1e-9))))*180/Math.PI}
}
/** One owner commits semantic poses, then applies optional visual travel. Camera input cancels synchronously. */
export function CameraRig({scene,plan,layout,safeFrame,input}:{scene:SceneModel;plan:PresentationPlan;layout:LayoutState;safeFrame:Rect;input:RefObject<CameraInput|null>}) {
 const {camera,size,invalidate}=useThree(),controls=useRef<Controls>(null),intentRevision=useCameraStore(state=>state.intentRevision)
 const move=useRef<{start:number;duration:number;path:EyePose[];lengths:number[];total:number;home:boolean}|null>(null)
 const initialized=useRef(false),recordingId=useRef(scene.recordingId),lastDetail=useRef(-Infinity),lastCursor=useRef(-1),lastFollow=useRef(-1)
 const diagonal=layout.bounds?Math.hypot(...layout.bounds.size):24
 const limits=useMemo(()=>({minDistance:tokens.minDistance,maxDistance:Math.max(tokens.minDistance,3*diagonal),pan:[Math.max(12,diagonal),Math.max(12,diagonal),Math.max(12,diagonal)] as Vec3}),[diagonal])
 const boxes=useMemo(()=>cameraCollisionBoxes(Object.values(scene.entities).map(node=>node.anchor),camera.near,tokens.fov*Math.PI/180,size.width/size.height),[scene.entities,camera.near,size.width,size.height])
 const eye=():EyePose=>({position:tuple(camera.position),target:tuple(controls.current?.target??new Vector3())})
 const previous=useRef<EyePose>(eye()),latest=useRef({scene,plan,safeFrame,boxes,limits})
 latest.current={scene,plan,safeFrame,boxes,limits}
 const reduced=()=>useCameraStore.getState().reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches
 const begin=(pose:OrbitPose,duration:number,home=false)=>{
  const from=eye(),destination={position:cameraPosition(pose),target:pose.target},path=[from,...collisionSafeRoute(from,destination,latest.current.boxes,layout.bounds?.center,latest.current.limits)]
  const lengths=path.slice(1).map((point,i)=>new Vector3(...point.position).distanceTo(new Vector3(...path[i].position))),total=lengths.reduce((sum,n)=>sum+n,0)
  move.current={start:performance.now(),duration:reduced()?0:duration,path,lengths,total,home}
  invalidate()
 }
 const homeCache=useRef<{scene:SceneModel;key:string;pose:OrbitPose}|null>(null)
 const home=()=>{const current=latest.current,key=JSON.stringify([current.safeFrame,size.width,size.height]);if(homeCache.current?.scene===current.scene&&homeCache.current.key===key)return homeCache.current.pose;const pose=homeFraming(current.scene,current.plan,current.safeFrame,size).pose;homeCache.current={scene:current.scene,key,pose};return pose}
 useEffect(()=>{
  if(!(camera instanceof PerspectiveCamera))return
  camera.fov=tokens.fov;camera.near=.05;camera.far=10000;camera.updateProjectionMatrix()
  if(!initialized.current||recordingId.current!==scene.recordingId){initialized.current=true;recordingId.current=scene.recordingId;begin(home(),scene.cursor?600:0);useCameraStore.setState({follow:scene.cursor>0})}
 },[scene.recordingId,camera])
 useEffect(()=>{
  const state=useCameraStore.getState(),intent=state.intent
  if(!intent){move.current=null;return}
  invalidate()
  if(intent.kind==='pose'){move.current=null;camera.position.set(...cameraPosition(intent.pose));controls.current?.target.set(...intent.pose.target);previous.current=eye();return}
  if(intent.kind==='home')begin(home(),motion.homeMs,true)
  if(intent.kind==='recording')begin(home(),scene.cursor?600:0)
  if(intent.kind==='focus'){
   const owner=plan.framing.focus?.targetId??intent.targetId,node=scene.entities[owner],cell=[...plan.cellWindows.values()].flatMap(window=>[...window.mapping.values()]).find(cell=>cell.anchor.entityId===intent.targetId)
   const anchor=cell?.anchor??node?.anchor??plan.clusters.find(cluster=>cluster.id===intent.targetId)?.anchor
   if(!anchor)return
   const height=Math.min(safeFrame.height,size.height*tokens.focus.faceH),width=Math.min(safeFrame.width,size.width*tokens.focus.faceW)
   const area={x:safeFrame.x+(safeFrame.width-width)/2,y:safeFrame.y+(safeFrame.height-height)/2,width,height}
   const neighbours=plan.framing.focus?.neighbours??[],left=neighbours.filter(id=>scene.entities[id]?.anchor.position[0]<anchor.position[0]).length,right=neighbours.length-left
   begin(fitToSafeFrame(frontFace(anchor),{yaw:left>=right?Math.abs(tokens.focus.yaw):-Math.abs(tokens.focus.yaw),pitch:tokens.focus.pitch},area,size),motion.focusMs)
  }
  if(intent.kind==='exitFocus')begin(intent.pose,motion.exitFocusMs)
  if(intent.kind==='zoom'){move.current=null;const pivot=controls.current?.target??new Vector3();camera.position.sub(pivot).multiplyScalar(intent.factor).add(pivot)}
  if(intent.kind==='followPath'){
   const curve=plan.curves.find(curve=>curve.id===intent.flowId);if(!curve)return
   const pose=fitToSafeFrame(curve.points,tokens.focus,safeFrame,size);begin(pose,1000)
  }
 },[intentRevision])
 useEffect(()=>{
  const cancel=()=>{move.current=null;lastFollow.current=-1;useCameraStore.getState().setPose(orbitPoseFromEye(eye()));useCameraStore.getState().userInput();invalidate()}
  input.current={cancel,shift(value){if(controls.current)controls.current.mouseButtons.LEFT=value?MOUSE.PAN:MOUSE.ROTATE},
   key(key,shift){cancel();const pivot=controls.current?.target;if(!pivot)return;const offset=camera.position.clone().sub(pivot)
    if(['+','=','-'].includes(key))offset.multiplyScalar(key==='-'?1.1:.9)
    else if(shift){const right=new Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new Vector3().setFromMatrixColumn(camera.matrixWorld,1);const delta=(key==='ArrowLeft'?right.multiplyScalar(-1):key==='ArrowRight'?right:key==='ArrowUp'?up:up.multiplyScalar(-1)).multiplyScalar(offset.length()*.025);camera.position.add(delta);pivot.add(delta);return}
    else {const distance=offset.length(),yaw=Math.atan2(offset.x,offset.z)+(key==='ArrowLeft'?-5:key==='ArrowRight'?5:0)*Math.PI/180,pitch=Math.max(2*Math.PI/180,Math.min(80*Math.PI/180,Math.asin(offset.y/distance)+(key==='ArrowUp'?5:key==='ArrowDown'?-5:0)*Math.PI/180));offset.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance)}camera.position.copy(pivot).add(offset)
   },wheel(dx,dy,pixelPan){cancel();const pivot=controls.current?.target;if(!pivot)return;if(!pixelPan){camera.position.sub(pivot).multiplyScalar(Math.exp(dy*.001)).add(pivot);return}const pixel=2*camera.position.distanceTo(pivot)*Math.tan(tokens.fov*Math.PI/360)/size.height,delta=new Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(dx*pixel).add(new Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar(-dy*pixel));camera.position.add(delta);pivot.add(delta)}
  };return()=>{input.current=null}
 },[camera,size.width,size.height])
 useFrame(()=>{
  const control=controls.current;if(!control||!(camera instanceof PerspectiveCamera))return
  const now=performance.now(),travel=move.current
  cameraReadiness.moving=!!travel
  if(travel){const t=travel.duration?Math.min(1,(now-travel.start)/travel.duration):1;let distance=ease(t)*travel.total,index=0;while(index<travel.lengths.length-1&&distance>travel.lengths[index]){distance-=travel.lengths[index];index++}const fraction=travel.lengths[index]?distance/travel.lengths[index]:1,from=travel.path[index],to=travel.path[index+1];camera.position.lerpVectors(new Vector3(...from.position),new Vector3(...to.position),fraction);control.target.lerpVectors(new Vector3(...from.target),new Vector3(...to.target),fraction);if(t===1){move.current=null;if(travel.home)useCameraStore.setState({mode:'EXPLORE',intent:null})}}
  control.update()
  const safe=constrainCameraPose(eye(),previous.current,latest.current.boxes,layout.bounds?.center,latest.current.limits);camera.position.set(...safe.position);control.target.set(...safe.target);camera.lookAt(control.target);camera.updateMatrixWorld();previous.current=safe
  useCameraStore.getState().setPose(orbitPoseFromEye(safe))
  const state=useCameraStore.getState(),focus=useInteractionStore.getState().focus
  if(state.follow&&!move.current&&!focus&&scene.cursor===scene.liveHead&&lastFollow.current!==scene.cursor){lastFollow.current=scene.cursor;const id=scene.liveStack.at(-1),node=id?scene.entities[id]:null;if(node?.kind==='frame'&&node.live){const pose=followFraming(anchorCorners(node.anchor),state.pose,safeFrame,size);if(pose)begin(pose,600)}}
  if(now-lastDetail.current>=200||lastCursor.current!==scene.cursor){lastDetail.current=now;lastCursor.current=scene.cursor;const next=nextDetailLevel(state.detailLevel,representativeFaceHeight(scene,camera,size),size.height);if(state.detailLevel!==next)state.setDetailLevel(next)}
  if(move.current)requestAnimationFrameRender(invalidate)
  cameraReadiness.moving=!!move.current
 })
 return <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={tokens.minDistance} maxDistance={Math.max(tokens.minDistance,3*diagonal)} minPolarAngle={10*Math.PI/180} maxPolarAngle={88*Math.PI/180} mouseButtons={{LEFT:MOUSE.ROTATE,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.PAN}} onStart={()=>input.current?.cancel()}/>
}
