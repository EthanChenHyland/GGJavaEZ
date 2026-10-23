import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,stopOwnedSession} from './harness'
import states from './states.json' with {type:'json'}
test.afterEach(async({request})=>stopOwnedSession(request))
for(const viewport of states.viewports){
 const label=`${viewport.width}x${viewport.height}`
 test(`recorded exception evidence stays readable in Home [${label}]`,async({page,request})=>{
  const errors=browserErrors(page);await page.setViewportSize(viewport)
  const session=await runFixture(page,request,'exception');await home(page);await ready(page)
  const observe=()=>page.evaluate(()=>({lines:window.__ggjavaezWorld!.exceptionText(),panel:window.__ggjavaezWorld!.worldProjection().exception,safe:window.__ggjavaezQA!.shellRects().safeFrame,exception:window.__ggjavaezWorld!.scene().exception,cursor:window.__ggjavaezWorld!.scene().cursor,recording:window.__ggjavaezWorld!.scene().recordingId,pose:window.__ggjavaezQA!.cameraPose()}))
  const result=await observe();const png=await page.screenshot({path:`.ggjavaez/qa/reference-exact/forensic-readable-${label}.png`})
  const sampleInk=(png:Buffer,lines:typeof result.lines)=>page.evaluate(async({data,lines})=>{
   const bitmap=await createImageBitmap(await(await fetch(data)).blob()),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!
   ctx.drawImage(bitmap,0,0);bitmap.close()
   return lines.map(line=>{
    const b=line.bounds;if(!b)return 0
    const x=Math.max(0,Math.floor(b.x)),y=Math.max(0,Math.floor(b.y)),width=Math.min(canvas.width-x,Math.ceil(b.x+b.width)-x),height=Math.min(canvas.height-y,Math.ceil(b.y+b.height)-y)
    if(width<=0||height<=0)return 0
    const rgba=ctx.getImageData(x,y,width,height).data;let ink=0
    for(let i=0;i<rgba.length;i+=4)if(rgba[i]>120&&rgba[i+1]>65&&rgba[i+2]>65)ink++
    return ink
   })
  },{data:`data:image/png;base64,${png.toString('base64')}`,lines})
  const pixels=await sampleInk(png,result.lines)
  await writeFile(`.ggjavaez/qa/reference-exact/forensic-readable-${label}.json`,JSON.stringify({sessionId:session.id,...result,pixels,errors},null,2)+'\n')
  expect(result.lines.length).toBeGreaterThan(4)
  expect(result.lines.map(line=>line.text).join('')).toContain(result.exception!.className)
  expect(result.lines.map(line=>line.text).join('')).toContain(result.exception!.message!)
  for(const line of result.lines){expect(line.fontPixels,line.text).toBeGreaterThanOrEqual(11);expect(line.opacity,line.text).toBeGreaterThan(0)}
  for(const[index,line]of result.lines.entries())expect(pixels[index],`Visible screenshot ink: ${line.text}`).toBeGreaterThan(Math.max(1,line.text.length/2))
  const bounds=result.panel!.bounds!,safe=result.safe
  expect(bounds.x).toBeGreaterThanOrEqual(safe.x-1)
  expect(bounds.y).toBeGreaterThanOrEqual(safe.y-1)
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(safe.x+safe.width+1)
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(safe.y+safe.height+1)
  const throwing=result.panel!.throwFrame!
  expect(bounds.x+bounds.width<=throwing.x+1||throwing.x+throwing.width<=bounds.x+1||bounds.y+bounds.height<=throwing.y+1||throwing.y+throwing.height<=bounds.y+1).toBe(true)
  if(viewport.width===1440&&viewport.height===900){
   const quality=await page.evaluate(()=>window.__ggjavaezWorld!.quality())
   if(quality.availability.enabled){
    await page.locator('summary[aria-label="Timeline settings"]').click()
    await page.getByRole('button',{name:'Rendering quality: INTERACTIVE',exact:true}).click();await ready(page)
    expect(await page.evaluate(()=>window.__ggjavaezWorld!.quality())).toMatchObject({active:'CINEMATIC',compiled:true})
    const cinematic=await observe(),image=await page.screenshot({path:'.ggjavaez/qa/reference-exact/forensic-readable-cinematic.png'}),ink=await sampleInk(image,cinematic.lines)
    expect(cinematic.pose).toEqual(result.pose);expect(cinematic.cursor).toBe(result.cursor);expect(cinematic.recording).toBe(result.recording)
    expect(cinematic.lines.map(line=>line.text)).toEqual(result.lines.map(line=>line.text))
    for(const[index,line]of cinematic.lines.entries()){
     expect(line.fontPixels,line.text).toBeGreaterThanOrEqual(11);expect(line.opacity,line.text).toBeGreaterThan(0)
     expect(ink[index],`Cinematic visible ink: ${line.text}`).toBeGreaterThan(Math.max(1,line.text.length/2))
    }
    await writeFile('.ggjavaez/qa/reference-exact/forensic-readable-cinematic.json',JSON.stringify({...cinematic,pixels:ink,sessionId:session.id},null,2)+'\n')
   }
  }
  expect(errors).toEqual([])
 })
}
