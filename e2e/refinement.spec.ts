import {expect,test,type Page} from '@playwright/test'
import {browserErrors,follow,home,ready,seekCursor,selectEntity} from './reference/harness'

const finalCursor=21,personId='object:person:17'
const rail=(page:Page)=>page.getByRole('slider',{name:'Recorded execution position'})
const inspector=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector'})
const play=(page:Page)=>page.getByRole('button',{name:'Play recorded execution',exact:true})
const pause=(page:Page)=>page.getByRole('button',{name:'Pause playback',exact:true})
const caption=(page:Page)=>page.locator('.gg-time-event')
async function open(page:Page){
 await page.goto('/examples?qa=1')
 await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function');await ready(page)
 await expect(rail(page)).toHaveAttribute('aria-valuemax',String(finalCursor));await expectCursor(page,0)
}
async function expectCursor(page:Page,cursor:number){
 await expect(rail(page)).toHaveAttribute('aria-valuenow',String(cursor))
 await expect(page.locator('.gg-time-caption>strong')).toHaveText(`${cursor} / ${finalCursor}`)
}
async function selectedPerson(page:Page){
 await expectCursor(page,18)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'object',id:personId})
 await expect(inspector(page).locator('.inspector-heading')).toContainText('Person #17')
 await expect(inspector(page).getByRole('button',{name:'Inspect age',exact:true})).toHaveText('18')
}
async function replay(page:Page){
 await page.locator('summary[aria-label="Timeline settings"]').click()
 await page.getByRole('button',{name:'Replay from before execution',exact:true}).click()
}
const facts=(page:Page)=>page.evaluate(()=>{const {revision,...scene}=window.__ggjavaezWorld!.scene();void revision;return{scene,selection:window.__ggjavaezQA!.selection(),source:window.__ggjavaezQA!.source()?.target}})

test('4× playback naturally completes, stays final, and explicitly replays deterministically',async({page})=>{
 const errors=browserErrors(page);await open(page)
 await page.getByLabel('Playback speed',{exact:true}).filter({visible:true}).selectOption('4')
 await play(page).click();await expect(pause(page)).toBeVisible()
 // All 21 real timers must run; no seeks, virtual clocks or timer acceleration.
 await expect(play(page)).toHaveAttribute('aria-disabled','true',{timeout:6000})
 await expectCursor(page,finalCursor);await ready(page)
 await expect(page.getByRole('button',{name:'Next Event',exact:true})).toHaveAttribute('aria-disabled','true')
 const finalEvent=await caption(page).innerText(),finalScene=(await facts(page)).scene
 await page.waitForTimeout(1000);await expectCursor(page,finalCursor)
 await expect(caption(page)).toHaveText(finalEvent)
 await play(page).focus();await page.keyboard.press('Enter');await expectCursor(page,finalCursor)
 await page.getByRole('button',{name:'Previous Event',exact:true}).click();await expectCursor(page,20)
 await expect(play(page)).toHaveAttribute('aria-disabled','false')
 await page.getByRole('button',{name:'Next Event',exact:true}).click();await expectCursor(page,finalCursor)
 await replay(page);await expectCursor(page,0);await expect(pause(page)).toBeVisible()
 await expect(play(page)).toHaveAttribute('aria-disabled','true',{timeout:6000})
 await expectCursor(page,finalCursor);await ready(page)
 await expect(caption(page)).toHaveText(finalEvent)
 expect((await facts(page)).scene).toEqual(finalScene);expect(errors).toEqual([])
})

test('first and last seeks pause playback and reconstruct the same final Person state',async({page})=>{
 const errors=browserErrors(page);await open(page)
 await play(page).click();await seekCursor(page,finalCursor)
 await expect(pause(page)).toHaveCount(0);await expect(play(page)).toHaveAttribute('aria-disabled','true')
 await home(page);await selectEntity(page,personId)
 await expect(inspector(page).getByRole('button',{name:'Inspect age',exact:true})).toHaveText('18')
 const finalEvent=await caption(page).innerText(),finalScene=(await facts(page)).scene
 for(let cycle=0;cycle<2;cycle++){
  await seekCursor(page,0)
  await expect(page.getByRole('button',{name:'Previous Event',exact:true})).toHaveAttribute('aria-disabled','true')
  await expect(play(page)).toHaveAttribute('aria-disabled','false')
  await expect(inspector(page)).toContainText('Not present at this point in time')
  await expect(inspector(page).getByRole('button',{name:'Focus selection',exact:true})).toHaveAttribute('aria-disabled','true')
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(personId)
  await seekCursor(page,finalCursor)
  await expect(page.getByRole('button',{name:'Next Event',exact:true})).toHaveAttribute('aria-disabled','true')
  await expect(inspector(page).locator('.inspector-heading')).toContainText('Person #17')
  await expect(inspector(page).getByRole('button',{name:'Inspect age',exact:true})).toHaveText('18')
  await expect(caption(page)).toHaveText(finalEvent)
  expect((await facts(page)).scene).toEqual(finalScene)
 }
 expect(errors).toEqual([])
})

test('Explore and Home preserve cursor, mutation, recorded source, and selected Person identity',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,18);await home(page);await selectEntity(page,personId)
 await selectedPerson(page)
 const before=await facts(page),execution=await caption(page).innerText()
 expect(before.source?.line).toBe(10)
 await expect(page.locator('.monaco-editor .executing-line')).toBeVisible()
 const homePoses=[]
 for(const mode of ['Explore','Home','Explore','Home']){
  await page.getByRole('button',{name:mode,exact:true}).click();await ready(page)
  // Home is a framing action that settles in Explore, not a persistent mode.
  await expect(page.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true')
  if(mode==='Home')homePoses.push(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose()))
  await selectedPerson(page);expect(await facts(page)).toEqual(before)
  await expect(caption(page)).toHaveText(execution)
 }
 expect(homePoses[1]).toEqual(homePoses[0])
 for(const retired of ['Classic','Spatial'])await expect(page.getByRole('button',{name:retired,exact:true})).toHaveCount(0)
 expect(errors).toEqual([])
})

test('Follow and manual exploration retain shared state independently of world navigation',async({page})=>{
 const errors=browserErrors(page);await page.emulateMedia({reducedMotion:'reduce'});await open(page)
 await seekCursor(page,18);await home(page);await selectEntity(page,personId)
 const before=await facts(page)
 for(let cycle=0;cycle<2;cycle++){
  await follow(page);await selectedPerson(page)
  await page.locator('.world-canvas').focus();await page.keyboard.press('+');await ready(page)
  const manual=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
  await seekCursor(page,17);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(manual)
  await seekCursor(page,18);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(manual)
  await selectedPerson(page);expect(await facts(page)).toEqual(before)
  await follow(page);await seekCursor(page,17)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(manual)
  await seekCursor(page,18);await selectedPerson(page);expect(await facts(page)).toEqual(before)
 }
 expect(errors).toEqual([])
})
