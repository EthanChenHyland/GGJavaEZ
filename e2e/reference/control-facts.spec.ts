import {expect,test,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import type {TraceDocument,TraceEvent} from '../../src/contracts/runtime'
import {valueText} from '../../src/world/valueText'
import {browserErrors,follow,home,ready,seekCursor,selectEntity} from './harness'
const trace:TraceDocument=JSON.parse(readFileSync('src/examples/demos/control/trace.json','utf8'))
const conditions=trace.events.filter((event):event is Extract<TraceEvent,{type:'EVALUATE_CONDITION'}>=>event.type==='EVALUATE_CONDITION')
const iterations=trace.events.filter((event):event is Extract<TraceEvent,{type:'LOOP_ITERATION'}>=>event.type==='LOOP_ITERATION')
const facts=(page:Page)=>page.getByRole('region',{name:'Recorded control flow',exact:true})
const rail=(page:Page)=>page.getByRole('slider',{name:'Recorded execution position'})
async function selected(page:Page,frameId:string){await home(page);await selectEntity(page,frameId);await expect(facts(page)).toBeVisible()}
async function source(page:Page,event:TraceEvent){
 if(!event.source)throw new Error('Captured condition requires source')
 const line=trace.sourceFiles.find(file=>file.fileId===event.source!.fileId)?.content.split(/\r?\n/)[event.source.line-1].trim()
 expect(line).toBeTruthy()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.target?.line)).toBe(event.source.line)
 await expect(page.locator('.monaco-editor .view-line').filter({hasText:line!}).first()).toBeVisible()
}
async function condition(page:Page,event:typeof conditions[number]){
 const fact=facts(page).locator('[data-condition-id]')
 await expect(fact).toHaveAttribute('data-condition-id',event.conditionId)
 await expect(fact.locator('code')).toHaveText(event.expression)
 await expect(fact.locator('strong')).toHaveText(`${valueText(event.operands[0].value,{context:'exact'}).exact} ${event.operator} ${valueText(event.operands[1].value,{context:'exact'}).exact} → ${event.result}`)
 await expect(fact.locator('.branch-path')).toHaveText(`${event.takenLabel} · skipped: ${event.skippedLabel}`)
 for(const operand of event.operands)await expect(fact).toContainText(`${operand.label}: ${valueText(operand.value,{context:'exact'}).exact}`)
}
// Exact successor of the original control browser condition/iteration corpus.
// The shared status now lives in the selected invocation's current Inspector.
test('recorded operands, taken and skipped paths, iteration and source survive guidance changes',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const errors=browserErrors(page)
 await page.goto('/examples?qa=1');await page.getByRole('combobox',{name:'Runtime example'}).selectOption('control')
 await expect(rail(page)).toHaveAttribute('aria-valuenow','0');await ready(page)
 expect(conditions.some(event=>event.result)).toBe(true);expect(conditions.some(event=>!event.result)).toBe(true)
 for(const event of conditions){
  await seekCursor(page,event.seq+1);await selected(page,event.frameId)
  await condition(page,event);await source(page,event)
  if(event===conditions[1])await page.screenshot({path:'.ggjavaez/qa/reference-exact/control-branch-facts-native.png'})
  const loop=iterations.filter(loop=>loop.seq<=event.seq).at(-1)
  if(loop){
   if(loop.frameId!==event.frameId)await selected(page,loop.frameId)
   await expect(facts(page).locator('[data-loop-iteration]')).toHaveAttribute('data-loop-iteration',String(loop.iteration))
   if(loop.frameId!==event.frameId){await selected(page,event.frameId);await condition(page,event)}
  }
  await follow(page);await condition(page,event);await source(page,event)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(event.seq+1))
  await page.locator('.world-canvas').focus();await page.keyboard.press('+');await ready(page)
  await expect(page.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true')
  await condition(page,event);await source(page,event)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(event.seq+1))
 }
 for(const event of [...iterations,...iterations.slice().reverse()]){
  await seekCursor(page,event.seq+1);await selected(page,event.frameId)
  const loop=facts(page).locator('[data-loop-iteration]')
  await expect(loop).toHaveAttribute('data-loop-iteration',String(event.iteration))
  await expect(loop.locator('strong')).toHaveText(event.status==='ended'?`Loop ended · ${event.iteration} iterations`:`Iteration ${event.iteration}`)
 }
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/control-facts-native.png'})
 expect(errors).toEqual([])
})
