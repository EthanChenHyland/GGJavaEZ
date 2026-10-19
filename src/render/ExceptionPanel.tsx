import {useEffect,useLayoutEffect,useMemo,useRef} from 'react'
import {BufferGeometry,Float32BufferAttribute,InstancedMesh,LineBasicMaterial,MeshBasicMaterial,Object3D,Vector3} from 'three'
import type {PresentationPlan} from '../contracts/world'
import type {RecordingStatus} from '../instrumentation/contracts'
import {color} from '../theme/tokens'
import {WorldText} from './FaceText'
import {glassMaterial,unitBox} from './RuntimeMaterials'
import {expandRoundedBoxVertex,unitRoundedBox,unitRoundedOutline} from './geometry/roundedBox'
import {useQualityStore} from './quality/qualityStore'
import {buildExceptionPanelModel,layoutExceptionPanel} from './exceptionPanelModel'
const noRaycast=()=>undefined
export function ExceptionPanel({panel,recordingState}:{panel:PresentationPlan['exceptionPanel'];recordingState:RecordingStatus['state']}){
 return panel?<ExceptionPanelContent panel={panel} recordingState={recordingState}/>:null
}
/** Structural evidence shares the actual rounded body/material and glyph batch;
 * it has no runtime identity, pick target or semantic-layout side effects. */
function ExceptionPanelContent({panel,recordingState}:{panel:NonNullable<PresentationPlan['exceptionPanel']>;recordingState:RecordingStatus['state']}){
 const tier=useQualityStore(state=>state.active),body=useRef<InstancedMesh>(null)
 const model=useMemo(()=>buildExceptionPanelModel(panel.content,recordingState),[panel.content,recordingState])
 const layout=useMemo(()=>layoutExceptionPanel(model),[model])
 useLayoutEffect(()=>{const mesh=body.current;return()=>mesh?.dispose()},[])
 useLayoutEffect(()=>{if(!body.current)return;const transform=new Object3D();transform.scale.set(...layout.size);transform.updateMatrix();body.current.setMatrixAt(0,transform.matrix);body.current.instanceMatrix.needsUpdate=true;body.current.computeBoundingSphere()},[layout])
 const outline=useMemo(()=>{
  const positions:number[]=[],point=new Vector3(),normal=new Vector3(),expanded=new Vector3(),source=unitRoundedOutline.getAttribute('position'),normals=unitRoundedOutline.getAttribute('normal')
  for(let i=0;i<source.count;i++){point.fromBufferAttribute(source,i);normal.fromBufferAttribute(normals,i);expandRoundedBoxVertex(point,normal,layout.size,expanded).addScaledVector(normal,.008);positions.push(...expanded.toArray())}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));return geometry
 },[layout])
 const faceMaterial=useMemo(()=>new MeshBasicMaterial({color:color.background.top,toneMapped:false}),[])
 const edgeMaterial=useMemo(()=>new LineBasicMaterial({color:color.semantic.exception,depthWrite:false,toneMapped:false}),[])
 useEffect(()=>()=>outline.dispose(),[outline])
 useEffect(()=>()=>{faceMaterial.dispose();edgeMaterial.dispose()},[faceMaterial,edgeMaterial])
 return <group position={[...panel.position]} name="exception-panel">
  <instancedMesh ref={body} name="exception-panel-body" args={[undefined,undefined,1]} geometry={unitRoundedBox} material={glassMaterial('exception',1,tier)} dispose={null} raycast={noRaycast} userData={{runtimeBloomRole:'protected'}}/>
  <mesh geometry={unitBox} material={faceMaterial} position={[0,0,layout.size[2]/2+.015]} scale={[layout.size[0]-.18,layout.size[1]-.18,.035]} dispose={null} raycast={noRaycast} userData={{runtimeBloomRole:'protected'}}/>
  <lineSegments geometry={outline} material={edgeMaterial} dispose={null} raycast={noRaycast} userData={{runtimeBloomRole:'emitter'}}/>
  {layout.lines.map((line,index)=><WorldText key={index} position={line.position} size={line.size} weight={line.weight} width={layout.textWidth} tint={line.tone==='title'?color.semantic.exception:line.tone==='caption'?color.ui.textSecondary:color.ui.text}>{line.text}</WorldText>)}
 </group>
}
