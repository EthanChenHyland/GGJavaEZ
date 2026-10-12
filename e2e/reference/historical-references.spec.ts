import {expect,test,type Page} from '@playwright/test'
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PerspectiveCamera,Vector3} from 'three'
import type {ExecutionSession} from '../../src/execution/contracts'
import {browserErrors,currentSession,home,ready,seekCursor,selectEntity} from './harness'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import {seek} from '../../src/runtime'
import type {TraceDocument} from '../../src/contracts/runtime'
let ownedProject:string|undefined
test.afterEach(async({request})=>{
 const session=await currentSession(request)
 if(session&&session.projectId===ownedProject&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase))expect((await request.post(`/api/execution/${session.id}/stop`,{data:{}})).ok()).toBe(true)
})
async function partition(page:Page,oracle:TraceDocument){
 const data=await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene(),plan=window.__ggjavaezWorld!.plan();return{bindings:scene.historicalBindings,presentation:plan.historicalReferencePresentation,curves:plan.curves.filter(curve=>curve.kind==='binding-history'),bundles:plan.bundles.filter(bundle=>bundle.kind==='binding-history'),current:plan.referencePresentation,cursor:scene.cursor,flowPresentation:plan.flowPresentation,flowBundles:plan.bundles.filter(bundle=>bundle.kind==='flow')}})
 const eligible=data.bindings.filter(binding=>binding.endKind==='overwritten'||binding.endKind==='null'),counts=data.presentation.counts
 const ids=[...data.curves.map(curve=>curve.id),...data.bundles.flatMap(bundle=>{expect(bundle.count).toBe(bundle.referenceIds!.length);return bundle.referenceIds!}),...data.presentation.unavailable.map(item=>item.id),...data.presentation.internal.map(item=>item.id),...data.presentation.scopeExcluded]
 expect(ids.slice().sort()).toEqual(eligible.map(binding=>binding.id).sort());expect(new Set(ids).size).toBe(ids.length)
 expect(counts.recorded).toBe(data.bindings.length);expect(counts.eligible).toBe(eligible.length);expect(counts.recorded).toBe(counts.eligible+counts.lifetimeExcluded);expect(counts.eligible).toBe(counts.drawable+counts.internal+counts.unavailable+counts.scopeExcluded);expect(counts.drawable).toBe(counts.individual+counts.bundled)
 for(const binding of data.bindings){expect(binding.introducedSeq).toBeLessThan(data.cursor);expect(binding.endSeq).toBeLessThan(data.cursor)}
 for(const curve of [...data.curves,...data.bundles])expect(curve.opacity).toBeLessThanOrEqual(.25)
 const supported=new Set(['ARGUMENT_BIND','RECEIVER_BIND','ASSIGN','FIELD_WRITE','STATIC_WRITE','FIELD_READ','STATIC_READ','REFERENCE_BIND','ARRAY_READ','ARRAY_WRITE','RETURN','INPUT_CONSUME','OUTPUT','THROW','UNWIND','CATCH'])
 const expected=(seek(oracle,data.cursor).executionGraph?.edges??[]).filter(edge=>supported.has(edge.kind)).map(edge=>edge.id),fp=data.flowPresentation,fc=fp.counts
 const flowIds=[...fp.individualIds,...data.flowBundles.flatMap(bundle=>{expect(bundle.count).toBe(bundle.flowIds.length);return bundle.flowIds}),...fp.unavailable.map(item=>item.id),...fp.scopeExcluded]
 expect(flowIds.slice().sort()).toEqual(expected.slice().sort());expect(new Set(flowIds).size).toBe(expected.length)
 expect(fc.recorded).toBe(expected.length);expect(fc.recorded).toBe(fc.drawable+fc.unavailable+fc.scopeExcluded);expect(fc.drawable).toBe(fc.individual+fc.bundled)
 return data
}
for(const viewport of [{width:1440,height:900},{width:760,height:900}])test(`actual JVM historical bindings, native picking and prefix replay ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(90000);await page.setViewportSize(viewport);const errors=browserErrors(page)
 const response=await request.post('/api/projects/import',{data:{name:`Reference bindings ${randomUUID()}`,files:[{path:'BindingApp.java',content:await readFile('fixtures/reference-exact/bindings/BindingApp.java','utf8')}]}})
 expect(response.ok()).toBe(true);ownedProject=(await response.json()).id
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id!),ownedProject);await page.goto('/?qa=1');await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
 const launched=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${ownedProject}/execution`&&response.request().method()==='POST');await page.getByRole('button',{name:'Run',exact:true}).click();const session=await (await launched).json() as ExecutionSession
 await expect.poll(async()=>{const current=await currentSession(request);return current?.id===session.id?current.phase:null},{timeout:45000}).toBe('COMPLETED')
 const completed=(await currentSession(request))!;expect(completed.build?.success).toBe(true);expect(completed.exitCode).toBe(0);expect(completed.stdout).toBe('BINDINGS DONE\n');expect(completed.rawEvents.length).toBeGreaterThan(0)
 const traceOracle=normalizeTrace(completed.rawEvents,completed.sourceManifest,{status:'complete',exitCode:0,diagnostic:null}).trace
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.appState().dimensions.view.recordingId)).toBe(`execution:${session.id}`)
 await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('End');await ready(page);await home(page)
 const scene=await page.evaluate(()=>window.__ggjavaezWorld!.scene()),owner=Object.values(scene.entities).find(node=>node.kind==='object'&&node.title==='BindingNode'&&node.groups.some(group=>group.rows.some(row=>row.name==='value'&&row.value.exact==='1')))!
 expect(owner).toBeTruthy();await selectEntity(page,owner.id)
 await page.getByRole('complementary',{name:'Selection inspector'}).getByRole('button',{name:'Close inspector'}).click();await page.locator('.world-canvas').focus();await page.keyboard.press('Enter');await ready(page)
 await page.getByRole('button',{name:'Trace',exact:true}).click();await page.getByRole('group',{name:'Trace scope'}).getByRole('button',{name:'All',exact:true}).click();await ready(page)
 const all=await partition(page,traceOracle);expect(all.presentation.counts.eligible).toBeGreaterThan(64);expect(all.presentation.counts.drawable).toBeGreaterThan(64);expect(all.bundles.length).toBeGreaterThan(0)
 expect(all.bindings.some(binding=>binding.sourceId===owner.id&&binding.endKind==='null')).toBe(true)
 const facts=()=>page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{cursor:scene.cursor,recording:scene.recordingId,anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor])),focus:window.__ggjavaezQA!.focusTarget()}}),before=await facts(),pose=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 const camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000);camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.updateMatrixWorld()
 const safe=await page.evaluate(()=>window.__ggjavaezQA!.shellRects().safeFrame)
 let picked:string|null=null
 for(const curve of all.curves){
  for(let i=2;i<curve.points.length-1;i+=2){
   const p=new Vector3(...curve.points[i-1]).lerp(new Vector3(...curve.points[i]),.5).project(camera),x=(p.x+1)*viewport.width/2,y=(1-p.y)*viewport.height/2
   if(p.z<=-1||p.z>=1||x<safe.x||x>safe.x+safe.width||y<safe.y||y>safe.y+safe.height)continue
   await page.mouse.click(x,y);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
   if(await page.evaluate(id=>window.__ggjavaezQA!.selection()?.kind==='reference'&&window.__ggjavaezQA!.selection()?.id===id,curve.id)){picked=curve.id;break}
  }
  if(picked)break
 }
 expect(picked,'An actual depth-tested historical curve is selectable through native input').not.toBeNull();await ready(page);await partition(page,traceOracle)
 expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
 const inspector=page.getByRole('complementary',{name:'Selection inspector'});await expect(inspector).toContainText('Historical binding · introduced at Event');expect(await inspector.locator('*').count()).toBeLessThanOrEqual(200)
 await inspector.getByRole('button',{name:'Close inspector'}).click();await ready(page)
 const bundled=await partition(page,traceOracle);let pickedBundle:string|null=null
 await writeFile(`.ggjavaez/qa/reference-exact/historical-bundle-pick-${viewport.width}x${viewport.height}.json`,JSON.stringify({bundled,pose,safe},null,2)+'\n')
 for(const bundle of bundled.bundles.filter(bundle=>bundle.from!==bundle.to)){
  for(let i=1;i<bundle.points.length;i++){
   const p=new Vector3(...bundle.points[i-1]).lerp(new Vector3(...bundle.points[i]),.5).project(camera),x=(p.x+1)*viewport.width/2,y=(1-p.y)*viewport.height/2
   if(p.z<=-1||p.z>=1||x<safe.x||x>safe.x+safe.width||y<safe.y||y>safe.y+safe.height)continue
   await page.mouse.click(x,y);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
   if(await page.evaluate(id=>window.__ggjavaezQA!.selection()?.kind==='bundle'&&window.__ggjavaezQA!.selection()?.id===id,bundle.id)){pickedBundle=bundle.id;break}
   // A missed curve can select a real body and open the narrow sheet over the
   // next candidate. Close it natively before trying another World point.
   if(await inspector.count()){await inspector.getByRole('button',{name:'Close inspector'}).click();await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)}
  }
  if(pickedBundle)break
 }
 expect(pickedBundle,'An actual historical aggregate is selectable through native input').not.toBeNull();await ready(page)
 const bundle=(await partition(page,traceOracle)).bundles.find(bundle=>bundle.id===pickedBundle)!
 await expect(inspector).toContainText(`${bundle.count} historical bindings`);expect(await inspector.locator('*').count()).toBeLessThanOrEqual(200)
 await inspector.getByRole('list',{name:'Bundle references'}).getByRole('button').first().click();await ready(page)
 const constituent=await page.evaluate(()=>window.__ggjavaezQA!.selection());expect(constituent?.kind).toBe('reference');expect(bundle.referenceIds).toContain(constituent?.id);await expect(inspector).toContainText('Historical binding · introduced at Event');await partition(page,traceOracle)
 expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/historical-bindings-${viewport.width}x${viewport.height}.png`})
 await inspector.getByRole('button',{name:'Close inspector'}).click();await ready(page)
 const flowPartition=await partition(page,traceOracle);expect(flowPartition.flowBundles.some(bundle=>bundle.count>1)).toBe(true)
 let pickedFlowBundle:string|null=null
 for(const bundle of flowPartition.flowBundles.filter(bundle=>bundle.count>1)){
  for(let i=1;i<bundle.points.length;i++){
   const p=new Vector3(...bundle.points[i-1]).lerp(new Vector3(...bundle.points[i]),.5).project(camera),x=(p.x+1)*viewport.width/2,y=(1-p.y)*viewport.height/2
   if(p.z<=-1||p.z>=1||x<safe.x||x>safe.x+safe.width||y<safe.y||y>safe.y+safe.height)continue
   await page.mouse.click(x,y);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
   if(await page.evaluate(id=>window.__ggjavaezQA!.selection()?.kind==='bundle'&&window.__ggjavaezQA!.selection()?.id===id,bundle.id)){pickedFlowBundle=bundle.id;break}
   if(await inspector.count()){await inspector.getByRole('button',{name:'Close inspector'}).click();await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)}
  }
  if(pickedFlowBundle)break
 }
 expect(pickedFlowBundle,'A genuine residual Flow bundle is selectable through native input').not.toBeNull();await ready(page)
 const flowBundle=(await partition(page,traceOracle)).flowBundles.find(bundle=>bundle.id===pickedFlowBundle)!
 await expect(inspector).toContainText(`${flowBundle.count} recorded flows`);expect(await inspector.locator('*').count()).toBeLessThanOrEqual(200)
 await inspector.getByRole('list',{name:'Bundle flows'}).getByRole('button').first().click();await ready(page)
 const flowConstituent=await page.evaluate(()=>window.__ggjavaezQA!.selection());expect(flowConstituent?.kind).toBe('flow');expect(flowBundle.flowIds).toContain(flowConstituent?.id)
 await expect(inspector).toContainText('Recorded graph edge');await partition(page,traceOracle)
 expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/flow-constituent-${viewport.width}x${viewport.height}.png`})
 const binding=all.bindings.find(binding=>binding.id===picked)!
 await inspector.getByRole('button',{name:'Close inspector'}).click();await seekCursor(page,binding.endSeq!);const earlier=await partition(page,traceOracle);expect(earlier.bindings.some(item=>item.id===binding.id)).toBe(false)
 await seekCursor(page,0);expect((await partition(page,traceOracle)).bindings).toEqual([]);await seekCursor(page,all.cursor);const replay=await partition(page,traceOracle);expect(replay.bindings).toEqual(all.bindings)
 expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
 await page.getByRole('group',{name:'Trace scope'}).getByRole('button',{name:'Current',exact:true}).click();await ready(page);const current=await partition(page,traceOracle);expect(current.curves).toEqual([]);expect(current.bundles).toEqual([]);expect(current.presentation.counts.scopeExcluded).toBe(current.presentation.counts.eligible)
 await page.getByRole('group',{name:'Trace scope'}).getByRole('button',{name:'All',exact:true}).click();await ready(page);await partition(page,traceOracle);expect(errors).toEqual([])
 await writeFile(`.ggjavaez/qa/reference-exact/historical-bindings-${viewport.width}x${viewport.height}.json`,JSON.stringify({realJvmExecuted:true,sessionId:session.id,rawEvents:completed.rawEvents.length,all,picked,pickedBundle,bundle,constituent,pickedFlowBundle,flowBundle,flowConstituent,binding,earlier,replay},null,2)+'\n')
})
