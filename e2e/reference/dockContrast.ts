import type {Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
/** Samples actual composited pixels under each visible text run. Only glyphs
 * are hidden; surface glass, borders and active backgrounds remain intact. */
export async function surfaceTextContrast(page:Page,selector:string){
 const surface=page.locator(selector),clip=await surface.evaluate(root=>{const box=root.getBoundingClientRect();let top=box.top;if(root.matches('.shell-dock-strip'))for(const button of root.querySelectorAll('button'))top=Math.min(top,button.getBoundingClientRect().top);return{x:box.left,y:top,width:box.width,height:box.bottom-top}})
 const runs=await surface.evaluate(root=>{
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),runs=[]
  while(walker.nextNode()){
   const node=walker.currentNode,element=node.parentElement;if(!element||!node.textContent?.trim())continue
   const button=element.closest('button');if(button?.disabled||button?.getAttribute('aria-disabled')==='true')continue
   const box=element.getBoundingClientRect(),style=getComputedStyle(element);if(!box.width||!box.height||style.visibility==='hidden'||style.display==='none')continue
   const range=document.createRange();range.selectNode(node);const text=range.getBoundingClientRect()
   let x=Math.max(box.left,text.left),y=Math.max(box.top,text.top),right=Math.min(box.right,text.right),bottom=Math.min(box.bottom,text.bottom),visible=true
   // Collapsed disclosure descendants can still report layout boxes. Overscan
   // rows also have boxes outside their scrolling viewport; neither is painted.
   for(let ancestor:HTMLElement|null=element;ancestor;ancestor=ancestor.parentElement){
    if(ancestor instanceof HTMLDetailsElement&&!ancestor.open&&!ancestor.querySelector(':scope>summary')?.contains(element)){visible=false;break}
    const bounds=ancestor.getBoundingClientRect(),style=getComputedStyle(ancestor)
    if(['hidden','auto','scroll','clip'].includes(style.overflowX)){x=Math.max(x,bounds.left+ancestor.clientLeft);right=Math.min(right,bounds.left+ancestor.clientLeft+ancestor.clientWidth)}
    if(['hidden','auto','scroll','clip'].includes(style.overflowY)){y=Math.max(y,bounds.top+ancestor.clientTop);bottom=Math.min(bottom,bounds.top+ancestor.clientTop+ancestor.clientHeight)}
    if(ancestor===root)break
   }
   if(visible&&Math.floor(right)>Math.ceil(x)&&Math.floor(bottom)>Math.ceil(y))runs.push({label:node.textContent,color:style.color,rect:{x,y,width:right-x,height:bottom-y}})
  }return runs
 })
 const hiding=await page.addStyleTag({content:`${selector},${selector} *{color:transparent!important;text-shadow:none!important}${selector} svg{visibility:hidden!important}`})
 let png:Buffer
 try{png=await page.screenshot({clip});if(selector==='.shell-dock-drawer')await writeFile('.ggjavaez/qa/reference-exact/dock-console-background.png',png)}finally{await hiding.evaluate(element=>element.parentNode?.removeChild(element))}
 return page.evaluate(async({data,runs,clip})=>{
  const bitmap=await createImageBitmap(await(await fetch(data)).blob()),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!
  ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;bitmap.close()
  const luminance=(rgb:number[])=>rgb.map(value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0)
  return runs.map(run=>{
   const fg=luminance(run.color.match(/[\d.]+/g)!.slice(0,3).map(Number));let minimum=Infinity,maximumBackground=0,worstPixel:{x:number;y:number;rgb:number[]}|null=null
   for(let y=Math.max(0,Math.ceil(run.rect.y-clip.y));y<Math.min(canvas.height,Math.floor(run.rect.y+run.rect.height-clip.y));y++)for(let x=Math.max(0,Math.ceil(run.rect.x-clip.x));x<Math.min(canvas.width,Math.floor(run.rect.x+run.rect.width-clip.x));x++){
    const offset=(y*canvas.width+x)*4,bg=luminance(Array.from(pixels.slice(offset,offset+3)));maximumBackground=Math.max(maximumBackground,bg);const ratio=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);if(ratio<minimum){minimum=ratio;worstPixel={x,y,rgb:Array.from(pixels.slice(offset,offset+3))}}
   }
   return{...run,minimum,maximumBackground,worstPixel}
  })
 },{data:`data:image/png;base64,${png.toString('base64')}`,runs,clip})
}
