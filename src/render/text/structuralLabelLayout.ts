import {PerspectiveCamera,Vector3} from 'three'
import type {Vec3} from '../../contracts/worldV2'
import type {Rect} from '../../shell/shellLayout'
import type {Size} from '../../camera/projection'
import {projectedPlaneFontPixels} from './textSystem'
export interface StructuralLabelSpec {
 id:string;kind:'cluster'|'heading'|'bundle';position:Vec3;size:number;
 localBounds:readonly[number,number,number,number];priority:number;count:number
}
export interface ProjectedStructuralLabel {id:string;position:Vec3;scale:number;bounds:Rect|null;minimumFontPixels:number;visible:boolean}
const inside=(rect:Rect,area:Rect)=>rect.x>=area.x&&rect.y>=area.y&&rect.x+rect.width<=area.x+area.width&&rect.y+rect.height<=area.y+area.height
export const structuralRectsOverlap=(a:Rect,b:Rect,gap=4)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y

/** Real XY text planes; scale glyphs, never the structural/body anchor. */
export function projectStructuralLabel(spec:StructuralLabelSpec,camera:PerspectiveCamera,viewport:Size,lift=0):ProjectedStructuralLabel {
 const centre=new Vector3(...spec.position),nominal=projectedPlaneFontPixels(spec.size,centre,camera,viewport)
 if(!(nominal>0))return{id:spec.id,position:spec.position,scale:1,bounds:null,minimumFontPixels:0,visible:false}
 let scale=Math.max(1,12.25/nominal),points:Vector3[]=[],minimumFontPixels=0
 let position:Vec3=spec.position
 const [left,right,bottom,top]=spec.localBounds
 for(let iteration=0;iteration<4;iteration++){
  position=[spec.position[0],spec.position[1]+lift*spec.size*scale,spec.position[2]]
  points=[left,right].flatMap(x=>[bottom,top].map(y=>new Vector3(position[0]+x*scale,position[1]+y*scale,position[2])))
  minimumFontPixels=Math.min(...points.map(point=>projectedPlaneFontPixels(spec.size*scale,point,camera,viewport)))
  if(minimumFontPixels>=12||!(minimumFontPixels>0))break
  scale*=12.25/minimumFontPixels
 }
 const projected=points.map(point=>point.clone().project(camera))
 if(!(minimumFontPixels>=12)||projected.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.z<=-1||point.z>=1))return{id:spec.id,position,scale,bounds:null,minimumFontPixels,visible:false}
 const xs=projected.map(point=>(point.x+1)*viewport.width/2),ys=projected.map(point=>(1-point.y)*viewport.height/2)
 return{id:spec.id,position,scale,minimumFontPixels,visible:false,bounds:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}}
}

/** A stable cut of optional structural labels, with no runtime state input/output. */
export function placeStructuralLabels(specs:readonly StructuralLabelSpec[],camera:PerspectiveCamera,viewport:Size,safe:Rect,blocked:readonly Rect[]=[]):ProjectedStructuralLabel[] {
 const projected=new Map<string,ProjectedStructuralLabel>(),occupied:Rect[]=[]
 for(const spec of [...specs].sort((a,b)=>a.priority-b.priority||b.count-a.count||a.id.localeCompare(b.id))){
  let label=projectStructuralLabel(spec,camera,viewport)
  for(const lift of spec.kind==='cluster'?[0,1,2,3,4]:[0,1,2]){
   if(lift)label=projectStructuralLabel(spec,camera,viewport,lift);const rect=label.bounds
   if(!rect||!inside(rect,safe)||blocked.some(area=>structuralRectsOverlap(rect,area))||occupied.some(area=>structuralRectsOverlap(rect,area)))continue
   label.visible=true;occupied.push(rect);break
  }
  projected.set(spec.id,label)
 }
 return specs.map(spec=>projected.get(spec.id)!)
}
