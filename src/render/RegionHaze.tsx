import {useEffect,useMemo} from 'react'
import {DataTexture,LinearFilter,RGBAFormat,SpriteMaterial,UnsignedByteType} from 'three'
import type {PresentationPlan} from '../contracts/world'
import {color} from '../theme/tokens'
const hazeOpacity = .44

/** Structural atmosphere uses two bounded world-space billboards. No runtime
 * identity, pick target, anchor, or source asset is created. */
export function createHazeMask(){
 const size=64,data=new Uint8Array(size*size*4)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const radius=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1)
  const edge=Math.max(0,Math.min(1,(1-radius)/.22)),fade=edge*edge*(3-2*edge)
  data.set([255,255,255,Math.round(255*Math.exp(-4.5*radius*radius)*fade)],(y*size+x)*4)
 }
 const texture=new DataTexture(data,size,size,RGBAFormat,UnsignedByteType)
 texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true
 return texture
}
export function RegionHaze({headings,hasRecording}:{headings:PresentationPlan['headings'];hasRecording:boolean}){
 const mask=useMemo(createHazeMask,[])
 const materials=useMemo(()=>[color.background.hazeStack,color.background.hazeHeap].map(tint=>new SpriteMaterial({map:mask,color:tint,opacity:hazeOpacity,depthWrite:false,depthTest:true,toneMapped:false})),[mask])
 useEffect(()=>()=>{materials.forEach(material=>material.dispose());mask.dispose()},[mask,materials])
 const opacity=hasRecording?1:.45
 return <group name="region-atmosphere">{headings.filter(heading=>heading.id==='STACK'||heading.id==='HEAP').map(heading=>{
  const material=materials[heading.id==='STACK'?0:1]
  return <sprite key={heading.id} material={material} material-opacity={hazeOpacity*opacity} dispose={null} position={[heading.position[0]+3,heading.position[1]-7,heading.position[2]-14]} scale={[32,28,1]} renderOrder={-2} userData={{runtimeAtmosphere:heading.id}} raycast={()=>undefined}/>
 })}</group>
}
