import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react'
import {Color,InstancedMesh,Matrix4} from 'three'
import type {ThreeEvent} from '@react-three/fiber'
import type {SceneIo} from '../contracts/world'
import {color} from '../theme/tokens'
import {textReadiness,WorldText} from './FaceText'
import {faceMaterial,glassMaterial,unitBox} from './RuntimeMaterials'
import {unitRoundedBox} from './geometry/roundedBox'
import {useQualityStore} from './quality/qualityStore'
import {ioFaceTextInset,ioFaceTextSize,recordedIoPortText} from './RecordedIoPortText'

/** A single recorded channel, never a floating card per output line. */
export function RecordedIoPort({io,onInspect}:{io:SceneIo;onInspect():void}){
 const publicationKey=`${useId()}:io-publication`
 const [published,setPublished]=useState({lines:io.lines,preview:io.preview})
 const lastPublished=useRef(0),body=useRef<InstancedMesh>(null),face=useRef<InstancedMesh>(null)
 const tier=useQualityStore(state=>state.active)
 useLayoutEffect(()=>{lastPublished.current=performance.now()},[published])
 useLayoutEffect(()=>{
  if(io.id!=='stdout'||io.lines===published.lines&&io.preview===published.preview)return
  textReadiness.pending.add(publicationKey)
  let timer:number|undefined
  const publish=()=>{
   const remaining=100-(performance.now()-lastPublished.current)
   if(remaining>0)timer=window.setTimeout(publish,remaining)
   else setPublished({lines:io.lines,preview:io.preview})
  }
  publish();return()=>{window.clearTimeout(timer);textReadiness.pending.delete(publicationKey)}
 },[io.id,io.lines,io.preview,published,publicationKey])
 const [width,height,depth]=io.anchor.size
 useLayoutEffect(()=>{
  if(!body.current||!face.current)return
  body.current.setMatrixAt(0,new Matrix4().makeScale(width,height,depth))
  face.current.setMatrixAt(0,new Matrix4().makeTranslation(0,0,depth/2+.006).multiply(new Matrix4().makeScale(width-.08,height-.04,.02)))
  face.current.setColorAt(0,new Color(color.stack.chip))
  for(const mesh of[body.current,face.current]){
   mesh.instanceMatrix.needsUpdate=true
   if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
   mesh.computeBoundingSphere()
  }
 },[width,height,depth])
 useEffect(()=>{const meshes=[body.current,face.current];return()=>meshes.forEach(mesh=>mesh?.dispose())},[])
 const source=io.id==='stdout'?{...io,...published}:io
 const lines=recordedIoPortText(source,width)
 const tint=color.semantic[io.id],textWidth=width-2*ioFaceTextInset,front=depth/2+.04
 const inspect=(event:ThreeEvent<MouseEvent>)=>{event.stopPropagation();onInspect()}
 return <group name={`io-port-${io.id}`} position={[...io.anchor.position]}>
  <instancedMesh ref={body} args={[undefined,undefined,1]} geometry={unitRoundedBox} material={glassMaterial(io.id,1,tier)} dispose={null} userData={{runtimeBloomRole:'protected',runtimeIoPort:io.id}} onClick={inspect}/>
  <instancedMesh ref={face} args={[undefined,undefined,1]} geometry={unitBox} material={faceMaterial(1,false)} dispose={null} userData={{runtimeBloomRole:'protected'}} onClick={inspect}/>
  {/* One glyph member publishes the counter and preview atomically. Separate
      members could complete asynchronous layouts on different frames. */}
  <WorldText position={[-width/2+ioFaceTextInset,0,front]} width={textWidth} size={ioFaceTextSize} weight={500} tint={tint} truncation="end"
   lines={lines} ioText={{channel:io.id}}>{lines[0]}</WorldText>
 </group>
}
