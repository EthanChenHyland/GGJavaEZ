import {expect,test} from '@playwright/test'
import {browserErrors,home,ready,seekCursor,selectEntity} from './harness'
test('Inspector opens opposite the actual item, stays put through orbit and reconsiders only on reopen',async({page})=>{
 const errors=browserErrors(page);await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/examples?qa=1');await seekCursor(page,18);await home(page)
 const id='object:person:17',before=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 await selectEntity(page,id)
 const card=page.getByRole('complementary',{name:'Selection inspector'})
 const left=(await card.boundingBox())!
 expect(left.x+left.width).toBeLessThan(720)
 expect((await page.evaluate(id=>window.__ggjavaezQA!.projectedPoint(id),id))!.x).toBeGreaterThan(720)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(before)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/inspector-opposite-side-native.png'})
 const safe=await page.evaluate(()=>window.__ggjavaezQA!.shellRects().safeFrame),x=safe.x+safe.width*.45,y=safe.y+safe.height*.5
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+300,y,{steps:14});await page.mouse.up();await ready(page)
 expect((await page.evaluate(id=>window.__ggjavaezQA!.projectedPoint(id),id))!.x).toBeLessThan(648)
 expect((await card.boundingBox())!.x).toBe(left.x)
 const moved=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 await card.getByRole('button',{name:'Close inspector',exact:true}).click();await expect(card).toHaveCount(0)
 await page.locator('.world-canvas').focus();await page.keyboard.press('Alt+Shift+I');await ready(page)
 expect((await card.boundingBox())!.x).toBeGreaterThan(720)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(moved)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'object',id})
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cursor().cursor)).toBe(18)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/inspector-reopen-native.png'})
 expect(errors).toEqual([])
})
