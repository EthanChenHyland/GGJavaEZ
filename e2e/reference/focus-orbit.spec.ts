import {expect,test,type Page} from '@playwright/test'
import {browserErrors,home,ready,runFixture,stopOwnedSession} from './harness'
import {clickCluster,far} from './clusterInteractions'
test.afterEach(async({request})=>stopOwnedSession(request))
const pose=(page:Page)=>page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
async function worldPoint(page:Page){
 const shell=await page.evaluate(()=>window.__ggjavaezQA!.shellRects()),safe=shell.safeFrame
 return{x:safe.x+safe.width*.55,y:safe.y+Math.min(safe.height,(shell.inspector?.y??Infinity)-safe.y)*.3}
}
for(const width of [1440,760])test(`native orbit returns to the actual Focus centre after auxiliary travel ${width}x900`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:900})
 const errors=browserErrors(page);await runFixture(page,request,'dense');await home(page);await far(page)
 await clickCluster(page)
 await page.getByRole('complementary',{name:'Selection inspector'}).getByRole('list',{name:'Cluster members'}).getByRole('button').first().click()
 await ready(page);const original=await pose(page)
 await page.locator('.world-canvas').focus();await page.keyboard.press('Enter');await ready(page)
 const focus=await page.evaluate(()=>window.__ggjavaezQA!.focusTarget());expect(focus?.kind).toBe('frame')
 const anchor=await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id!].anchor.position,focus?.targetId)
 const facts=()=>page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,anchors:Object.fromEntries(Object.entries(window.__ggjavaezWorld!.scene().entities).map(([id,node])=>[id,node.anchor])),focus:window.__ggjavaezQA!.focusTarget(),overlays:window.__ggjavaezQA!.appState().overlays}))
 const before=await facts();await far(page);await clickCluster(page,true,'heap');await ready(page)
 const auxiliary=await pose(page);expect(auxiliary.target).not.toEqual(anchor);expect(await facts()).toEqual(before)
 // A plain native selection click must preserve the auxiliary camera pose.
 let point=await worldPoint(page);await page.mouse.click(point.x,point.y);await ready(page)
 expect(await pose(page)).toEqual(auxiliary);expect(await facts()).toEqual(before)
 await page.locator('.world-canvas').focus();await page.keyboard.press('ArrowRight');await ready(page)
 let actual=await pose(page)
 for(let axis=0;axis<3;axis++)expect(actual.target[axis]).toBeCloseTo(anchor[axis],6)
 expect(actual.position).not.toEqual(auxiliary.position);expect(await facts()).toEqual(before)
 await page.keyboard.press('Shift+ArrowRight');await ready(page)
 const panned=await pose(page);expect(panned.target).not.toEqual(anchor)
 point=await worldPoint(page);await page.mouse.click(point.x,point.y);await ready(page);expect(await pose(page)).toEqual(panned)
 // Capture runs before OrbitControls receives an actual primary drag; a
 // secondary pan or a pointer-down alone must not change the orbit anchor.
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+35,point.y+8,{steps:5});await page.mouse.up();await ready(page)
 actual=await pose(page)
 for(let axis=0;axis<3;axis++)expect(actual.target[axis]).toBeCloseTo(anchor[axis],6)
 expect(await facts()).toEqual(before)
 const inspector=page.getByRole('complementary',{name:'Selection inspector'})
 await inspector.getByRole('button',{name:'Close inspector',exact:true}).focus();await page.keyboard.press('Escape')
 await expect(inspector).toHaveCount(0);await ready(page);expect(await pose(page)).toEqual(actual);expect(await facts()).toEqual(before)
 await page.locator('.world-canvas').focus();await page.keyboard.press('Alt+Shift+I')
 await expect(inspector).toBeVisible();await ready(page);expect(await pose(page)).toEqual(actual)
 await page.locator('.world-canvas').focus();await page.keyboard.press('Escape');await ready(page)
 const restored=await pose(page)
 for(const key of ['position','target'] as const)for(let axis=0;axis<3;axis++)expect(restored[key][axis]).toBeCloseTo(original[key][axis],5)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toBeNull();expect(errors).toEqual([])
})
