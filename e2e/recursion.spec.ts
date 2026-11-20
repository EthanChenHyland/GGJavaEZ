import {selectRecording} from './reference/menuActions'
import {expect,test,type Page} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {ready,seekCursor,selectEntity,home,follow,focusSelection} from './reference/harness'

const cursor=(page:Page)=>page.getByRole('slider',{name:'Recorded execution position',exact:true})
const inspector=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector',exact:true})
const invocation=(page:Page)=>inspector(page).getByRole('region',{name:'Recorded invocation details',exact:true})
async function recursion(page:Page){
 await page.goto('/examples?qa=1');await selectRecording(page,'recursion');await ready(page)
 await expect(cursor(page)).toHaveValue('0');await expect(cursor(page)).toHaveAttribute('max','36')
 await expect(page.getByRole('region',{name:'Execution timeline'})).toContainText('0 / 36')
}
async function selectFrame(page:Page,id:string){
 await home(page)
 for(let attempt=0;attempt<16;attempt++){
  if(await page.getByRole('listbox',{name:'Runtime entities'}).locator(`[id="world-entity-${encodeURIComponent(id)}"]`).count()){await selectEntity(page,id);return}
  await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
 }
 throw new Error(`Recorded invocation ${id} is outside the native World catalog`)
}
async function orbit(page:Page){
 await page.mouse.move(900,300);await page.mouse.down();await page.mouse.move(970,335,{steps:10});await page.mouse.up();await ready(page)
}
async function replay(page:Page){
 await page.locator('summary[aria-label="Timeline settings"]').click()
 await page.getByRole('button',{name:'Replay from before execution',exact:true}).click()
}
const anchors=(page:Page)=>page.evaluate(()=>Object.fromEntries(window.__ggjavaezWorld!.scene().order.frames.map(id=>[id,window.__ggjavaezWorld!.scene().entities[id].anchor.position])))
const returns=(page:Page)=>page.evaluate(()=>window.__ggjavaezWorld!.recordedEvents().filter(event=>event.type==='RETURN_VALUE'&&event.seq<window.__ggjavaezWorld!.scene().cursor).map(event=>event.type==='RETURN_VALUE'?{frameId:event.frameId,value:event.value,expression:event.expression}:null))
test.afterEach(async({page},info)=>{await mkdir('.ggjavaez/qa/reference-exact/recursion-successors',{recursive:true});await page.screenshot({path:`.ggjavaez/qa/reference-exact/recursion-successors/${info.title.replace(/[^a-zA-Z0-9]+/g,'-')}.png`})})

test('six invocations, operands, and return values stay synchronized through World navigation',async({page})=>{
 await recursion(page);await seekCursor(page,19);await selectFrame(page,'frame:factorial:3')
 await expect(inspector(page).locator('.inspector-heading strong')).toContainText('Main.factorial(int)')
 await expect(inspector(page).getByRole('button',{name:'Inspect n',exact:true})).toHaveText('3')
 const placed=await anchors(page)
 for(const action of[orbit,home,orbit,home]){
  await action(page);await expect(cursor(page)).toHaveValue('19')
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'frame',id:'frame:factorial:3'})
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().liveStack.length)).toBe(6)
  await expect(page.locator('.monaco-editor .gg-source-history-line')).toBeVisible()
  await expect(inspector(page).locator('.inspector-heading strong')).toContainText('Main.factorial(int)')
  expect(await anchors(page)).toEqual(placed)
 }
 expect(Object.keys(placed)).toHaveLength(6)
 await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page)
 expect(await returns(page)).toMatchObject([{frameId:'frame:factorial:1',value:{kind:'primitive',value:1},expression:'1'}])
 await selectFrame(page,'frame:factorial:1');await expect(invocation(page)).toContainText(/Return:\s*1\b/)
 await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page)
 expect(await anchors(page)).toEqual(placed)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().entities['frame:factorial:1'])).toMatchObject({kind:'frame',live:false})
 await seekCursor(page,19);expect(await anchors(page)).toEqual(placed);expect(await returns(page)).toEqual([])
 await seekCursor(page,26);await selectFrame(page,'frame:factorial:3')
 await expect(invocation(page)).toContainText('3 × 2')
 await expect(invocation(page)).toContainText(/Return:\s*6\b/)
 expect((await returns(page)).at(-1)).toMatchObject({frameId:'frame:factorial:3',value:{kind:'primitive',value:6},expression:'3 × 2'})
 // A captured return is inspected on its real invocation, never a fabricated
 // standalone return slot or an inferred execution-graph flow.
 await expect(invocation(page).getByText(/Return:/)).toBeVisible()
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'frame',id:'frame:factorial:3'})
})

