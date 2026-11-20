import {expect,test,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {PerspectiveCamera,Vector3} from 'three'
import {browserErrors,focusSelection,home,ready,runFixture,selectEntity,stopOwnedSession} from './harness'

test.afterEach(async({request})=>stopOwnedSession(request))
async function observation(page:Page,id:string){
 return page.evaluate(id=>{
  const world=window.__ggjavaezWorld!,scene=world.scene()
  return{viewport:{width:innerWidth,height:innerHeight},pose:window.__ggjavaezQA!.cameraPose(),shell:window.__ggjavaezQA!.shellRects(),selection:world.selection(),focus:window.__ggjavaezQA!.focusTarget(),recordingId:scene.recordingId,cursor:scene.cursor,anchor:scene.entities[id].anchor,anchors:Object.fromEntries(Object.entries(scene.entities).map(([key,node])=>[key,node.anchor]))}
 },id)
}
function projectedFace(value:Awaited<ReturnType<typeof observation>>){
 const {pose,viewport,anchor}=value,camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000)
 camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.updateMatrixWorld()
 const corners=[-1,1].flatMap(x=>[-1,1].map(y=>new Vector3(anchor.position[0]+x*anchor.size[0]/2,anchor.position[1]+y*anchor.size[1]/2,anchor.position[2]+anchor.size[2]/2).project(camera)))
 return{left:Math.min(...corners.map(p=>(p.x+1)*viewport.width/2)),right:Math.max(...corners.map(p=>(p.x+1)*viewport.width/2)),top:Math.min(...corners.map(p=>(1-p.y)*viewport.height/2)),bottom:Math.max(...corners.map(p=>(1-p.y)*viewport.height/2))}
}
function expectIdentity(current:Awaited<ReturnType<typeof observation>>,prior:Awaited<ReturnType<typeof observation>>){
 expect({recordingId:current.recordingId,cursor:current.cursor,selection:current.selection,focus:current.focus,anchors:current.anchors}).toEqual({recordingId:prior.recordingId,cursor:prior.cursor,selection:prior.selection,focus:prior.focus,anchors:prior.anchors})
}
function expectPose(current:Awaited<ReturnType<typeof observation>>,prior:Awaited<ReturnType<typeof observation>>){
 for(const field of ['position','target'] as const)for(let axis=0;axis<3;axis++)expect(current.pose[field][axis]).toBeCloseTo(prior.pose[field][axis],6)
}
for(const reducedMotion of [false,true])test(`actual focused object preserves camera on resize and reframes only on explicit Focus${reducedMotion?' reduced motion':''}`,async({page,request})=>{
 test.setTimeout(90000);const errors=browserErrors(page);await page.setViewportSize({width:1728,height:1117});await page.emulateMedia({reducedMotion:reducedMotion?'reduce':'no-preference'})
 const session=await runFixture(page,request,'domain');await home(page)
 const id=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).find(node=>node.kind==='object'&&node.title==='StockItem')!.id)
 await selectEntity(page,id);await focusSelection(page)
 let prior=await observation(page,id)
 const evidence:unknown[]=[]
 for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1728,height:1117}]){
  await page.setViewportSize(viewport);await ready(page)
  const resized=await observation(page,id);expectIdentity(resized,prior);expectPose(resized,prior)
  // Requirement 30.10 preserves the camera target during resize. A new native
  // Focus Selection command, rather than resize itself, requests new framing.
  await focusSelection(page);const focused=await observation(page,id),face=projectedFace(focused)
  expectIdentity(focused,prior)
  const safe=focused.shell.safeFrame,bottom=viewport.width<1024?Math.min(safe.y+safe.height,focused.shell.inspector!.y):safe.y+safe.height
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/focus-resize-${viewport.width}x${viewport.height}${reducedMotion?'-reduced':''}.png`})
  evidence.push({resized,focused,face})
  await writeFile(`.ggjavaez/qa/reference-exact/focus-resize${reducedMotion?'-reduced':''}.json`,JSON.stringify({sessionId:session.id,realJvm:true,evidence,errors},null,2)+'\n')
  expect(face.left).toBeGreaterThanOrEqual(safe.x);expect(face.right).toBeLessThanOrEqual(safe.x+safe.width)
  expect(face.top).toBeGreaterThanOrEqual(safe.y);expect(face.bottom).toBeLessThanOrEqual(bottom)
  expect(face.bottom-face.top).toBeGreaterThanOrEqual(viewport.height*.38-1);expect(face.bottom-face.top).toBeLessThanOrEqual(viewport.height*.52+1)
  prior=focused
 }
 // Manual input cancels the script while retaining the Focus overlay. Further
 // resizes must not restore the earlier scripted composition behind the user.
 await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
 const manual=await observation(page,id);expectIdentity(manual,prior);expect(manual.pose).not.toEqual(prior.pose)
 await page.setViewportSize({width:760,height:900});await ready(page)
 const afterManualResize=await observation(page,id);expectIdentity(afterManualResize,manual);expectPose(afterManualResize,manual)
 await page.waitForTimeout(250);await ready(page);expectPose(await observation(page,id),manual);expect(errors).toEqual([])
})
