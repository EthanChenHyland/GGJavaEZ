import {expect,test} from '@playwright/test'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import type {TraceDocument,TraceEvent} from '../src/contracts/runtime'
import {transitionsForTrace} from '../src/motion/semanticTransition'
import {browserErrors,ready,seekCursor} from './reference/harness'
import {selectRecording} from './reference/menuActions'

test('authored graphless I/O retains recorded endpoints and channel geometry in the shared 3D world', async ({page})=>{
 const errors=browserErrors(page)
 await page.goto('/examples?qa=1')
 await selectRecording(page,'control')
 await ready(page)
 await page.getByRole('button',{name:'Trace',exact:true}).click()
 await page.getByRole('group',{name:'Trace scope'}).getByRole('button',{name:'All',exact:true}).click()
 await ready(page)
 const trace=JSON.parse(await readFile('src/examples/demos/control/trace.json','utf8')) as TraceDocument
 const transitions=transitionsForTrace(trace)
 const canvas=page.locator('.world-canvas canvas').first(),mounted=await canvas.elementHandle()
 const output=process.env.VJ_QA_OUTPUT_ROOT??'.ggjavaez/qa/reference-exact/spatial-io-successor'
 await mkdir(output,{recursive:true})
 const observations=[]
 for(const kind of ['INPUT_READ','OUTPUT_WRITE'] as const){
  const event=trace.events.find((event):event is Extract<TraceEvent,{type:typeof kind}>=>event.type===kind)
  expect(event).toBeDefined()
  const {seq,eventId,frameId,text}=event!
  const channelId=event!.type==='INPUT_READ'?'stdin':'stdout'
  const slotId=event!.type==='INPUT_READ'?event!.destinationSlotId:event!.originSlotId
  expect(slotId).toBeTruthy()
  const transition=transitions.find(transition=>transition.seq===seq)
  const slot={kind:'slot',id:slotId},channel={kind:'io',id:channelId}
  expect(transition).toMatchObject({evidence:'observed',from:channelId==='stdin'?channel:slot,to:channelId==='stdin'?slot:channel})
  await seekCursor(page,seq)
  expect(await page.evaluate(eventId=>window.__ggjavaezWorld!.scene().io.some(io=>io.evidence.eventIds.includes(eventId)),eventId)).toBe(false)
  await seekCursor(page,seq+1)
  const current=await page.evaluate(({frameId,slotId,channelId})=>{
   const world=window.__ggjavaezWorld!,scene=world.scene(),plan=world.plan(),frame=scene.entities[frameId]
   return{cursor:scene.cursor,eventId:scene.cursorEvent?.id,channel:scene.io.find(io=>io.id===channelId),
    row:frame?.kind==='frame'?frame.rows.find(row=>row.slotId===slotId):undefined,
    planChannels:plan.io,recordedFlows:plan.flowPresentation.counts.recorded,flowCurves:plan.curves.filter(curve=>curve.kind==='flow')}
  },{frameId,slotId,channelId})
  expect(current.cursor).toBe(seq+1);expect(current.eventId).toBe(eventId)
  expect(current.channel?.evidence.eventIds).toContain(eventId);expect(current.channel?.preview).toBe(text.replace(/\n$/,''))
  expect(current.row?.slotId).toBe(slotId);expect(current.planChannels).toContainEqual({id:channelId,opacity:1})
  expect(current.recordedFlows).toBe(0);expect(current.flowCurves).toEqual([])
  await expect(canvas).toBeVisible()
  expect(await mounted!.evaluate(node=>node===document.querySelector('.world-canvas canvas'))).toBe(true)
  observations.push({kind,transition,current})
 }
 expect(errors).toEqual([])
 await page.screenshot({path:`${output}/curated-io-1440x900.png`})
 await writeFile(`${output}/curated-io-evidence.json`,JSON.stringify({observations,errors},null,2)+'\n')
})
