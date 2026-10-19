import {expect,test} from '@playwright/test'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import {seek} from '../../src/runtime'
import {committedExceptionCursor} from '../../src/debugger/exceptionCursor'
import {browserErrors,ready,runFixture,stopOwnedSession} from './harness'
test.afterEach(async({request})=>stopOwnedSession(request))
for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`Error Explorer keeps captured source, stack and responsive sections ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport);const errors=browserErrors(page)
 const session=await runFixture(page,request,'exception'),trace=normalizeTrace(session.rawEvents,session.sourceManifest,{status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic}).trace
 const index=trace.events.findIndex(event=>event.type==='THROW_EXCEPTION'),event=trace.events[index]
 if(event.type!=='THROW_EXCEPTION')throw new Error('Actual JVM supplied no throw')
 const cursor=committedExceptionCursor(trace,index),state=seek(trace,cursor),failure=state.exceptions.find(item=>item.eventId===event.eventId)!
 const before=await page.evaluate(()=>({prefix:window.__ggjavaezQA!.cursor(),recordingId:window.__ggjavaezWorld!.scene().recordingId,anchors:Object.values(window.__ggjavaezWorld!.scene().entities).map(node=>node.anchor)}))
 await page.getByRole('button',{name:'ERROR EXPLORER',exact:true}).click();await ready(page)
 const drawer=page.getByRole('region',{name:'Error Explorer',exact:true})
 await expect(drawer).toBeVisible();expect(await drawer.evaluate(node=>getComputedStyle(node).display)).toBe('grid')
 expect(await drawer.evaluate(node=>node.scrollWidth)).toBeLessThanOrEqual(await drawer.evaluate(node=>node.clientWidth))
 expect(await page.evaluate(()=>({prefix:window.__ggjavaezQA!.cursor(),recordingId:window.__ggjavaezWorld!.scene().recordingId,anchors:Object.values(window.__ggjavaezWorld!.scene().entities).map(node=>node.anchor)}))).toEqual(before)
 await expect(drawer.getByRole('heading',{name:event.className.split('.').at(-1),exact:true})).toBeVisible()
 await expect(drawer.locator('.debug-source')).toContainText(`${event.source!.fileId}:${event.source!.line}`)
 await drawer.getByText('Actual JVM stderr / stack trace',{exact:true}).click();await expect(drawer.locator('.error-summary pre')).toHaveText(session.stderr)
 if(viewport.width<1024)await drawer.getByRole('button',{name:'Stack & path',exact:true}).click()
 await expect(drawer.locator('.error-stack')).toBeVisible()
 await expect(drawer.locator('.error-stack details summary button')).toHaveText(failure.frameIds.slice().reverse().map(id=>`${state.frames[id].className}.${state.frames[id].methodName}()`))
 await drawer.locator('.exception-path button').filter({hasText:/^Throw/}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.cursor().cursor)).toBe(cursor)
 await expect(drawer.locator('.exception-path button').filter({hasText:/^Throw/})).toHaveAttribute('aria-current','step')
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/error-drawer-captured-${viewport.width}.png`})
 if(viewport.width<1024){
  await drawer.getByRole('button',{name:'Cause',exact:true}).click();await expect(drawer.locator('.error-causes')).toBeVisible();await expect(drawer.locator('.error-stack')).toBeHidden()
  await drawer.getByRole('button',{name:'Failure',exact:true}).click();await expect(drawer.locator('.error-summary')).toBeVisible();await expect(drawer.locator('.error-causes')).toBeHidden()
 }
 expect(errors).toEqual([])
})
