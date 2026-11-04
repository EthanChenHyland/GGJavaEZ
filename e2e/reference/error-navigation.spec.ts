import {expect,test,type Page} from '@playwright/test'
import {browserErrors,ready,runFixture,seekCursor,stopOwnedSession} from './harness'
import {openDock} from './dockActions'

test.describe.configure({timeout:90000})
test.afterEach(async({request})=>stopOwnedSession(request))
async function boundary(page:Page){
 return page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,
  liveHead:window.__ggjavaezWorld!.scene().liveHead,selection:window.__ggjavaezQA!.selection(),focus:window.__ggjavaezQA!.focusTarget(),
  pose:window.__ggjavaezQA!.cameraPose(),overlays:window.__ggjavaezQA!.appState().overlays}))
}
for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`error source and frame actions preserve time; recorded-event actions preserve selection ${viewport.width}x${viewport.height}`,async({page,request},info)=>{
 await page.setViewportSize(viewport);const errors=browserErrors(page),session=await runFixture(page,request,'exception')
 await openDock(page,'Errors');await ready(page)
 const panel=page.getByRole('region',{name:'Error Explorer',exact:true}),before=await boundary(page)
 const origin=await page.evaluate(()=>window.__ggjavaezWorld!.scene().exception!.throwFrameId)
 expect(origin).toBeTruthy();expect(before.selection).toBeNull()
 await panel.locator('.debug-source').click();await ready(page)
 expect(await boundary(page),'Reveal Source must not seek, select, Focus or move the camera').toEqual(before)
 await expect(page.locator('.gg-source-reveal-line')).toBeVisible()
 await expect(page.locator('.ide-editor-panel')).toContainText('Recorded source')
 const stackTab=panel.getByRole('button',{name:'Stack & path',exact:true});if(await stackTab.isVisible())await stackTab.click()
 await panel.locator('.error-stack details summary button').first().click();await ready(page)
 const selected=await boundary(page)
 expect(selected.selection).toEqual({kind:'frame',id:origin})
 expect({...selected,selection:null}).toEqual(before)
 const failureTab=panel.getByRole('button',{name:'Failure',exact:true});if(await failureTab.isVisible())await failureTab.click()
 await panel.getByRole('button',{name:'Return to failure',exact:true}).click();await ready(page)
 const sought=await boundary(page)
 expect(sought.cursor).toBeLessThan(before.cursor);expect(sought.selection).toEqual(selected.selection)
 expect(sought.recording).toBe(before.recording);expect(sought.pose).toEqual(before.pose);expect(sought.focus).toEqual(before.focus)
 if(await stackTab.isVisible())await stackTab.click()
 await panel.locator('.exception-navigation button').filter({hasText:/^Go to recorded Unwind/}).last().click();await ready(page)
 const unwound=await boundary(page)
 expect(unwound.cursor).toBeGreaterThan(sought.cursor);expect(unwound.selection).toEqual(selected.selection)
 expect(unwound.pose).toEqual(before.pose);expect(unwound.focus).toEqual(before.focus)
 const lastUnwound=await page.evaluate(()=>window.__ggjavaezWorld!.scene().exception!.unwound.at(-1))
 expect(lastUnwound).toBeTruthy();expect(lastUnwound).not.toBe(origin)
 expect((await (await request.get('/api/execution/current')).json()).id).toBe(session.id)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/error-navigation-${viewport.width}x${viewport.height}.png`})
 await seekCursor(page,0)
 const absent=await boundary(page)
 // Before the throw, no future stack/source/seek target may be presented. The
 // missing-current-frame action guard is covered independently by
 // ErrorExplorer's unavailable-frame presentation unit; frame/source actions
 // above retain their native selection/time/camera boundaries.
 await expect(panel).toContainText('No exception has been observed at this Event')
 await expect(panel.locator('.error-stack details summary button')).toHaveCount(0)
 await expect(panel.locator('.debug-source')).toHaveCount(0)
 await expect(panel.locator('.exception-path button')).toHaveCount(0)
 await expect(panel.getByRole('button',{name:'Return to failure',exact:true})).toHaveCount(0)
 await expect(panel.locator('h2')).toHaveCount(0)
 await expect(panel).not.toContainText('failed shipment')
 expect(await page.evaluate(id=>!!window.__ggjavaezWorld!.scene().entities[id!],origin)).toBe(false)
 expect(await boundary(page)).toEqual(absent)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/error-navigation-absent-frame-${viewport.width}x${viewport.height}.png`})
 await info.attach('error-navigation-boundaries',{body:JSON.stringify({sessionId:session.id,before,selected,sought,unwound,absent}),contentType:'application/json'})
 expect(errors).toEqual([])
})
