import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
const output='.ggjavaez/qa/v12-p5_5/motion'
test.use({video:{mode:'on',size:{width:1440,height:900}}})
test('accepted fresh Java history: allocation, constructor, mutation, recursion, output, exploration and completion motion',async({page,request})=>{
  test.skip(process.env.VJ_PHASE5_5_MOTION !== '1', 'Opt-in retained-session review; run immediately after the fresh torture fixtures')
  test.setTimeout(120000)
  const saved=JSON.parse(await readFile('.ggjavaez/qa/v12-p5_5/payloads/06-small-debug.json','utf8')) as ExecutionSession
  const endpoint=`/api/execution/${saved.id}`
  const response=await request.get(`${endpoint}?transport=delta`);expect(response.ok()).toBe(true)
  const retained=await response.json();expect(retained.id).toBe(saved.id);expect(retained.phase).toBe('COMPLETED')
  await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),saved.projectId)
  await page.route('**/api/execution/current?transport=delta',async route=>route.fulfill({response:await route.fetch({url:`http://127.0.0.1:5173${endpoint}?transport=delta`})}))
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto('/ide')
  const trace=normalizeTrace(saved.rawEvents,saved.sourceManifest,{status:saved.terminalStatus!,exitCode:saved.exitCode,diagnostic:saved.diagnostic,recording:saved.recording}).trace
  const slider=page.getByRole('slider',{name:'Scrub execution'}),picker=page.getByRole('combobox',{name:'Select runtime entity'})
  await expect(slider).toHaveAttribute('max',String(trace.events.length),{timeout:60000})
  const close=page.getByRole('button',{name:'Collapse bottom panel',exact:true});if(await close.count())await close.click()
  const points=[
    {label:'allocation',index:trace.events.findIndex(event=>event.type==='ALLOCATE_OBJECT'&&event.className.endsWith('$Cell'))},
    {label:'constructor',index:trace.events.findIndex(event=>event.type==='CREATE_REFERENCE'&&event.sourceSlot.kind==='frame'&&event.sourceSlot.slotId.endsWith(':this'))},
    {label:'deep-recursion',index:trace.events.findLastIndex(event=>event.type==='ENTER_METHOD'&&event.methodName==='descend')},
    {label:'mutation',index:trace.events.findIndex(event=>event.type==='SET_FIELD'&&event.value.kind==='primitive'&&event.value.value===18)},
    {label:'return',index:trace.events.findLastIndex(event=>event.type==='RETURN_VALUE')},
    {label:'stdout',index:trace.events.findIndex(event=>event.type==='EXECUTION_FACT'&&event.fact.kind==='io'&&event.fact.channel==='stdout')},
    {label:'complete',index:trace.events.length-1},
  ]
  // Constructor reference storage is schema-owned; derive from real slots if
  // its encoded ID differs, rather than guessing or fabricating a new event.
  if(points[1].index<0) points[1].index=trace.events.findIndex(event=>event.type==='ENTER_METHOD'&&event.methodName==='<init>')
  for(const point of points)expect(point.index,point.label).toBeGreaterThanOrEqual(0)
  await mkdir(output,{recursive:true})
  const samples=[]
  for(const point of points){
    await slider.fill(String(point.index+1));await page.getByRole('button',{name:'Overview',exact:true}).click();await page.waitForTimeout(650)
    const event=trace.events[point.index]
    const entity=event.type==='ALLOCATE_OBJECT'||event.type==='SET_FIELD'?event.objectId:event.type==='ENTER_METHOD'||event.type==='RETURN_VALUE'?event.frameId:undefined
    if(entity){await picker.selectOption(entity);await page.getByRole('complementary',{name:'Runtime inspector'}).getByRole('button',{name:'Focus',exact:true}).click();await page.waitForTimeout(650)}
    await page.screenshot({path:`${output}/${point.label}-1440x900.png`})
    samples.push({label:point.label,cursor:point.index+1,eventId:event.eventId,source:event.source,entity})
    const back=page.getByRole('button',{name:'Return to world',exact:true});if(await back.count())await back.click();await picker.selectOption('')
  }
  await slider.fill('1');await page.getByRole('combobox',{name:'Playback speed'}).selectOption('4')
  const follow=page.getByRole('button',{name:'Follow execution',exact:true})
  if(await follow.getAttribute('aria-pressed')!=='true')await follow.click()
  await page.getByRole('button',{name:'Replay recorded history',exact:true}).click()
  const box=(await page.locator('.spatial-view canvas').boundingBox())!
  await page.mouse.move(box.x+box.width*.35,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.35+80,box.y+box.height*.45+20,{steps:8});await page.mouse.up()
  await expect(page.getByRole('button',{name:'Follow execution',exact:true})).toHaveAttribute('aria-pressed','false')
  await expect(page.getByRole('button',{name:'Pause history replay',exact:true})).toBeVisible()
  await page.waitForTimeout(1200);await page.getByRole('button',{name:'Pause history replay',exact:true}).click()
  await page.getByRole('button',{name:/Return to Live/}).click();await expect(page.locator('.vj-timeline__count')).toContainText(`${trace.events.length} / ${trace.events.length}`)
  expect((await (await request.get(endpoint)).json()).id).toBe(saved.id);expect(errors).toEqual([])
  await writeFile(`${output}/motion-proof.json`,JSON.stringify({sessionId:saved.id,method:'Actual accepted terminal JVM trace; no new Java execution. Exact cursor stills plus recorded camera/replay motion, not GPU timing.',samples,errors},null,2)+'\n')
  const video=page.video()!;await page.close();await video.saveAs(`${output}/fresh-history.webm`)
})