test('recursion stops naturally, retains final result, and replays without looping',async({page})=>{
 await recursion(page);await page.getByRole('combobox',{name:'Playback speed',exact:true}).selectOption('4')
 await page.getByRole('button',{name:'Play recorded execution',exact:true}).click()
 await expect(page.getByRole('button',{name:'Pause playback',exact:true})).toBeVisible()
 await expect(cursor(page)).toHaveValue('36',{timeout:10000})
 await expect(page.getByRole('button',{name:'Next Event',exact:true})).toHaveAttribute('aria-disabled','true')
 const expected=[1,2,6,24,120]
 expect((await returns(page)).map(item=>item?.value)).toEqual(expected.map(value=>({kind:'primitive',javaType:'int',value})))
 for(const[index,value]of expected.entries()){
  await selectFrame(page,`frame:factorial:${index+1}`)
  await expect(invocation(page)).toContainText(new RegExp(`Return:\\s*${value}\\b`))
 }
 await selectFrame(page,'frame:recursion-main:1')
 await expect(inspector(page).getByRole('button',{name:'Inspect result',exact:true})).toHaveText('120')
 await page.waitForTimeout(600);await expect(cursor(page)).toHaveValue('36')
 await page.getByRole('button',{name:'Previous Event',exact:true}).click();await expect(cursor(page)).toHaveValue('35')
 await seekCursor(page,36);await replay(page);await expect(cursor(page)).toHaveValue('0')
 await page.getByRole('button',{name:'Pause playback',exact:true}).click();await seekCursor(page,0)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().liveStack.length)).toBe(0)
 await seekCursor(page,36);await selectFrame(page,'frame:factorial:5');await expect(invocation(page)).toContainText(/Return:\s*120\b/)
})

test('recursive free navigation overrides Follow while playback continues and Focus/Home recover',async({page})=>{
 await recursion(page);await seekCursor(page,14);await follow(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.navigationState().follow)).toBe(true)
 await page.getByRole('button',{name:'Play recorded execution',exact:true}).click();await orbit(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.navigationState().follow)).toBe(false)
 await expect(page.getByRole('button',{name:'Pause playback',exact:true})).toBeVisible()
 await expect.poll(async()=>Number(await cursor(page).inputValue())).toBeGreaterThan(14)
 await seekCursor(page,19);await selectFrame(page,'frame:factorial:3');await focusSelection(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe('frame:factorial:3')
 await page.locator('.world-canvas').focus();await page.keyboard.press('+');await ready(page);await home(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toBeNull()
 await expect(page.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true')
 await expect(cursor(page)).toHaveValue('19');await follow(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.navigationState().follow)).toBe(true)
})

test('returned invocation remains inspectable; example switching restores Person without stale source or selection',async({page})=>{
 await recursion(page);await seekCursor(page,19);await selectFrame(page,'frame:factorial:1');await seekCursor(page,21)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().entities['frame:factorial:1'])).toMatchObject({kind:'frame',live:false,status:{kind:'returning'}})
 await expect(invocation(page)).toContainText(/Return:\s*1\b/)
 await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page)
 await expect(inspector(page)).toContainText('returned');await expect(invocation(page)).toContainText(/Return:\s*1\b/)
 await page.setViewportSize({width:760,height:900});await page.getByRole('button',{name:'Close inspector',exact:true}).click()
 await expect(inspector(page)).toHaveCount(0);await page.setViewportSize({width:1440,height:900});await selectRecording(page,'person');await ready(page)
 await expect(cursor(page)).toHaveValue('0');await expect(inspector(page)).toHaveCount(0)
 await seekCursor(page,18);await home(page);await selectEntity(page,'object:person:17')
 await expect(inspector(page).locator('.inspector-heading strong')).toHaveText('Person #17')
 await expect(inspector(page).getByRole('button',{name:'Inspect age',exact:true})).toHaveText('18')
 await expect(page.locator('.monaco-editor')).toContainText('class Person')
})
