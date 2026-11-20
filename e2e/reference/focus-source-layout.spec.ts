import {expect,test} from '@playwright/test'
import {browserErrors,home,ready,seekCursor,selectEntity} from './harness'
for(const viewport of [{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:1440,height:650}])test(`Focus leaves Source and its opposite Inspector reachable ${viewport.width}x${viewport.height}`,async({page})=>{
 const errors=browserErrors(page);await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/examples?qa=1');await seekCursor(page,18);await home(page);await selectEntity(page,'object:person:17')
 const card=page.getByRole('complementary',{name:'Selection inspector'}),before=await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),selection:window.__ggjavaezQA!.selection(),anchors:Object.fromEntries(Object.entries(window.__ggjavaezWorld!.scene().entities).map(([id,node])=>[id,node.anchor]))}))
 await card.getByRole('button',{name:'Focus selection',exact:true}).click();await ready(page)
 await expect.poll(()=>page.evaluate(()=>{const {source,inspector}=window.__ggjavaezQA!.shellRects();return !!source&&!!inspector&&source.x+source.width<=inspector.x+1&&inspector.x+inspector.width<=innerWidth/2+1})).toBe(true)
 const first=await page.evaluate(()=>window.__ggjavaezQA!.shellRects())
 expect(first.source!.width).toBeCloseTo(.22*viewport.width,0)
 expect(first.inspector!.width).toBeCloseTo(Math.max(.2*viewport.width,300),0)
 expect(first.safeFrame.x).toBeGreaterThanOrEqual(first.inspector!.x+first.inspector!.width)
 await expect(card.getByRole('button',{name:'Return to World',exact:true})).toBeVisible()
 // Expand Source cannot override its required Focus dimensions.
 await page.getByRole('button',{name:'Expand source for editing',exact:true}).click();await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.shellRects().source)).toEqual(first.source)
 const source=await page.evaluate(()=>window.__ggjavaezQA!.source());expect(source).not.toBeNull();expect(source!.target?.mark).toBe('focus')
 expect(source!.target?.line).toBeGreaterThanOrEqual(source!.first);expect(source!.target?.line).toBeLessThanOrEqual(source!.last)
 expect(await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),selection:window.__ggjavaezQA!.selection(),anchors:Object.fromEntries(Object.entries(window.__ggjavaezWorld!.scene().entities).map(([id,node])=>[id,node.anchor]))}))).toEqual(before)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/focus-source-layout-${viewport.width}x${viewport.height}.png`})
 const stable=await card.boundingBox();await page.locator('.world-canvas').focus();await page.keyboard.press('ArrowRight');await ready(page)
 expect(await card.boundingBox()).toEqual(stable);expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toEqual({kind:'object',targetId:'object:person:17'})
 expect(errors).toEqual([])
})
