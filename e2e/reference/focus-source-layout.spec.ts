import {expect,test} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import design from '../../docs/visual-java-spec/DESIGN_TOKENS.json' with {type:'json'}
import {openDock} from './dockActions'
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
 expect(first.inspector!.y+first.inspector!.height).toBeLessThan(first.timeDock!.y)
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

test('760x900 keeps one usable timeline, the focused Inspector and the Source rail',async({page})=>{
 const errors=browserErrors(page)
 const viewport={width:760,height:900}
 await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/examples?qa=1');await seekCursor(page,18);await home(page);await selectEntity(page,'object:person:17')
 const card=page.getByRole('complementary',{name:'Selection inspector'})
 const timeline=page.getByRole('region',{name:'Execution timeline',exact:true})
 const rail=timeline.getByRole('slider',{name:'Recorded execution position',exact:true})
 const sourceRail=page.getByRole('button',{name:'Show source drawer',exact:true})
 await card.getByRole('button',{name:'Focus selection',exact:true}).click();await ready(page)
 const {frame,pose,anchor}=await page.evaluate(()=>({
  frame:window.__ggjavaezQA!.shellRects().commandFrame,pose:window.__ggjavaezQA!.cameraPose(),
  anchor:window.__ggjavaezWorld!.scene().entities['object:person:17'].anchor,
 }))
 const sheet=(await card.boundingBox())!,dock=(await timeline.boundingBox())!
 expect(frame.y+frame.height).toBeCloseTo(sheet.y,0)
 expect(sheet.y+sheet.height).toBeLessThan(dock.y)
 const camera=new PerspectiveCamera(design.camera.fov,viewport.width/viewport.height,.05,10000)
 camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.updateMatrixWorld()
 const projectedY=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>{
  const corner=new Vector3(x,y,z).multiply(new Vector3(...anchor.size)).multiplyScalar(.5).add(new Vector3(...anchor.position))
  return (1-corner.project(camera).y)*viewport.height/2
 })))
 expect(Math.min(...projectedY)).toBeGreaterThanOrEqual(frame.y)
 expect(Math.max(...projectedY)).toBeLessThan(sheet.y)
 await expect(timeline).toHaveCount(1)
 await expect(rail).toHaveCount(1)
 await expect(rail).toHaveAttribute('aria-valuetext',/age/)
 const rows=card.getByRole('list',{name:'Recorded values',exact:true})
 expect((await rows.boundingBox())!.height).toBeGreaterThanOrEqual(104)
 const value=card.getByRole('button',{name:'Inspect age',exact:true})
 await expect(value).toHaveText('18')
 await expect(value).toBeInViewport({ratio:1})
 await value.click({trial:true})
 await card.getByRole('button',{name:'Return to World',exact:true}).click({trial:true})
 await sourceRail.click({trial:true})
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/focus-source-layout-760x900.png'})

 await timeline.getByRole('button',{name:'Play recorded execution',exact:true}).click({trial:true})
 await timeline.getByRole('button',{name:'Previous Event',exact:true}).click()
 await expect(rail).toHaveAttribute('aria-valuenow','17')
 await timeline.getByRole('button',{name:'Next Event',exact:true}).click()
 await expect(rail).toHaveAttribute('aria-valuenow','18')
 const head=Number(await rail.getAttribute('aria-valuemax'))
 const track=(await rail.boundingBox())!
 await page.mouse.click(track.x+track.width*(19/head),track.y+track.height/2)
 await expect(rail).toHaveAttribute('aria-valuenow','19')
 await timeline.getByRole('button',{name:'Return to Live',exact:true}).click()
 await expect(timeline).toHaveAttribute('data-lens','LIVE')
 await expect(rail).toHaveAttribute('aria-valuenow',String(head))
 await expect(card).toBeVisible()

 await openDock(page,'Console')
 const consolePane=page.getByLabel('Program console',{exact:true})
 await consolePane.click({trial:true})
 await timeline.getByRole('button',{name:'Previous Event',exact:true}).click({trial:true})
 await page.getByRole('navigation',{name:'Dock',exact:true}).getByRole('button',{name:'Console',exact:true}).click()
 await value.click({trial:true})
 await sourceRail.click()
 await expect(page.locator('.monaco-editor')).toBeVisible()
 await expect.poll(async()=>{
  const source=(await page.locator('.ide-editor-panel').boundingBox())!
  return source.y+source.height
 }).toBeLessThan(sheet.y)
 await card.getByRole('button',{name:'Return to World',exact:true}).click({trial:true})
 await timeline.getByRole('button',{name:'Previous Event',exact:true}).click({trial:true})
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/focus-source-layout-open-760x900.png'})
 await page.getByRole('button',{name:/^(Collapse source|Close source drawer)$/}).click()
 await expect(sourceRail).toBeVisible()
 await expect(page.locator('.monaco-editor')).toBeAttached()
 await expect(page.locator('.monaco-editor')).toBeHidden()
 expect(errors).toEqual([])
})
