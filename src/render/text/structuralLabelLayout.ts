import {PerspectiveCamera,Vector3} from 'three'
import type {Vec3,WorldAnchor} from '../../contracts/world'
import type {Rect} from '../../shell/shellLayout'
import type {Size} from '../../camera/projection'
import {projectedPlaneFontPixels,textAdvance,type FontWeight} from './textSystem'
import {typography} from '../../theme/tokens'
export const regionHeadingStyle={size:.6,...typography.world.heading,weight:typography.world.heading.weight as FontWeight} as const
export interface StructuralLabelSpec {
 id:string;kind:'cluster'|'heading'|'bundle'|'return'|'subject';position:Vec3;size:number;
 localBounds:readonly[number,number,number,number];priority:number;count:number;minimumPx?:number;maximumScale?:number
}
export interface ProjectedStructuralLabel {id:string;position:Vec3;scale:number;bounds:Rect|null;minimumFontPixels:number;visible:boolean;farDepth?:number}
export interface StructuralObstacle extends Rect {nearDepth?:number}
/** Keep body depth: a proxy behind a real text plane is background, while
 * actual foreground occlusion and screen-space UI still require clearance. */
export function projectStructuralObstacle(anchor:WorldAnchor,camera:PerspectiveCamera,viewport:Size):StructuralObstacle|null{
 const [x,y,z]=anchor.position,[w,h,d]=anchor.size
 const corner=new Vector3(),projected=new Vector3()
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,nearDepth=Infinity,visible=false
 for(const dx of [-1,1])for(const dy of [-1,1])for(const dz of [-1,1]){
  corner.set(x+dx*w/2,y+dy*h/2,z+dz*d/2)
  projected.copy(corner).project(camera)
  const screenX=(projected.x+1)*viewport.width/2,screenY=(1-projected.y)*viewport.height/2
  left=Math.min(left,screenX);right=Math.max(right,screenX);top=Math.min(top,screenY);bottom=Math.max(bottom,screenY)
  nearDepth=Math.min(nearDepth,-corner.applyMatrix4(camera.matrixWorldInverse).z)
  visible||=projected.z>-1&&projected.z<1
 }
 return visible?{x:left,y:top,width:right-left,height:bottom-top,nearDepth}:null
}
/** Required lane titles precede optional bundle/cluster captions. Camera
 * admission uses this same glyph footprint rather than a guessed rectangle. */
export function regionHeadingSpec(id:string,position:Vec3):StructuralLabelSpec{
 const width=textAdvance(id,regionHeadingStyle.weight,regionHeadingStyle.tracking)*regionHeadingStyle.size+.05
 return{id,kind:'heading',position,size:regionHeadingStyle.size,localBounds:[0,width,-.3,.3],priority:id==='STACK'||id==='HEAP'?-2:-1,count:0}
}
/** Actual world corners of each clearance-adjusted text plane. Camera fitting
 * uses the same glyph metrics and bounded lift as rendering, before clipping. */
export function structuralLabelFitPoints(specs:readonly StructuralLabelSpec[],bodies:readonly WorldAnchor[],camera:PerspectiveCamera,viewport:Size):Vec3[]{
 const blocked=bodies.flatMap(body=>{const rect=projectStructuralObstacle(body,camera,viewport);return rect?[rect]:[]})
 const labels=placeStructuralLabels(specs,camera,viewport,{x:-1e9,y:-1e9,width:2e9,height:2e9},blocked)
 return labels.flatMap((label,index)=>{
  const [left,right,bottom,top]=specs[index].localBounds
  return[left,right].flatMap(x=>[bottom,top].map(y=>[label.position[0]+x*label.scale,label.position[1]+y*label.scale,label.position[2]] as Vec3))
 })
}
const inside=(rect:Rect,area:Rect)=>rect.x>=area.x&&rect.y>=area.y&&rect.x+rect.width<=area.x+area.width&&rect.y+rect.height<=area.y+area.height
export const structuralRectsOverlap=(a:Rect,b:Rect,gap=4)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y

