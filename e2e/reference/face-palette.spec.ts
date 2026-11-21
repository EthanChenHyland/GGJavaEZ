import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,selectEntity,stopOwnedSession} from './harness'

test.afterEach(async({request})=>stopOwnedSession(request))
test('actual JVM faces and chips retain their contrast and palette through tier changes',async({page,request})=>{
 test.setTimeout(90000)
 const errors=browserErrors(page),session=await runFixture(page,request,'domain');await home(page)
 const targets=await page.evaluate(()=>{
  const scene=window.__ggjavaezWorld!.scene(),plan=window.__ggjavaezWorld!.plan()
  return (['frame','object'] as const).map(kind=>Object.values(scene.entities).find(node=>node.kind===kind&&(node.kind!=='object'||node.ownership==='PROJECT'&&node.fieldCount>0)&&plan.entities.get(node.id)?.mode==='detailed')!.id)
 })
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.quality().availability.enabled),'Native GPU supports the Cinematic palette check').toBe(true)
 const prefix=await page.evaluate(()=>({recordingId:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor}))
 const measurements=[]
 for(const tier of ['INTERACTIVE','CINEMATIC']as const){
  if(tier==='CINEMATIC'){
   await page.locator('summary[aria-label="Timeline settings"]').click()
   await page.getByRole('button',{name:'Rendering quality: INTERACTIVE',exact:true}).click();await ready(page)
   await page.locator('summary[aria-label="Timeline settings"]').click()
  }
  for(const id of targets){
   await home(page);await selectEntity(page,id)
   await page.getByRole('button',{name:'Close inspector',exact:true}).click()
   await page.locator('.world-canvas').focus();await page.keyboard.press('Enter');await ready(page)
   const sample=await page.evaluate(async id=>{
    const projectionPath='/src/camera/projection.ts',rowsPath='/src/world/faceRows.ts',platePath='/src/world/facePlate.ts'
    const {projectionCamera,screenPoint}=await import(projectionPath),{faceRows}=await import(rowsPath),{facePlate}=await import(platePath)
    const world=window.__ggjavaezWorld!,node=world.scene().entities[id],presentation=world.plan().entities.get(id)!,pose=window.__ggjavaezQA!.cameraPose()
    const rect=document.querySelector('.world-canvas canvas')!.getBoundingClientRect(),delta=pose.position.map((v,i)=>v-pose.target[i]),distance=Math.hypot(...delta)
    const camera=projectionCamera({target:pose.target,distance,yawDeg:Math.atan2(delta[0],delta[2])*180/Math.PI,pitchDeg:-Math.asin(delta[1]/distance)*180/Math.PI},rect)
    // Empty face strip and chip bottom margin, outside the text runs. Observe
    // production geometry and camera only; never change the recording or scene.
    const [x,y,z]=node.anchor.position,[w,,d]=node.anchor.size
    const model=faceRows(node,presentation),chip=facePlate(node,presentation,model.visible[0].slotId,model)!
    const points=[{role:'face',world:[x-w/2+.15,y,z+d/2+.0325]},
     {role:'chip',world:[chip.position[0],chip.position[1]-chip.size[1]/2+.06,chip.position[2]+chip.size[2]/2]}].map(sample=>{
      const p=screenPoint(sample.world,camera,rect)
      return{...sample,point:{x:rect.x+p.x,y:rect.y+p.y}}
     })
    return{id,kind:node.kind,title:node.title,opacity:presentation.opacity,quality:world.quality().active,prefix:{recordingId:world.scene().recordingId,cursor:world.scene().cursor},points,safe:window.__ggjavaezQA!.shellRects().safeFrame}
   },id)
   expect(sample.opacity).toBe(1);expect(sample.quality).toBe(tier);expect(sample.prefix).toEqual(prefix)
   for(const {point} of sample.points){
    expect(point.x).toBeGreaterThan(sample.safe.x+2);expect(point.x).toBeLessThan(sample.safe.x+sample.safe.width-2)
    expect(point.y).toBeGreaterThan(sample.safe.y+2);expect(point.y).toBeLessThan(sample.safe.y+sample.safe.height-2)
   }
   const png=await page.screenshot({path:`.ggjavaez/qa/reference-exact/face-palette-${tier}-${sample.kind}.png`})
   const colors=await page.evaluate(async({data,points})=>{
    const bitmap=await createImageBitmap(await(await fetch(data)).blob()),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!
    ctx.drawImage(bitmap,0,0);bitmap.close()
    return points.map(({point,role})=>({role,rgb:Array.from(ctx.getImageData(Math.round(point.x),Math.round(point.y),1,1).data).slice(0,3)}))
   },{data:`data:image/png;base64,${png.toString('base64')}`,points:sample.points})
   for(const color of colors)measurements.push({...sample,tier,...color})
  }
 }
 await writeFile('.ggjavaez/qa/reference-exact/face-palette-native.json',JSON.stringify({realJvmExecuted:true,sessionId:session.id,measurements},null,2)+'\n')
 for(const sample of measurements){
  const [r,g,b]=sample.rgb
  expect(b).toBeGreaterThan(Math.max(r,g)+5)
  expect(b).toBeLessThan(110)
  if(sample.kind==='frame')expect(g).toBeGreaterThan(r+5)
  else expect(r).toBeGreaterThan(g+4)
  if(sample.role==='face'){
   const chip=measurements.find(other=>other.kind===sample.kind&&other.tier===sample.tier&&other.role==='chip')!
   expect(b).toBeGreaterThan(chip.rgb[2]+5)
  }
  if(sample.tier==='CINEMATIC'){
   const interactive=measurements.find(other=>other.kind===sample.kind&&other.tier==='INTERACTIVE'&&other.role===sample.role)!
   for(let channel=0;channel<3;channel++)expect(Math.abs(sample.rgb[channel]-interactive.rgb[channel]),
    `${sample.kind} ${sample.role} shifts from ${interactive.rgb} to ${sample.rgb}`).toBeLessThanOrEqual(4)
  }
 }
 expect(errors).toEqual([])
})
