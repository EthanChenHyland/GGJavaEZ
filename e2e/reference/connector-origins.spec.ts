import {expect,test,type APIRequestContext,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {PerspectiveCamera,Vector3} from 'three'
import type {ExecutionSession} from '../../src/execution/contracts'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import {historyForTrace} from '../../src/runtime/history'
import {browserErrors,currentSession,focusSelection,home,ready,selectEntity} from './harness'

const ownedProjects=new Set<string>()
const activePhases=['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED']
test.afterEach(async({request})=>{
 const session=await currentSession(request)
 if(session&&ownedProjects.has(session.projectId)&&activePhases.includes(session.phase)){
  const response=await request.post(`/api/execution/${session.id}/stop`,{data:{}});expect(response.ok()).toBe(true)
 }
})

for(const viewport of[{width:1440,height:900},{width:760,height:900}])for(const reducedMotion of[false,true])test(`actual virtualized array Focus contains canonical cell ${viewport.width}x${viewport.height}${reducedMotion?' reduced motion':''}`,async({page,request})=>{
 test.setTimeout(90000);const errors=browserErrors(page);await page.setViewportSize(viewport)
 await page.emulateMedia({reducedMotion:reducedMotion?'reduce':'no-preference'})
 const session=await runOrigins(page,request)
 const arrayId=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).find(node=>node.kind==='array'&&node.length===10001)!.id)
 await selectArrayThroughCatalog(page,arrayId)
 const inspector=page.getByRole('complementary',{name:'Selection inspector',exact:true})
 await inspector.getByRole('spinbutton',{name:'Recorded values index',exact:true}).fill('6500');await page.keyboard.press('Enter')
 await inspector.getByRole('button',{name:'Reveal index 6500',exact:true}).click();await ready(page)
 const slotId=`${arrayId}:element:6500`
 const before=await page.evaluate(({arrayId,slotId})=>({pose:window.__ggjavaezQA!.cameraPose(),cell:window.__ggjavaezWorld!.plan().cellWindows.get(arrayId)!.mapping.get(slotId),cursor:window.__ggjavaezWorld!.scene().cursor}),{arrayId,slotId})
 await focusSelection(page)
 const after=await page.evaluate(({arrayId,slotId})=>({pose:window.__ggjavaezQA!.cameraPose(),cell:window.__ggjavaezWorld!.plan().cellWindows.get(arrayId)!.mapping.get(slotId),cursor:window.__ggjavaezWorld!.scene().cursor,shell:window.__ggjavaezQA!.shellRects(),focus:window.__ggjavaezQA!.focusTarget(),selection:window.__ggjavaezQA!.selection(),point:window.__ggjavaezWorld!.projectedPoint(slotId),framing:window.__ggjavaezWorld!.plan().framing,detail:window.__ggjavaezWorld!.plan().detailLevel}),{arrayId,slotId})
 const camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000);camera.position.set(...after.pose.position);camera.lookAt(...after.pose.target);camera.updateMatrixWorld()
 const anchor=after.cell!.anchor,points=[-1,1].flatMap(x=>[-1,1].map(y=>new Vector3(anchor.position[0]+x*anchor.size[0]/2,anchor.position[1]+y*anchor.size[1]/2,anchor.position[2]+anchor.size[2]/2).project(camera)))
 const face={left:Math.min(...points.map(p=>(p.x+1)*viewport.width/2)),right:Math.max(...points.map(p=>(p.x+1)*viewport.width/2)),top:Math.min(...points.map(p=>(1-p.y)*viewport.height/2)),bottom:Math.max(...points.map(p=>(1-p.y)*viewport.height/2))}
 const capture=`array6500-focus-${viewport.width}x${viewport.height}${reducedMotion?'-reduced':''}`
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/${capture}.png`})
 await writeFile(`.ggjavaez/qa/reference-exact/${capture}.json`,JSON.stringify({sessionId:session.id,before,after,face,errors},null,2)+'\n')
 expect(after.selection).toEqual({kind:'slot',id:slotId});expect(after.focus?.targetId).toBe(slotId);expect(after.cursor).toBe(before.cursor)
 expect(after.point?.visible,'The focused canonical cell must be in the viewport').toBe(true)
 expect(after.point!.x).toBeGreaterThanOrEqual(after.shell.safeFrame.x);expect(after.point!.x).toBeLessThanOrEqual(after.shell.safeFrame.x+after.shell.safeFrame.width)
 const bottom=viewport.width<1024&&after.shell.inspector?after.shell.inspector.y:after.shell.safeFrame.y+after.shell.safeFrame.height
 expect(after.point!.y).toBeGreaterThanOrEqual(after.shell.safeFrame.y);expect(after.point!.y).toBeLessThanOrEqual(bottom)
 expect(after.cell!.index).toBe(6500)
 expect(face.left).toBeGreaterThanOrEqual(after.shell.safeFrame.x);expect(face.right).toBeLessThanOrEqual(after.shell.safeFrame.x+after.shell.safeFrame.width)
 expect(face.top).toBeGreaterThanOrEqual(after.shell.safeFrame.y);expect(face.bottom).toBeLessThanOrEqual(bottom)
 expect(face.bottom-face.top).toBeGreaterThanOrEqual(viewport.height*.38-1);expect(face.bottom-face.top).toBeLessThanOrEqual(viewport.height*.52+1)
 // A later LOD change caused by real input belongs to the user. Focus identity
 // remains, but the completed scripted request must not pull the camera back.
 await page.mouse.move(after.shell.safeFrame.x+after.shell.safeFrame.width*.7,after.shell.safeFrame.y+25)
 await page.mouse.wheel(0,3000);await ready(page);await page.waitForTimeout(250)
 await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
 const explored=await page.evaluate(()=>({pose:window.__ggjavaezQA!.cameraPose(),selection:window.__ggjavaezQA!.selection(),focus:window.__ggjavaezQA!.focusTarget(),detail:window.__ggjavaezWorld!.plan().detailLevel,cursor:window.__ggjavaezWorld!.scene().cursor}))
 expect(explored.detail).not.toBe(after.detail);expect(explored.selection).toEqual(after.selection);expect(explored.focus).toEqual(after.focus);expect(explored.cursor).toBe(after.cursor)
 const distance=(pose:typeof after.pose)=>Math.hypot(...pose.position.map((coordinate,index)=>coordinate-pose.target[index]))
 expect(distance(explored.pose)).toBeGreaterThan(distance(after.pose)*3)
 await page.waitForTimeout(250);await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(explored.pose)
 await writeFile(`.ggjavaez/qa/reference-exact/${capture}.json`,JSON.stringify({sessionId:session.id,before,after,face,explored,errors},null,2)+'\n')
 expect(errors).toEqual([])
})

async function runOrigins(page:Page,request:APIRequestContext):Promise<ExecutionSession>{
 const previous=await currentSession(request)
 expect(previous===null||!activePhases.includes(previous.phase),'Do not interrupt another active JVM').toBe(true)
 const content=await readFile('fixtures/reference-exact/hover-origins/HoverOrigins.java','utf8')
 const imported=await request.post('/api/projects/import',{data:{name:`Connector origins ${randomUUID()}`,files:[{path:'HoverOrigins.java',content}]}})
 expect(imported.ok(),await imported.text()).toBe(true)
 const projectId=(await imported.json()).id as string;ownedProjects.add(projectId)
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),projectId)
 await page.goto('/?qa=1')
 await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function')
 const run=page.getByRole('button',{name:'Run',exact:true});await expect(run).toHaveAttribute('aria-disabled','false')
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${projectId}/execution`&&response.request().method()==='POST')
 await run.click();const response=await pending;expect(response.ok(),await response.text()).toBe(true)
 const started=await response.json() as ExecutionSession
 await expect.poll(async()=>{const current=await currentSession(request);return current?.id===started.id?current.phase:null},{timeout:45000}).toBe('COMPLETED')
 const session=(await currentSession(request))!
 expect(session.id).toBe(started.id);expect(session.projectId).toBe(projectId)
 expect(session.stdout).toBe('7:9\n');expect(session.stderr).toBe('');expect(session.exitCode).toBe(0)
 expect(session.build?.success).toBe(true);expect(session.recording?.state).toBe('FULL');expect(session.terminalStatus).toBe('complete')
 expect(session.rawEvents.length).toBeGreaterThan(0)
 const oracle=normalizeTrace(session.rawEvents,session.sourceManifest,{
  status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic,
  ...(session.recording?{recording:session.recording}:{}),...(session.capability?{capability:session.capability}:{}),
 },`execution:${session.id}`)
 const count=oracle.trace.events.length;historyForTrace(oracle.trace).dispose()
 await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,normalizedEvents:count,buildSuccess:true}),contentType:'application/json'})
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.appState().dimensions.view.recordingId)).toBe(`execution:${session.id}`)
 const slider=page.getByRole('slider',{name:'Recorded execution position',exact:true})
 await expect(slider).toHaveAttribute('aria-valuemax',String(count),{timeout:45000});await slider.focus();await page.keyboard.press('End')
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.scene().cursor)).toBe(count)
 await ready(page);return session
}

