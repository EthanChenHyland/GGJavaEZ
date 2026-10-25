import {BufferGeometry,Float32BufferAttribute,type Material} from 'three'
import {world} from '../../theme/tokens'

export const chipCornerRadius=world.frame.bevel*.8
type Pair=readonly[number,number]
type Size=readonly[number,number,number]
export const physicalChipRadius=(size:Size)=>Math.min(chipCornerRadius,Math.min(size[0],size[1])*.25)
/** XY rounding is independent of the thin structural chip's Z thickness. */
export function chipVertex(core:Pair,corner:Pair,z:number,size:Size):[number,number,number]{
 const radius=physicalChipRadius(size)
 return[core[0]*(size[0]/2-radius)+corner[0]*radius,core[1]*(size[1]/2-radius)+corner[1]*radius,z*size[2]]
}
function template(){
 const positions:number[]=[],normals:number[]=[],cores:number[]=[],corners:number[]=[]
 const boundary:{core:Pair;corner:Pair}[]=[]
 for(let quadrant=0;quadrant<4;quadrant++)for(let segment=0;segment<=4;segment++){
  const angle=(quadrant+segment/4)*Math.PI/2
  boundary.push({core:[quadrant===0||quadrant===3?1:-1,quadrant<2?1:-1],corner:[Math.cos(angle),Math.sin(angle)]})
 }
 const vertex=(point:typeof boundary[number],z:number,normal:Size)=>{
  positions.push(...chipVertex(point.core,point.corner,z,[1,1,1]));normals.push(...normal);cores.push(...point.core);corners.push(...point.corner)
 }
 const centre={core:[0,0] as Pair,corner:[0,0] as Pair}
 for(let i=0;i<boundary.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length]
  vertex(centre,.5,[0,0,1]);vertex(a,.5,[0,0,1]);vertex(b,.5,[0,0,1])
  vertex(centre,-.5,[0,0,-1]);vertex(b,-.5,[0,0,-1]);vertex(a,-.5,[0,0,-1])
  const pa=chipVertex(a.core,a.corner,0,[1,1,1]),pb=chipVertex(b.core,b.corner,0,[1,1,1]),dx=pb[0]-pa[0],dy=pb[1]-pa[1],length=Math.hypot(dx,dy),normal:[number,number,number]=[dy/length,-dx/length,0]
  vertex(a,.5,normal);vertex(a,-.5,normal);vertex(b,.5,normal)
  vertex(b,.5,normal);vertex(a,-.5,normal);vertex(b,-.5,normal)
 }
 const geometry=new BufferGeometry();geometry.name='runtime:shared-rounded-value-chip'
 geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3))
 geometry.setAttribute('runtimeChipCore',new Float32BufferAttribute(cores,2));geometry.setAttribute('runtimeChipCorner',new Float32BufferAttribute(corners,2))
 geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.boundingSphere!.center.setScalar(0);geometry.boundingSphere!.radius=Math.sqrt(3)/2;return geometry
}
export const unitRoundedChip=template()
export function roundedChipVertexShader(source:string):string{
 return source.replace('#include <common>',`#include <common>
attribute vec2 runtimeChipCore;
attribute vec2 runtimeChipCorner;
vec2 runtimeChipSize(){
 #ifdef USE_INSTANCING
 return max(vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz)),vec2(0.000001));
 #else
 return vec2(1.0);
 #endif
}
`).replace('#include <begin_vertex>',`#include <begin_vertex>
vec2 chipSize=runtimeChipSize();
float chipRadius=min(${chipCornerRadius.toFixed(8)},min(chipSize.x,chipSize.y)*0.25);
transformed.xy=(runtimeChipCore*(chipSize*0.5-chipRadius)+runtimeChipCorner*chipRadius)/chipSize;
`)
}
export function applyRoundedChipMaterial<T extends Material>(material:T):T{
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey()
 material.onBeforeCompile=function(shader,renderer){compile.call(this,shader,renderer);shader.vertexShader=roundedChipVertexShader(shader.vertexShader)}
 material.customProgramCacheKey=()=>key+':runtime-rounded-value-chip-v1'
 return material
}
