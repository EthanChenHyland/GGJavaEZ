import {useEffect,useLayoutEffect,useMemo,useRef,type RefObject} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {OrbitControls} from '@react-three/drei'
import {PerspectiveCamera,Vector3,MOUSE} from 'three'
import type {OrbitControls as Controls} from 'three-stdlib'
import type {LayoutState,PresentationPlan,SceneModel,Vec3} from '../contracts/world'
import type {TraceEvent} from '../contracts/runtime'
import type {Rect} from '../shell/shellLayout'
import {useCameraStore} from './cameraStore'
import {useInteractionStore} from '../interaction/interactionStore'
import {camera as tokens,motion} from '../theme/tokens'
import {cameraPosition,nextDetailLevel,representativeFaceHeight,type OrbitPose} from './projection'
import {cameraCollisionAnchors,cameraCollisionBoxes,constrainCameraPose,type EyePose} from './cameraConstraints'
import {homeFraming} from './homeFraming'
import {heroFraming} from './heroFraming'
import {guidedFollow} from './guidedFollow'
import {focusFraming} from './focusFraming'
import {focusAngles} from './focusAngles'
import {followPathFraming} from './followPathFraming'
import {clusterFraming} from './clusterFraming'
import {guidedTravel,travelPose,type GuidedTravel} from './guidedTravel'
import {noteRequestedAnimationFrame,requestAnimationFrameRender} from '../render/renderActivity'
import {arrayCellCaptionPoints,arrayCellIndexLabel} from '../render/text/arrayIndexLayout'
import {productionClock} from '../motion/clock'
export interface CameraInput {cancel():void;orbit():void;key(key:string,shift:boolean):void;wheel(dx:number,dy:number,pixelPan:boolean):void;shift(value:boolean):void}
export const cameraReadiness={moving:false}
const tuple=(v:Vector3):Vec3=>[v.x,v.y,v.z]
const ease=(t:number)=>t<.5?4*t*t*t:1-(-2*t+2)**3/2
export function orbitPoseFromEye(eye:EyePose):OrbitPose {
 const delta=new Vector3(...eye.position).sub(new Vector3(...eye.target)),distance=delta.length()
 return{target:eye.target,distance,yawDeg:Math.atan2(delta.x,delta.z)*180/Math.PI,pitchDeg:-Math.asin(Math.max(-1,Math.min(1,delta.y/Math.max(distance,1e-9))))*180/Math.PI}
}
/** One owner commits semantic poses, then applies optional visual travel. Camera input cancels synchronously. */
export function CameraRig({scene,plan,event,layout,safeFrame,focusContentFrame,inspectorRect,input}:{scene:SceneModel;plan:PresentationPlan;event:TraceEvent|null;layout:LayoutState;safeFrame:Rect;focusContentFrame?:Rect;inspectorRect?:Rect|null;input:RefObject<CameraInput|null>}) {
 const {camera,size,invalidate}=useThree(),controls=useRef<Controls>(null),intentRevision=useCameraStore(state=>state.intentRevision)
 useEffect(()=>productionClock.subscribe(invalidate),[invalidate])
 const move=useRef<(GuidedTravel&{start:number;duration:number;home:boolean;homeKey?:string;settledFrames?:number;flowId?:string;flowPrefix?:{recordingId:string;cursor:number}})|null>(null)
 const initialized=useRef(false),recordingId=useRef(scene.recordingId),lastDetail=useRef(-Infinity),lastCursor=useRef(-1),lastFollow=useRef(-1)
 const followEnabled=useCameraStore(state=>state.follow),followRecursion=useRef<boolean|null>(null),followForensic=useRef(false)
 useEffect(()=>{lastFollow.current=-1;followRecursion.current=null;invalidate()},[followEnabled,invalidate])
 const diagonal=layout.bounds?Math.hypot(...layout.bounds.size):24
 const limits=useMemo(()=>({minDistance:tokens.minDistance,maxDistance:Math.max(tokens.minDistance,3*diagonal),pan:[Math.max(12,diagonal),Math.max(12,diagonal),Math.max(12,diagonal)] as Vec3}),[diagonal])
 const boxes=useMemo(()=>cameraCollisionBoxes(cameraCollisionAnchors(scene),camera.near,tokens.fov*Math.PI/180,size.width/size.height),[scene.entities,scene.io,camera.near,size.width,size.height])
 const eye=():EyePose=>({position:tuple(camera.position),target:tuple(controls.current?.target??new Vector3())})
 const previous=useRef<EyePose>(eye()),latest=useRef({scene,plan,safeFrame,boxes,limits})
 latest.current={scene,plan,safeFrame,boxes,limits}
 // Semantic zoom may change the represented cut after Hero travel. Keep that
 // explicit framing request valid for the bodies now rendered. Other camera
 // commands retain their own lifecycle; user input clears the Hero intent.
 const framingCutKey=JSON.stringify([scene.recordingId,scene.cursor,plan.detailLevel,[...plan.entities.keys()],[...plan.pinned],plan.clusters.map(cluster=>cluster.id),safeFrame,size.width,size.height])
 const handledIntent=useRef(-1)
 const focusRequest=useRef<{revision:number;anchorKey:string;deadline:number}|null>(null)
 const cellForFocus=(targetId:string)=>{
  const {scene,plan}=latest.current
  for(const window of plan.cellWindows.values()){
   const cell=window.mapping.get(targetId)
   if(cell)return{cell,array:scene.entities[window.arrayId]}
  }
  return null
 }
 const anchorForFocus=(targetId:string)=>{
  const {scene,plan}=latest.current,owner=plan.framing.focus?.targetId??targetId
  return cellForFocus(targetId)?.cell.anchor??scene.entities[owner]?.anchor??plan.clusters.find(cluster=>cluster.id===targetId)?.anchor
 }
 const reduced=()=>useCameraStore.getState().reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches
 const beginWaypoints=(poses:readonly OrbitPose[],duration:number,home=false,flowId?:string)=>{
  if(!poses.length)return
  const travel=guidedTravel(eye(),poses,latest.current.boxes,layout.bounds?.center,latest.current.limits)
  move.current={...travel,start:productionClock.now(),duration:reduced()?0:duration,home,homeKey:home?framingCutKey:undefined,flowId,flowPrefix:flowId?{recordingId:scene.recordingId,cursor:scene.cursor}:undefined}
  invalidate()
 }
 const begin=(pose:OrbitPose,duration:number,home=false)=>beginWaypoints([pose],duration,home)
 const homeCache=useRef<{scene:SceneModel;key:string;pose:OrbitPose}|null>(null)
 const home=()=>{const current=latest.current,key=framingCutKey;if(homeCache.current?.scene===current.scene&&homeCache.current.key===key)return homeCache.current.pose;const pose=homeFraming(current.scene,current.plan,current.safeFrame,size,layout).pose;homeCache.current={scene:current.scene,key,pose};return pose}
 const commandArea=()=>size.width<1024&&inspectorRect?{...safeFrame,height:Math.max(0,Math.min(safeFrame.y+safeFrame.height,inspectorRect.y-size.height*.01)-safeFrame.y)}:safeFrame
 const focusIntent=useCameraStore.getState().intent
 const focusAnchor=focusIntent?.kind==='focus'?anchorForFocus(focusIntent.targetId):null
 const focusAnchorKey=focusAnchor?JSON.stringify([focusAnchor.entityId,focusAnchor.region,focusAnchor.position,focusAnchor.size]):null
 useEffect(()=>{
  if(!(camera instanceof PerspectiveCamera))return
  camera.fov=tokens.fov;camera.near=.05;camera.far=10000;camera.updateProjectionMatrix()
  if(!initialized.current||recordingId.current!==scene.recordingId){initialized.current=true;recordingId.current=scene.recordingId;lastFollow.current=-1;followRecursion.current=null;begin(heroFraming(scene,plan,safeFrame,size),scene.cursor?600:0);useCameraStore.setState({follow:scene.cursor>0})}
 },[scene.recordingId,camera])
 useEffect(()=>{
  const state=useCameraStore.getState(),intent=state.intent
  if(intent?.kind==='focus')return
  if(handledIntent.current===intentRevision&&intent?.kind!=='hero')return
  handledIntent.current=intentRevision
  focusRequest.current=null
  if(!intent){move.current=null;return}
  invalidate()
  if(intent.kind==='pose'){move.current=null;camera.position.set(...cameraPosition(intent.pose));controls.current?.target.set(...intent.pose.target);previous.current=eye();return}
  if(intent.kind==='home')begin(home(),motion.homeMs,true)
  if(intent.kind==='recording'||intent.kind==='hero')begin(heroFraming(scene,plan,safeFrame,size),scene.cursor?600:0)
  if(intent.kind==='exitFocus')begin(intent.pose,motion.exitFocusMs)
  if(intent.kind==='zoom'){move.current=null;const pivot=controls.current?.target??new Vector3();camera.position.sub(pivot).multiplyScalar(intent.factor).add(pivot)}
  if(intent.kind==='followPath'){
   const curve=plan.curves.find(curve=>curve.id===intent.flowId)
   beginWaypoints(followPathFraming(curve,commandArea(),size),1000,false,intent.flowId)
  }
  if(intent.kind==='cluster'){
   move.current=null
   if(intent.recordingId!==scene.recordingId||intent.cursor!==scene.cursor)return
   const cluster=plan.clusters.find(cluster=>cluster.id===intent.clusterId)
   const destination=clusterFraming(scene,cluster,commandArea(),size,state.pose,pose=>{
    const requested={position:cameraPosition(pose),target:pose.target}
    return orbitPoseFromEye(constrainCameraPose(requested,requested,latest.current.boxes,layout.bounds?.center,latest.current.limits))
   })
   if(!destination)return
   const route=guidedTravel(eye(),[destination.pose],latest.current.boxes,layout.bounds?.center,latest.current.limits),end=route.path.at(-1)!,destinationEye=cameraPosition(destination.pose)
   // Reject a collision stop that cannot reach the validated physical pose.
   if(Math.hypot(...end.position.map((v,i)=>v-destinationEye[i]))>1e-6||Math.hypot(...end.target.map((v,i)=>v-destination.pose.target[i]))>1e-6)return
   // Resolve one actual prefix-owned member. This changes only the accounted
   // presentation cut; Focus, selection and the runtime catalog stay intact.
   useCameraStore.setState({intent:{...intent,memberId:destination.memberId}})
   move.current={...route,start:productionClock.now(),duration:reduced()?0:900,home:false}
   invalidate()
  }
 },[intentRevision,framingCutKey])
 // Fit against the committed presentation before it can draw. A reduced
 // motion move may finish in one frame and trigger another cell mapping.
 useLayoutEffect(()=>{
  const {intent,intentRevision:revision}=useCameraStore.getState()
  if(intent?.kind!=='focus'||revision!==intentRevision||!focusAnchor||!focusAnchorKey)return
  const prior=focusRequest.current
  if(prior?.revision===revision&&prior.anchorKey===focusAnchorKey)return
  const anchor=focusAnchor
  // Opening a narrow sheet never moves the camera by itself. An explicit
  // Focus request uses the free rectangle above that actual visible sheet.
  const area=commandArea()
  const neighbours=(plan.framing.focus?.neighbours??[]).flatMap(id=>scene.entities[id]?[scene.entities[id].anchor]:[])
  // Semantic zoom can repack a virtualized cell during this command. Follow
  // its current anchor without extending the original arrival deadline.
  // User input clears the intent, so later exploration never triggers refits.
  const deadline=prior?.revision===intentRevision?prior.deadline:productionClock.now()+(reduced()?0:motion.focusMs)
  focusRequest.current={revision:intentRevision,anchorKey:focusAnchorKey,deadline}
  const focusedCell=cellForFocus(intent.targetId)
  const free=focusContentFrame??area
  const captionArea={...free,x:area.x,width:area.width,height:Math.max(0,Math.min(free.y+free.height,size.width<1024&&inspectorRect?inspectorRect.y:Infinity)-free.y)}
  const activity=focusedCell?.array?.kind==='array'&&focusedCell.array.activity?.index===focusedCell.cell.index?focusedCell.array.activity.kind:null
  const content=focusedCell?{points:arrayCellCaptionPoints(focusedCell.cell.anchor,arrayCellIndexLabel(focusedCell.cell.index,activity)),area:captionArea}:undefined
  cameraReadiness.moving=true
  begin(focusFraming(anchor,focusAngles(anchor,neighbours,useInteractionStore.getState().focus?.kind==='cluster'),area,size,content),Math.max(0,deadline-productionClock.now()))
 },[intentRevision,focusAnchorKey])
 useEffect(()=>{
  const cancel=()=>{move.current=null;lastFollow.current=-1;useCameraStore.getState().setPose(orbitPoseFromEye(eye()));useCameraStore.getState().userInput();invalidate()}
  const orbit=()=>{
   const focus=useInteractionStore.getState().focus,anchor=focus?anchorForFocus(focus.targetId):null
   if(!anchor||!controls.current)return
   controls.current.target.set(...anchor.position)
   // Rebase only the pivot. Preserve the last safe eye for swept collision
   // checks; an orbit is not a pan blocked between two unrelated targets.
   previous.current={...previous.current,target:anchor.position}
  }
  input.current={cancel,orbit,shift(value){if(controls.current)controls.current.mouseButtons.LEFT=value?MOUSE.PAN:MOUSE.ROTATE},
   key(key,shift){cancel();if(!shift&&key.startsWith('Arrow'))orbit();const pivot=controls.current?.target;if(!pivot)return;const offset=camera.position.clone().sub(pivot)
    if(['+','=','-'].includes(key))offset.multiplyScalar(key==='-'?1.1:.9)
    else if(shift){const right=new Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new Vector3().setFromMatrixColumn(camera.matrixWorld,1);const delta=(key==='ArrowLeft'?right.multiplyScalar(-1):key==='ArrowRight'?right:key==='ArrowUp'?up:up.multiplyScalar(-1)).multiplyScalar(offset.length()*.025);camera.position.add(delta);pivot.add(delta);return}
    else {const distance=offset.length(),yaw=Math.atan2(offset.x,offset.z)+(key==='ArrowLeft'?-5:key==='ArrowRight'?5:0)*Math.PI/180,pitch=Math.max(2*Math.PI/180,Math.min(80*Math.PI/180,Math.asin(offset.y/distance)+(key==='ArrowUp'?5:key==='ArrowDown'?-5:0)*Math.PI/180));offset.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance)}camera.position.copy(pivot).add(offset)
   },wheel(dx,dy,pixelPan){cancel();const pivot=controls.current?.target;if(!pivot)return;if(!pixelPan){camera.position.sub(pivot).multiplyScalar(Math.exp(dy*.001)).add(pivot);return}const pixel=2*camera.position.distanceTo(pivot)*Math.tan(tokens.fov*Math.PI/360)/size.height,delta=new Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(dx*pixel).add(new Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar(-dy*pixel));camera.position.add(delta);pivot.add(delta)}
  };return()=>{input.current=null}
 },[camera,size.width,size.height])
 useFrame(()=>{
  const control=controls.current;if(!control||!(camera instanceof PerspectiveCamera))return
  const selected=useInteractionStore.getState().selection
  const intent=useCameraStore.getState().intent
  if(intent?.kind==='cluster'&&(intent.recordingId!==scene.recordingId||intent.cursor!==scene.cursor)){
   move.current=null;useCameraStore.setState({intent:null});invalidate()
  }
  const flowMove=move.current
  if(flowMove?.flowId&&(selected?.kind!=='flow'||selected.id!==flowMove.flowId||flowMove.flowPrefix?.recordingId!==scene.recordingId||flowMove.flowPrefix?.cursor!==scene.cursor||!plan.curves.some(curve=>curve.id===flowMove.flowId)))move.current=null
  const now=productionClock.now()
  let travel=move.current
  if(travel?.home&&travel.homeKey!==framingCutKey){
   // LOD can replace a detailed library body with a proxy during travel. Refit
   // that committed cut while preserving the original arrival deadline.
   const route=guidedTravel(eye(),[home()],latest.current.boxes,layout.bounds?.center,latest.current.limits)
   travel=move.current={...route,start:now,duration:Math.max(0,travel.start+travel.duration-now),home:true,homeKey:framingCutKey,settledFrames:0}
  }
  cameraReadiness.moving=!!travel
  if(travel){const t=travel.duration?Math.min(1,(now-travel.start)/travel.duration):1,pose=travelPose(travel,ease(t));camera.position.set(...pose.position);control.target.set(...pose.target);if(t===1){lastDetail.current=-Infinity;if(!travel.home||(travel.settledFrames=(travel.settledFrames??0)+1)>=2){move.current=null;if(travel.home)useCameraStore.setState({mode:'EXPLORE',intent:null})}}}
  control.update()
  const safe=constrainCameraPose(eye(),previous.current,latest.current.boxes,layout.bounds?.center,latest.current.limits);camera.position.set(...safe.position);control.target.set(...safe.target);camera.lookAt(control.target);camera.updateMatrixWorld();previous.current=safe
  useCameraStore.getState().setPose(orbitPoseFromEye(safe))
  const state=useCameraStore.getState(),focus=useInteractionStore.getState().focus
  if(state.follow&&!move.current&&!focus&&(lastFollow.current!==scene.cursor||followForensic.current!==!!plan.exceptionPanel)){
   lastFollow.current=scene.cursor;followForensic.current=!!plan.exceptionPanel
   const next=guidedFollow(scene,plan,event,state.pose,safeFrame,size,followRecursion.current)
   followRecursion.current=next.recursion;if(next.pose)begin(next.pose,600)
  }
  if(now-lastDetail.current>=200||lastCursor.current!==scene.cursor){lastDetail.current=now;lastCursor.current=scene.cursor;const next=nextDetailLevel(state.detailLevel,representativeFaceHeight(scene,camera,size),size.height);if(state.detailLevel!==next)state.setDetailLevel(next)}
  if(move.current)requestAnimationFrameRender(invalidate)
  cameraReadiness.moving=!!move.current
 })
 return <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={tokens.minDistance} maxDistance={Math.max(tokens.minDistance,3*diagonal)} minPolarAngle={10*Math.PI/180} maxPolarAngle={88*Math.PI/180} mouseButtons={{LEFT:MOUSE.ROTATE,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.PAN}} onStart={()=>input.current?.cancel()} onChange={noteRequestedAnimationFrame}/>
}