async function hoverReference(page:Page,referenceId:string,expected:readonly string[],capture:string,nativeDollySteps=0):Promise<{referenceId:string;text:string;haloOffsetPx:number;nativeDollySteps:number;point:{x:number;y:number};before:unknown}>{
 const observed=await page.evaluate(id=>{
  const world=window.__ggjavaezWorld!,scene=world.scene(),curve=world.plan().curves.find(curve=>curve.id===id)
  if(!curve)throw new Error(`Captured reference has no individual presented curve: ${id}`)
  return{points:curve.points,safe:window.__ggjavaezQA!.shellRects().safeFrame,before:{recordingId:scene.recordingId,cursor:scene.cursor,selection:window.__ggjavaezQA!.selection(),pose:window.__ggjavaezQA!.cameraPose()}}
 },referenceId)
 const viewport=page.viewportSize()!,camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000)
 camera.position.set(...observed.before.pose.position);camera.lookAt(...observed.before.pose.target);camera.updateMatrixWorld()
 const project=(point:readonly[number,number,number])=>{const p=new Vector3(...point).project(camera);return{x:(p.x+1)*viewport.width/2,y:(1-p.y)*viewport.height/2,z:p.z}}
 const candidates=observed.points.slice(1).flatMap((point,index)=>{
  const a=project(observed.points[index]),b=project(point),length=Math.hypot(b.x-a.x,b.y-a.y)
  if(length<20||a.z>1||b.z>1)return[]
  return[.35,.5,.65].map(t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,nx:-(b.y-a.y)/length,ny:(b.x-a.x)/length,length}))
 }).filter(p=>p.x>observed.safe.x+8&&p.x<observed.safe.x+observed.safe.width-8&&p.y>observed.safe.y+8&&p.y<observed.safe.y+observed.safe.height-8).sort((a,b)=>b.length-a.length)
 const tip=page.locator('[data-connector-tooltip]');let found:typeof candidates[number]|undefined
 for(const candidate of candidates.slice(0,120)){
  await page.mouse.move(candidate.x,candidate.y);await page.waitForTimeout(25)
  if(!await tip.count()||await tip.getAttribute('data-connector-tooltip')!==referenceId)continue
  for(const sign of[-1,1]){
   await page.mouse.move(candidate.x+candidate.nx*3*sign,candidate.y+candidate.ny*3*sign);await page.waitForTimeout(25)
   if(await tip.count()&&await tip.getAttribute('data-connector-tooltip')===referenceId){found=candidate;break}
  }
  if(found)break
 }
 if(!found&&nativeDollySteps<24){
  await page.mouse.move(25,25);await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
  return hoverReference(page,referenceId,expected,capture,nativeDollySteps+1)
 }
 if(!found){
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/${capture}-unreachable.png`})
  await writeFile(`.ggjavaez/qa/reference-exact/${capture}-unreachable.json`,JSON.stringify({observed,candidates,nativeDollySteps},null,2)+'\n')
 }
 expect(found,'Captured reference core and 3 px halo must be reachable through native hover').toBeDefined()
 for(const text of expected)await expect(tip).toContainText(text)
 const text=await tip.innerText(),bounds=(await tip.boundingBox())!
 expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0)
 expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height)
 expect(await page.evaluate(()=>({recordingId:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,selection:window.__ggjavaezQA!.selection(),pose:window.__ggjavaezQA!.cameraPose()}))).toEqual(observed.before)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/${capture}.png`})
 await page.mouse.move(25,25);await expect(tip).toHaveCount(0,{timeout:200})
 return{referenceId,text,haloOffsetPx:3,nativeDollySteps,point:found!,before:observed.before}
}

