import {useEffect,useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {BufferGeometry,Float32BufferAttribute,Group,InstancedMesh,Mesh,LineBasicMaterial,MeshBasicMaterial,Object3D,Vector3} from 'three'
import type {PresentationPlan} from '../contracts/world'
import type {RecordingStatus} from '../instrumentation/contracts'
import {color} from '../theme/tokens'
import {WorldText} from './FaceText'
import {glassMaterial,unitBox} from './RuntimeMaterials'
import {expandRoundedBoxVertex,unitRoundedBox,unitRoundedOutline} from './geometry/roundedBox'
import {useQualityStore} from './quality/qualityStore'
import {buildExceptionPanelModel,layoutExceptionPanel} from './exceptionPanelModel'
import {exceptionPanelAnchor} from '../world/exceptionPanelPlacement'
import {projectExceptionPanel} from './exceptionPanelPresentation'
import type {Rect} from '../shell/shellLayout'
const noRaycast=()=>undefined
export function ExceptionPanel({panel,recordingState,safeFrame}:{panel:PresentationPlan['exceptionPanel'];recordingState:RecordingStatus['state'];safeFrame:Rect}){
 return panel?<ExceptionPanelContent panel={panel} recordingState={recordingState} safeFrame={safeFrame}/>:null
}
/** Structural evidence shares the actual rounded body/material and glyph batch;
 * it has no runtime identity, pick target or semantic-layout side effects. */
function ExceptionPanelContent({panel,recordingState,safeFrame}:{panel:NonNullable<PresentationPlan['exceptionPanel']>;recordingState:RecordingStatus['state'];safeFrame:Rect}){
 const {camera,size:viewport}=useThree(),host=useRef<Group>(null),ink=useRef<Group>(null),face=useRef<Mesh>(null),lastPresentation=useRef('')
 const tier=useQualityStore(state=>state.active),body=useRef<InstancedMesh>(null)
 const model=useMemo(()=>buildExceptionPanelModel(panel.content,recordingState),[panel.content,recordingState])
 const layout=useMemo(()=>layoutExceptionPanel(model),[model])
 useLayoutEffect(()=>{const mesh=body.current;return()=>mesh?.dispose()},[])
 const base=useMemo(()=>exceptionPanelAnchor(panel,{state:recordingState}),[panel,recordingState])
 useLayoutEffect(()=>{lastPresentation.current='';if(!body.current)return;const transform=new Object3D();transform.scale.set(...layout.size);transform.updateMatrix();body.current.setMatrixAt(0,transform.matrix);body.current.instanceMatrix.needsUpdate=true;body.current.computeBoundingSphere()},[layout])
 const outline=useMemo(()=>{
  const positions:number[]=[],point=new Vector3(),normal=new Vector3(),expanded=new Vector3(),source=unitRoundedOutline.getAttribute('position'),normals=unitRoundedOutline.getAttribute('normal')
  for(let i=0;i<source.count;i++){point.fromBufferAttribute(source,i);normal.fromBufferAttribute(normals,i);expandRoundedBoxVertex(point,normal,layout.size,expanded).addScaledVector(normal,.008);positions.push(...expanded.toArray())}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));return geometry
 },[layout])
 useFrame(()=>{
  if(!host.current||!ink.current||!face.current||!body.current)return
  const presented=projectExceptionPanel(base,layout,camera,viewport,safeFrame),size=presented.anchor.size
  const key=JSON.stringify([presented.scale,presented.anchor.position,size])
  host.current.position.set(...presented.anchor.position);ink.current.scale.set(presented.scale,presented.scale,1)
  face.current.scale.set(size[0]-.18,size[1]-.18,.035)
  if(key===lastPresentation.current)return
  lastPresentation.current=key
  const transform=new Object3D();transform.scale.set(...size);transform.updateMatrix()
  body.current.setMatrixAt(0,transform.matrix);body.current.instanceMatrix.needsUpdate=true;body.current.computeBoundingSphere()
  const target=outline.getAttribute('position'),source=unitRoundedOutline.getAttribute('position'),normals=unitRoundedOutline.getAttribute('normal')
  const point=new Vector3(),normal=new Vector3(),expanded=new Vector3()
  for(let i=0;i<source.count;i++){point.fromBufferAttribute(source,i);normal.fromBufferAttribute(normals,i);expandRoundedBoxVertex(point,normal,size,expanded).addScaledVector(normal,.008);target.setXYZ(i,expanded.x,expanded.y,expanded.z)}
  target.needsUpdate=true;outline.computeBoundingSphere()
 },.25)
 const faceMaterial=useMemo(()=>new MeshBasicMaterial({color:color.background.top,toneMapped:false}),[])
 const edgeMaterial=useMemo(()=>new LineBasicMaterial({color:color.semantic.exception,depthWrite:false,toneMapped:false}),[])
 useEffect(()=>()=>outline.dispose(),[outline])
 useEffect(()=>()=>{faceMaterial.dispose();edgeMaterial.dispose()},[faceMaterial,edgeMaterial])
 return <group ref={host} name="exception-panel">
  <instancedMesh ref={body} name="exception-panel-body" args={[undefined,undefined,1]} geometry={unitRoundedBox} material={glassMaterial('exception',1,tier)} dispose={null} raycast={noRaycast} userData={{runtimeBloomRole:'protected'}}/>
  <mesh ref={face} geometry={unitBox} material={faceMaterial} position={[0,0,layout.size[2]/2+.015]} dispose={null} raycast={noRaycast} userData={{runtimeBloomRole:'protected'}}/>
  <lineSegments geometry={outline} material={edgeMaterial} dispose={null} raycast={noRaycast} userData={{runtimeBloomRole:'emitter'}}/>
  <group ref={ink}>{layout.lines.map((line,index)=><WorldText exceptionText key={index} position={line.position} size={line.size} weight={line.weight} width={layout.textWidth} tint={line.tone==='title'?color.semantic.exception:line.tone==='caption'?color.ui.textSecondary:color.ui.text}>{line.text}</WorldText>)}</group>
 </group>
}