/** Real XY text planes; scale glyphs, never the structural/body anchor. */
export function projectStructuralLabel(spec:StructuralLabelSpec,camera:PerspectiveCamera,viewport:Size,lift=0):ProjectedStructuralLabel {
 const centre=new Vector3(...spec.position),nominal=projectedPlaneFontPixels(spec.size,centre,camera,viewport)
 if(!(nominal>0))return{id:spec.id,position:spec.position,scale:1,bounds:null,minimumFontPixels:0,visible:false}
 // Region titles remain subordinate to the execution faces. The return
 // title takes less space so the recorded value has room beside the stack.
 const capRatio=regionHeadingStyle.capHeight/regionHeadingStyle.size
 const preferred=spec.kind==='heading'?viewport.height*(spec.id==='RETURNS'?regionHeadingStyle.returnCapRatio:regionHeadingStyle.viewportCapRatio)/(capRatio*nominal):1
 const minimum=spec.minimumPx??12,maximumScale=spec.maximumScale??Infinity
 let scale=Math.min(maximumScale,Math.max(preferred,(minimum+.25)/nominal)),points:Vector3[]=[],minimumFontPixels=0
 let position:Vec3=spec.position
 const [left,right,bottom,top]=spec.localBounds
 for(let iteration=0;iteration<4;iteration++){
  // Downsizing an oversized title must not also shrink its physical clearance
  // search. Its region plane and nominal bounded offsets remain unchanged.
  position=[spec.position[0],spec.position[1]+lift*spec.size*Math.max(1,scale),spec.position[2]]
  points=[left,right].flatMap(x=>[bottom,top].map(y=>new Vector3(position[0]+x*scale,position[1]+y*scale,position[2])))
  minimumFontPixels=Math.min(...points.map(point=>projectedPlaneFontPixels(spec.size*scale,point,camera,viewport)))
  if(minimumFontPixels>=minimum||!(minimumFontPixels>0)||scale>=maximumScale)break
  scale=Math.min(maximumScale,scale*(minimum+.25)/minimumFontPixels)
 }
 const projected=points.map(point=>point.clone().project(camera))
 if(!(minimumFontPixels>=minimum)||projected.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.z<=-1||point.z>=1))return{id:spec.id,position,scale,bounds:null,minimumFontPixels,visible:false}
 const xs=projected.map(point=>(point.x+1)*viewport.width/2),ys=projected.map(point=>(1-point.y)*viewport.height/2)
 return{id:spec.id,position,scale,minimumFontPixels,visible:false,farDepth:Math.max(...points.map(point=>-point.clone().applyMatrix4(camera.matrixWorldInverse).z)),bounds:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}}
}

/** A stable cut of optional structural labels, with no runtime state input/output. */
export function placeStructuralLabels(specs:readonly StructuralLabelSpec[],camera:PerspectiveCamera,viewport:Size,safe:Rect,blocked:readonly StructuralObstacle[]=[]):ProjectedStructuralLabel[] {
 const projected=new Map<string,ProjectedStructuralLabel>(),occupied:Rect[]=[]
 for(const spec of [...specs].sort((a,b)=>a.priority-b.priority||b.count-a.count||a.id.localeCompare(b.id))){
  let label=projectStructuralLabel(spec,camera,viewport)
  // Tracked region titles can need to clear both a body and another heading.
  // Keep the same bounded world plane rather than hiding a required lane title
  // after only the first two, still-obstructed candidates.
  for(const lift of spec.kind==='heading'?[0,.5,1,1.5,2,4]:spec.kind==='cluster'||spec.kind==='subject'?[0,1,2,3,4]:spec.kind==='return'?[0,-1,-2,-3,-4,-5,-6,1,2,3,4,5,6]:[0,1,2]){
   if(lift)label=projectStructuralLabel(spec,camera,viewport,lift);const rect=label.bounds
   if(!rect||!inside(rect,safe)||blocked.some(area=>(spec.kind==='heading'||area.nearDepth===undefined||label.farDepth===undefined||area.nearDepth<=label.farDepth)&&structuralRectsOverlap(rect,area))||occupied.some(area=>structuralRectsOverlap(rect,area)))continue
   label.visible=true;occupied.push(rect);break
  }
  projected.set(spec.id,label)
 }
 return specs.map(spec=>projected.get(spec.id)!)
}
