import {expect,test} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,seekCursor,stopOwnedSession} from './harness'
import {clickCluster,far} from './clusterInteractions'
test.afterEach(async({request})=>stopOwnedSession(request))
for(const viewport of [{width:1440,height:900},{width:760,height:900}])test(`actual JVM collection reservation, Focus and entry picking ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(90000);await page.setViewportSize(viewport)
 const errors=browserErrors(page),session=await runFixture(page,request,'dense');await home(page);await far(page)
 const initial=await page.evaluate(()=>({scene:window.__ggjavaezWorld!.scene(),events:window.__ggjavaezWorld!.recordedEvents()})),collection=Object.values(initial.scene.entities).find(node=>node.kind==='collection')!
 expect(collection.kind).toBe('collection');if(collection.kind!=='collection')throw new Error('Fixture has no captured collection')
 const allocation=initial.events.find(event=>event.type==='ALLOCATE_OBJECT'&&event.objectId===collection.id)!
 expect(allocation.source).not.toBeNull();expect(collection.anchor.region).toBe('heap');expect(collection.anchor.size).toEqual([5.2,9.93,2.3])
 const pose=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose());await clickCluster(page,false,undefined,false,collection.id);await ready(page)
 await page.getByRole('list',{name:'Cluster members'}).getByRole('button',{name:`Select ${collection.title} #${collection.displayId}`,exact:true}).click();await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(collection.id);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
 // The narrow sheet leaves a short upper rectangle. Close it through its real
 // control before explicitly focusing this tall body in the full World.
 // Closing alone must not move the camera or change runtime selection.
 if(viewport.width<1024){await page.getByRole('complementary',{name:'Selection inspector'}).getByRole('button',{name:'Close inspector'}).click();await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)}
 await page.locator('.world-canvas').focus();await page.keyboard.press('Enter');await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(collection.id)
 const focused=await page.evaluate(async id=>{
  const modulePath='/src/world/faceRows.ts',shared=await import(modulePath),world=window.__ggjavaezWorld!,scene=world.scene(),plan=world.plan(),node=scene.entities[id]
  return{node,presented:plan.entities.get(id)!,visible:shared.faceRows(node,plan.entities.get(id)!).visible.map((row:{slotId:string})=>row.slotId),text:world.collectionText().filter(label=>label.entityId===id),headings:world.runtimeHeadings().filter(label=>label.entityId===id),pose:window.__ggjavaezQA!.cameraPose(),counts:plan.referencePresentation.counts,renderer:world.renderer()}
 },collection.id)
 expect(focused.visible.length).toBe(24);expect(focused.presented.detail).toBe('CLOSE');expect(focused.node.anchor).toEqual(collection.anchor)
 expect(focused.renderer.calls).toBeLessThanOrEqual(250)
 expect(focused.text.filter(label=>label.kind==='value').map(label=>label.slotId)).toEqual(focused.visible)
 expect(focused.text.find(label=>label.kind==='size')?.text).toBe(`size = ${collection.size}`);expect(focused.text.find(label=>label.kind==='more')?.text).toBe(`+${collection.size-24} more`)
 for(const label of focused.text){expect(label.opacity).toBeGreaterThan(0);expect(label.fontPixels).toBeGreaterThanOrEqual(12);expect(label.planePixels).toBeGreaterThanOrEqual(12);expect(label.widthPixels).toBeGreaterThanOrEqual(12)}
 for(const label of focused.headings){expect(label.opacity).toBeGreaterThan(0);expect(label.fontPixels).toBeGreaterThanOrEqual(12);expect(label.planePixels).toBeGreaterThanOrEqual(12);expect(label.widthPixels).toBeGreaterThanOrEqual(12)}
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/collection-before-pick-${viewport.width}x${viewport.height}.png`})
 await writeFile(`.ggjavaez/qa/reference-exact/collection-before-pick-${viewport.width}x${viewport.height}.json`,JSON.stringify({realJvmExecuted:true,sessionId:session.id,allocation,focused},null,2)+'\n')
 const camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000);camera.position.set(...focused.pose.position);camera.lookAt(...focused.pose.target);camera.updateMatrixWorld()
 // Pick the real chip away from its centre reference port/connector, rather
 // than setting a slot selection through QA or application stores.
 const entry=collection.entries[0],point=new Vector3(...entry.port!);point.x-=(collection.anchor.size[0]/2-.25)*.25;point.z+=.02;point.project(camera)
 await page.mouse.click((point.x+1)*viewport.width/2,(1-point.y)*viewport.height/2);await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:entry.slotId});expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(focused.pose)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/collection-focus-${viewport.width}x${viewport.height}.png`})
 await page.getByRole('complementary',{name:'Selection inspector'}).getByRole('button',{name:'Close inspector'}).click();await ready(page)
 await seekCursor(page,allocation.seq+1)
 const beforeSummary=await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id],collection.id)
 expect(beforeSummary.kind).toBe('object');expect(beforeSummary.anchor).toEqual(collection.anchor);expect('entries'in beforeSummary).toBe(false)
 expect(await page.evaluate(id=>window.__ggjavaezWorld!.collectionText().filter(label=>label.entityId===id),collection.id)).toEqual([])
 await seekCursor(page,initial.scene.cursor);expect(await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id].anchor,collection.id)).toEqual(collection.anchor)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(focused.pose);expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(collection.id)
 await writeFile(`.ggjavaez/qa/reference-exact/collection-focus-${viewport.width}x${viewport.height}.json`,JSON.stringify({realJvmExecuted:true,sessionId:session.id,allocation,focused},null,2)+'\n')
 expect(errors).toEqual([])
})
