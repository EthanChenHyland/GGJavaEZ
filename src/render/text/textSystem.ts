import { PerspectiveCamera, Vector3, type Camera } from 'three'
import data from './interMetrics.json'
export type FontWeight=400|500|600
interface Metrics{advances:Record<string,number>;kerning:Record<string,number>;missingAdvance:number}
const metrics=data as Record<FontWeight,Metrics>
/** Missing glyphs are shown as Java Unicode escapes using this same local font;
 * their exact captured spelling remains available in the Inspector. */
export function localFontText(text:string,weight:FontWeight=400):string{
 return Array.from(text,char=>{
  if(metrics[weight].advances[char.codePointAt(0)!]!==undefined)return char
  return Array.from({length:char.length},(_,i)=>`\\u${char.charCodeAt(i).toString(16).padStart(4,'0')}`).join('')
 }).join('')
}
export function textAdvance(text:string,weight:FontWeight=400,tracking=0):number{
 const font=metrics[weight],chars=Array.from(text);let advance=0,previous:number|undefined
 for(const char of chars){const code=char.codePointAt(0)!;advance+=font.advances[code]??font.missingAdvance
  if(previous!==undefined)advance+=(font.kerning[`${previous},${code}`]??0)+tracking
  previous=code
 }
 return Math.max(0,advance)
}
/** Keep whole code points/escape groups and fit synchronously before glyph work. */
export function fitWorldText(text:string,width:number,size:number,weight:FontWeight=400,tracking=0,limit=Infinity,truncation:'middle'|'end'='middle'):string{
 if(!(width>0&&size>0))return ''
 const units=Array.from(text,char=>localFontText(char,weight)),capacity=Math.max(0,Math.floor(limit))
 const fits=(candidate:string)=>textAdvance(candidate,weight,tracking)*size<=Math.max(0,width-.012)
 const complete=units.join('');if(units.length<=capacity&&fits(complete))return complete
 const ellipsis='…';if(!fits(ellipsis))return ''
 const candidate=(count:number)=>{if(truncation==='end')return units.slice(0,count).join('')+ellipsis;const lead=Math.ceil(count/2),tail=count-lead;return units.slice(0,lead).join('')+ellipsis+(tail?units.slice(-tail).join(''):'')}
 let low=0,high=Math.min(units.length-1,Math.max(0,capacity-1))
 while(low<high){const count=Math.ceil((low+high)/2);if(fits(candidate(count)))low=count;else high=count-1}
 return candidate(low)
}
/** Nominal world font size projected at its actual face plane, in CSS pixels. */
export function projectedFontPixels(size:number,point:Vector3,camera:Camera,viewportHeight:number,scratch=new Vector3()):number{
 if(!(camera instanceof PerspectiveCamera)||viewportHeight<=0)return 0
 const depth=-scratch.copy(point).applyMatrix4(camera.matrixWorldInverse).z
 if(depth<camera.near||depth>camera.far)return 0
 return size*viewportHeight/(2*Math.tan(camera.fov*Math.PI/360)*depth)
}
export const worldTextVisible=(pixels:number,minimum:11|12=11)=>Number.isFinite(pixels)&&pixels>=minimum

/** Text stays on a real XY plane: oblique views foreshorten either font span,
 * independently of distance. Vertical is the default for structural labels. */
export function projectedPlaneFontPixels(size:number,point:Vector3,camera:PerspectiveCamera,viewport:{width:number;height:number},axis:'x'|'y'='y'):number{
 const span=new Vector3();span[axis]=size/2
 const low=point.clone().sub(span).project(camera),high=point.clone().add(span).project(camera)
 if(low.z<=-1||low.z>=1||high.z<=-1||high.z>=1)return 0
 return Math.hypot((high.x-low.x)*viewport.width/2,(high.y-low.y)*viewport.height/2)
}
