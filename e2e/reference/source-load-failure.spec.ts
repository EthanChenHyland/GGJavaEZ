import {expect,test,type Page} from '@playwright/test'
import {readFile,writeFile} from 'node:fs/promises'
import type {TraceDocument} from '../../src/contracts/runtime'
import {home,ready,seekCursor} from './harness'
import {selectRecording} from './menuActions'

async function settleSource(page:Page){
 await page.locator('.ide-editor-panel').evaluate(async node=>{await Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{})))})
}

// Inject only an editor asset failure. Runtime events and backend responses are
// never intercepted; the examples remain explicitly curated recordings.
for(const width of[1440,760])test(`recorded source asset failure preserves the World and captured text ${width}x900`,async({page})=>{
 await page.setViewportSize({width,height:900})
 const pageErrors:string[]=[],consoleErrors:string[]=[],failedAssets:string[]=[]
 page.on('pageerror',error=>pageErrors.push(error.message))
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
 await page.route(/\/src\/shell\/source\/RecordedSourceEditor\.tsx(?:\?|$)/,async route=>{failedAssets.push(route.request().url());await route.abort('failed')})
 const fixture=async(name:string)=>JSON.parse(await readFile(`src/examples/demos/${name}`,'utf8')) as TraceDocument
 const person=await fixture('person/person.trace.json'),arrays=await fixture('arrays/trace.json')
 try{
  await page.goto('/examples?qa=1')
  if(width<1024)await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
  const fallback=page.getByRole('region',{name:'Captured source fallback',exact:true})
  await expect(fallback.getByRole('alert')).toContainText('Source editor unavailable',{timeout:5000})
  expect(await fallback.getByLabel('Captured Java source',{exact:true}).textContent()).toBe(person.sourceFiles[0].content)
  await fallback.getByLabel('Captured Java source',{exact:true}).focus();await expect(fallback.getByLabel('Captured Java source',{exact:true})).toBeFocused()
  expect(failedAssets).toHaveLength(1)
  await settleSource(page)
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/source-load-fallback-person-${width}x900.png`})
  if(width<1024)await page.getByRole('button',{name:'Collapse source',exact:true}).click()
  await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();await expect(page.locator('.world-canvas canvas')).toHaveCount(1)
  await seekCursor(page,person.events.length);await home(page)
  const before=await page.evaluate(()=>({recordingId:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor}))
  expect(before.cursor).toBe(person.events.length)
  await selectRecording(page,'arrays');await ready(page)
  if(width<1024)await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
  await expect(fallback).toBeVisible()
  expect(await fallback.getByLabel('Captured Java source',{exact:true}).textContent()).toBe(arrays.sourceFiles[0].content)
  const after=await page.evaluate(()=>({recordingId:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor}))
  expect(after.recordingId).not.toBe(before.recordingId);expect(after.cursor).toBe(0)
  expect(failedAssets).toHaveLength(1)
  await settleSource(page)
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/source-load-fallback-array-${width}x900.png`})
  expect(pageErrors,'The source failure is caught inside the source pane').toEqual([])
  expect(consoleErrors.filter(message=>!message.includes('net::ERR_FAILED')&&!failedAssets.some(url=>message.includes(`Failed to fetch dynamically imported module: ${url}`))),'Only the deliberately failed source asset may produce a console error').toEqual([])
 }finally{
  const dom=page.isClosed()?null:await page.evaluate(()=>({shell:!!document.querySelector('.shell-header'),world:!!document.querySelector('.world-canvas canvas'),fallback:!!document.querySelector('[aria-label="Captured source fallback"]')})).catch(()=>null)
  await writeFile(`.ggjavaez/qa/reference-exact/source-load-fallback-${width}x900.json`,JSON.stringify({evidence:'Curated recording with a deliberately failed editor asset',failedAssets,pageErrors,consoleErrors,dom},null,2)+'\n')
  if(!page.isClosed())await page.screenshot({path:`.ggjavaez/qa/reference-exact/source-load-fallback-final-${width}x900.png`}).catch(()=>{})
 }
})