async function selectArrayThroughCatalog(page:Page,id:string){
 await home(page)
 await page.locator('.world-canvas').focus();await page.keyboard.press('Escape');await ready(page)
 for(let attempt=0;attempt<16;attempt++){
  await page.locator('.world-canvas').focus();await page.keyboard.press('Tab');await ready(page)
  const list=page.getByRole('listbox',{name:'Runtime entities',exact:true})
  const offered=await list.getByRole('option').evaluateAll(options=>options.map(option=>decodeURIComponent(option.id.slice('world-entity-'.length))))
  const target=offered.find(candidate=>candidate===id||candidate.startsWith(`${id}:element:`))
  if(target){await selectEntity(page,target);return}
  const close=page.getByRole('button',{name:'Close inspector',exact:true});if(await close.count())await close.click()
  await page.locator('.world-canvas').focus();await page.keyboard.press('Escape');await ready(page)
  await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
 }
 throw new Error('Captured array body or cell cannot be reached through native catalog and dolly navigation')
}

for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`actual static and virtualized array connector origins ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(90000)
 const errors=browserErrors(page);await page.setViewportSize(viewport)
 const session=await runOrigins(page,request);await home(page)
 const origins=await page.evaluate(()=>{
  const scene=window.__ggjavaezWorld!.scene(),nodes=Object.values(scene.entities)
  const owner=nodes.find(node=>node.kind==='class'&&node.rows.some(row=>row.name==='shared'))
  const array=nodes.find(node=>node.kind==='array'&&node.length===10001)
  if(owner?.kind!=='class'||array?.kind!=='array')throw new Error('Fresh JVM must capture class state and the large reference array')
  const row=owner.rows.find(row=>row.name==='shared')!,staticRef=scene.references.find(ref=>ref.sourceId===owner.id&&ref.sourceSlotId===row.slotId)
  const slotId=`${array.id}:element:6500`,arrayRef=scene.references.find(ref=>ref.sourceId===array.id&&ref.sourceSlotId===slotId)
  if(!staticRef||!arrayRef)throw new Error('Fresh JVM must capture both reference origins')
  const target=(id:string)=>{const node=scene.entities[id];if(node.kind==='frame'||node.kind==='class')throw new Error('Expected actual heap target');return{title:node.title,displayId:node.displayId}}
  return{static:{ownerId:owner.id,title:owner.title,referenceId:staticRef.id,target:target(staticRef.targetId)},array:{ownerId:array.id,title:array.title,slotId,referenceId:arrayRef.id,target:target(arrayRef.targetId)}}
 })
 await selectEntity(page,origins.static.ownerId);await focusSelection(page)
 await page.getByRole('button',{name:'Close inspector',exact:true}).click();await ready(page)
 const staticCapture=await hoverReference(page,origins.static.referenceId,[origins.static.title,'shared',origins.static.target.title,`#${origins.static.target.displayId}`],`connector-static-${viewport.width}x${viewport.height}`)
 await selectArrayThroughCatalog(page,origins.array.ownerId)
 const inspector=page.getByRole('complementary',{name:'Selection inspector',exact:true})
 await inspector.getByRole('spinbutton',{name:'Recorded values index',exact:true}).fill('6500');await page.keyboard.press('Enter')
 await inspector.getByRole('button',{name:'Reveal index 6500',exact:true}).click();await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:origins.array.slotId})
 await focusSelection(page)
 await page.getByRole('button',{name:'Close inspector',exact:true}).click();await ready(page)
 const arrayWindow=await page.evaluate(({ownerId,slotId})=>{
  const cells=window.__ggjavaezWorld!.plan().cellWindows.get(ownerId),cell=cells?.mapping.get(slotId)
  return{index:cell?.index,presentedSlot:cell?.presentedSlot,mappingSize:cells?.mapping.size}
 },origins.array)
 expect(arrayWindow.index).toBe(6500);expect(arrayWindow.presentedSlot).not.toBe(6500);expect(arrayWindow.mappingSize).toBeLessThan(10001)
 await home(page)
 const arrayCapture=await hoverReference(page,origins.array.referenceId,[origins.array.title,'[6500]',origins.array.target.title,`#${origins.array.target.displayId}`],`connector-array6500-${viewport.width}x${viewport.height}`)
 await writeFile(`.ggjavaez/qa/reference-exact/connector-origins-${viewport.width}x${viewport.height}.json`,JSON.stringify({sessionId:session.id,origins,arrayWindow,captures:[staticCapture,arrayCapture],errors},null,2)+'\n')
 expect(errors).toEqual([])
})
