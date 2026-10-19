import {expect,test,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import type {TraceDocument} from '../../src/contracts/runtime'
import {browserErrors,follow,home,ready,seekCursor,selectEntity} from './harness'
const trace:TraceDocument=JSON.parse(readFileSync('src/examples/demos/person/person.trace.json','utf8'))
const person='object:person:17'
const inspector=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector'})
const age=(page:Page)=>inspector(page).getByRole('button',{name:'Inspect age',exact:true})
const rail=(page:Page)=>page.getByRole('slider',{name:'Recorded execution position'})
const pose=(page:Page)=>page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
async function cameraState(page:Page){return page.evaluate(async()=>{const path='/src/camera/cameraStore.ts',shared=await import(path),state=shared.useCameraStore.getState();return{mode:state.mode,follow:state.follow}})}
async function open(page:Page){await page.goto('/examples?qa=1');await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function');await ready(page)}
async function command(page:Page,title:string){
 await page.locator('.world-canvas').focus();await page.keyboard.press('F1');await page.getByRole('combobox',{name:'Search commands'}).fill(title)
 await page.getByRole('option').filter({has:page.getByText(title,{exact:true})}).click();await ready(page)
}
async function sourceAt(page:Page,cursor:number){
 const source=trace.events[cursor-1].source!;expect(await page.evaluate(()=>window.__ggjavaezQA!.source()?.target?.line)).toBe(source.line)
 await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(1)
 const text=trace.sourceFiles.find(file=>file.fileId===source.fileId)!.content.split('\n')[source.line-1].trim()
 await expect(page.locator('.monaco-editor .view-line').filter({hasText:text}).first()).toBeVisible()
}
async function pointOnBody(page:Page,id:string){return page.evaluate(async id=>{
 const path='/src/camera/projection.ts',{projectionCamera,screenPoint}=await import(path),pose=window.__ggjavaezQA!.cameraPose()
 const viewport={width:innerWidth,height:innerHeight},delta=pose.position.map((v,i)=>v-pose.target[i]),distance=Math.hypot(...delta)
 const camera=projectionCamera({target:pose.target,distance,yawDeg:Math.atan2(delta[0],delta[2])*180/Math.PI,pitchDeg:-Math.asin(delta[1]/distance)*180/Math.PI},viewport)
 const anchor=window.__ggjavaezWorld!.scene().entities[id].anchor,point=[...anchor.position];point[2]+=anchor.size[2]/2+.02
 return screenPoint(point,camera,viewport)
},id)}
async function pickReference(page:Page){
 const target=await page.evaluate(id=>window.__ggjavaezWorld!.scene().references.find(ref=>ref.targetId===id&&ref.sourceSlotId==='slot:frame:main:1:p')!,person)
 const points=await page.evaluate(async id=>{
  const path='/src/camera/projection.ts',{projectionCamera,screenPoint}=await import(path),pose=window.__ggjavaezQA!.cameraPose()
  const viewport={width:innerWidth,height:innerHeight},delta=pose.position.map((v,i)=>v-pose.target[i]),distance=Math.hypot(...delta)
  const camera=projectionCamera({target:pose.target,distance,yawDeg:Math.atan2(delta[0],delta[2])*180/Math.PI,pitchDeg:-Math.asin(delta[1]/distance)*180/Math.PI},viewport)
  const curve=window.__ggjavaezWorld!.plan().curves.find(curve=>curve.id===id)!,safe=window.__ggjavaezQA!.shellRects().safeFrame
  return curve.points.slice(1).flatMap((to,index)=>{const from=curve.points[index],p=screenPoint(from.map((v,i)=>(v+to[i])/2),camera,viewport);return p.z>-1&&p.z<1&&p.x>safe.x&&p.x<safe.x+safe.width&&p.y>safe.y&&p.y<safe.y+safe.height?[p]:[]})
 },target.id)
 expect(points.length).toBeGreaterThan(0)
 for(const point of points){
  await page.mouse.click(point.x,point.y);await ready(page)
  if(await page.evaluate(id=>window.__ggjavaezQA!.selection()?.kind==='reference'&&window.__ggjavaezQA!.selection()?.id===id,target.id))return target
  if(await inspector(page).count())await inspector(page).getByRole('button',{name:'Close inspector',exact:true}).click()
 }
 throw new Error('Actual Person p curve could not be depth-picked')
}

test('the Person state can be inspected and reconstructed in either direction',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,18);await home(page)
 const before=await pose(page),point=await pointOnBody(page,person);await page.mouse.click(point.x,point.y);await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'object',id:person})
 await expect(inspector(page)).toContainText('Person #17');await expect(age(page)).toHaveText('18');expect(await pose(page)).toEqual(before)
 await page.getByRole('button',{name:'Previous Event',exact:true}).click();await ready(page);await expect(age(page)).toHaveText('0')
 await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page);await expect(age(page)).toHaveText('18')
 await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(person)
 await page.getByRole('button',{name:'Trace',exact:true}).click();await ready(page);await expect(page.getByRole('group',{name:'Trace scope',exact:true})).toBeVisible()
 await home(page);expect((await cameraState(page)).mode).toBe('EXPLORE');expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(person)
 await expect(rail(page)).toHaveAttribute('aria-valuenow','18');await expect(age(page)).toHaveText('18');expect(errors).toEqual([])
})
test('camera input takes control while playback continues',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,9);await follow(page)
 await page.getByRole('button',{name:'Play recorded execution',exact:true}).click();await expect(page.getByRole('button',{name:'Pause playback',exact:true})).toBeVisible()
 const safe=await page.evaluate(()=>window.__ggjavaezQA!.shellRects().safeFrame),x=safe.x+safe.width*.55,y=safe.y+safe.height*.5,before=await pose(page)
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y+30,{steps:10});await page.mouse.up();await ready(page)
 expect(await pose(page)).not.toEqual(before);expect(await cameraState(page)).toMatchObject({mode:'EXPLORE',follow:false})
 await expect(inspector(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'Pause playback',exact:true})).toBeVisible()
 await expect.poll(async()=>Number(await rail(page).getAttribute('aria-valuenow'))).toBeGreaterThan(9);expect(errors).toEqual([])
})
test('reference picking, pan, and dolly work in the same world',async({page})=>{
 const errors=browserErrors(page);await page.emulateMedia({reducedMotion:'reduce'});await open(page);await seekCursor(page,18);await home(page)
 const before=await pose(page),reference=await pickReference(page)
 await expect(inspector(page)).toContainText(`Recorded reference · ${reference.sourceSlotId} → ${person}`)
 expect(await page.evaluate(id=>{const node=window.__ggjavaezWorld!.scene().entities[id];return node.kind==='object'?`${node.title} #${node.displayId}`:null},reference.targetId)).toBe('Person #17')
 expect(await pose(page)).toEqual(before);await inspector(page).getByRole('button',{name:'Close inspector',exact:true}).click();await ready(page)
 const canvas=page.locator('.world-canvas canvas'),initial=await canvas.screenshot(),safe=await page.evaluate(()=>window.__ggjavaezQA!.shellRects().safeFrame),x=safe.x+safe.width*.6,y=safe.y+safe.height*.6
 await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+45,y+15,{steps:8});await page.mouse.up({button:'right'});await ready(page)
 const pan=await pose(page),afterPan=await canvas.screenshot();expect(pan).not.toEqual(before);expect(afterPan.equals(initial)).toBe(false)
 await page.mouse.wheel(0,-380);await ready(page);expect(await pose(page)).not.toEqual(pan);expect((await canvas.screenshot()).equals(afterPan)).toBe(false)
 expect((await cameraState(page)).mode).toBe('EXPLORE');await home(page);await expect(rail(page)).toHaveAttribute('aria-valuenow','18');expect(errors).toEqual([])
})
test('keyboard inspection, source focus, Follow toggle, and low effects preserve state',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,18);await home(page);await selectEntity(page,person);await expect(age(page)).toHaveText('18');await sourceAt(page,18)
 await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page)
 // Object Focus reveals its recorded allocation line, not the mutation line.
 const allocated=trace.events.find(event=>event.type==='ALLOCATE_OBJECT')!
 expect(await page.evaluate(()=>window.__ggjavaezQA!.source()?.target?.line)).toBe(allocated.source!.line)
 await command(page,'View: Quality: Interactive');expect(await page.evaluate(()=>window.__ggjavaezWorld!.quality().setting)).toBe('INTERACTIVE');await expect(age(page)).toHaveText('18')
 await follow(page);expect((await cameraState(page)).follow).toBe(true)
 await page.locator('.world-canvas').focus();await page.keyboard.press('+');await ready(page);expect((await cameraState(page)).follow).toBe(false)
 await follow(page);expect((await cameraState(page)).follow).toBe(true);await expect(age(page)).toHaveText('18');await expect(rail(page)).toHaveAttribute('aria-valuenow','18');expect(errors).toEqual([])
})
test('reduced motion and arbitrary scrubbing retain exact source and object state',async({page})=>{
 const errors=browserErrors(page);await page.emulateMedia({reducedMotion:'reduce'});await open(page)
 for(const [cursor,value] of [[18,'18'],[10,'0'],[17,'0'],[18,'18']]as const){await seekCursor(page,cursor);await home(page);await selectEntity(page,person);await expect(age(page)).toHaveText(value);await sourceAt(page,cursor)}
 await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(person)
 await expect(age(page)).toHaveText('18');await expect(rail(page)).toHaveAttribute('aria-valuenow','18');expect(errors).toEqual([])
})
test('the runtime and source load using local assets only',async({page})=>{
 const errors=browserErrors(page),remote:string[]=[]
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'||url.protocol==='data:'||url.protocol==='blob:')return route.continue();remote.push(url.origin);return route.abort()})
 await open(page);await seekCursor(page,18);await home(page);await selectEntity(page,person);await expect(inspector(page)).toContainText('Person #17');await expect(age(page)).toHaveText('18');await sourceAt(page,18)
 await page.waitForTimeout(400);expect(errors).toEqual([]);expect(remote).toEqual([])
})
