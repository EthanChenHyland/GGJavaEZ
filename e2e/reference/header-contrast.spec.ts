import {expect,test,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,stopOwnedSession} from './harness'

test.afterEach(async({request})=>stopOwnedSession(request))
const viewports=[{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650}]

async function contrast(page:Page){
 const header=page.locator('.shell-header'),clip=(await header.boundingBox())!
 const runs=await header.evaluate(root=>Array.from(root.querySelectorAll<HTMLElement>('.shell-brand strong,.shell-brand small,.shell-state-label,.shell-source-changed,.shell-state-icon svg,button span,button svg')).flatMap(element=>{
  const button=element.closest('button');if(button?.getAttribute('aria-disabled')==='true'||button?.disabled)return[]
  const style=getComputedStyle(element),box=element.getBoundingClientRect()
  if(style.display==='none'||style.visibility==='hidden'||!box.width||!box.height)return[]
  const range=document.createRange();range.selectNodeContents(element)
  const text=element.tagName.toLowerCase()==='svg'?box:range.getBoundingClientRect()
  const x=Math.max(box.left,text.left),y=Math.max(box.top,text.top),right=Math.min(box.right,text.right),bottom=Math.min(box.bottom,text.bottom)
  if(right<=x||bottom<=y)return[]
  return[{label:element.textContent||button?.getAttribute('aria-label')||'icon',color:style.color,rect:{x,y,width:right-x,height:bottom-y}}]
 }))
 // Hide glyphs only while sampling their actual composited background. The
 // runtime, Header glass, borders and active-state backgrounds stay intact.
 const hiding=await page.addStyleTag({content:'.shell-header :is(strong,small,.shell-state,button span,button svg){visibility:hidden!important}'})
 let png:Buffer
 try{png=await page.screenshot({clip})}finally{await hiding.evaluate(element=>element.parentNode?.removeChild(element))}
 return page.evaluate(async({data,runs,clip})=>{
  const bitmap=await createImageBitmap(await(await fetch(data)).blob()),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!
  ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;bitmap.close()
  const luminance=(rgb:number[])=>rgb.map(value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0)
  return runs.map(run=>{
   const fg=luminance(run.color.match(/[\d.]+/g)!.slice(0,3).map(Number));let minimum=Infinity,maximumBackground=0
   for(let y=Math.max(0,Math.ceil(run.rect.y-clip.y));y<Math.min(canvas.height,Math.floor(run.rect.y+run.rect.height-clip.y));y++)for(let x=Math.max(0,Math.ceil(run.rect.x-clip.x));x<Math.min(canvas.width,Math.floor(run.rect.x+run.rect.width-clip.x));x++){
    const offset=(y*canvas.width+x)*4,bg=luminance(Array.from(pixels.slice(offset,offset+3)));maximumBackground=Math.max(maximumBackground,bg);minimum=Math.min(minimum,(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05))
   }
   return{...run,minimum,maximumBackground}
  })
 },{data:`data:image/png;base64,${png.toString('base64')}`,runs,clip})
}

for(const viewport of viewports)test(`actual JVM Header contrast during native orbit ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport)
 const errors=browserErrors(page),session=await runFixture(page,request,'dense');await home(page)
 const facts=()=>page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{recording:scene.recordingId,cursor:scene.cursor,anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor])),focus:window.__ggjavaezQA!.focusTarget()}})
 const before=await facts(),measurements=[]
 for(const state of ['home','orbit']as const){
  if(state==='orbit'){
   await page.locator('.world-canvas').focus()
   for(let i=0;i<11;i++){await page.keyboard.press('ArrowLeft');await ready(page)}
   for(let i=0;i<4;i++){await page.keyboard.press('ArrowUp');await ready(page)}
  }
  const pose=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose()),runs=await contrast(page)
  const label=await page.locator('.shell-state-label').evaluate(node=>({text:node.textContent,width:node.clientWidth,scrollWidth:node.scrollWidth,height:node.clientHeight,scrollHeight:node.scrollHeight})),expectedLabel=await page.evaluate(()=>window.__ggjavaezQA!.appState().label)
  expect(label.text).toBe(expectedLabel);expect(expectedLabel).toMatch(/^Completed · \d+\.\d{2} s · Exit code 0$/)
  expect(label.scrollWidth,`${state}: full completion label fits horizontally`).toBeLessThanOrEqual(label.width)
  expect(label.scrollHeight,`${state}: full completion label fits vertically`).toBeLessThanOrEqual(label.height)
  const badge=(await page.locator('.shell-state').boundingBox())!,header=(await page.locator('.shell-header').boundingBox())!
  expect(badge.y).toBeGreaterThanOrEqual(header.y);expect(badge.y+badge.height).toBeLessThanOrEqual(header.y+header.height)
  expect(runs.length).toBeGreaterThan(3)
  for(const run of runs)expect(run.minimum,`${state}: ${run.label} over its actual background`).toBeGreaterThanOrEqual(4.5)
  expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
  measurements.push({state,pose,runs,label,badge})
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/header-contrast-${viewport.width}x${viewport.height}-${state}.png`})
 }
 await writeFile(`.ggjavaez/qa/reference-exact/header-contrast-${viewport.width}x${viewport.height}.json`,JSON.stringify({realJvmExecuted:true,sessionId:session.id,viewport,measurements},null,2)+'\n')
 expect(errors).toEqual([])
})
