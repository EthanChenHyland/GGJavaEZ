import {expect,test,type APIRequestContext,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import type {ExecutionSession} from '../../src/execution/contracts'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import {currentSession,ready} from './harness'

const ownedSessions=new Set<string>()
const activePhases=['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED']
export async function stopTopologySession(request:APIRequestContext){
 const session=await currentSession(request)
 if(session&&ownedSessions.has(session.id)&&activePhases.includes(session.phase)){
  const stopped=await request.post(`/api/execution/${session.id}/stop`,{data:{}});expect(stopped.ok()).toBe(true)
 }
}

export async function runTopology(page:Page,request:APIRequestContext){
 const previous=await currentSession(request);expect(previous===null||!activePhases.includes(previous.phase),'Do not interrupt another active JVM').toBe(true)
 const source=readFileSync('fixtures/torture-v12-p5_5/02-arrays-cycles-collections/Topology.java','utf8')
 const imported=await request.post('/api/projects/import',{data:{name:`Topology evidence ${randomUUID()}`,files:[{path:'Topology.java',content:source}]}})
 expect(imported.ok()).toBe(true);const projectId=(await imported.json()).id as string
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),projectId)
 await page.goto('/?qa=1')
 await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function')
 await page.waitForFunction(id=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,projectId)
 const run=page.getByRole('button',{name:'Run',exact:true});await expect(run).toHaveAttribute('aria-disabled','false')
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${projectId}/execution`&&response.request().method()==='POST')
 await run.click();const response=await pending;expect(response.ok()).toBe(true)
 const started=await response.json() as ExecutionSession;ownedSessions.add(started.id)
 await expect.poll(async()=>{const current=await currentSession(request);return current?.id===started.id?current.phase:null},{timeout:45000}).toBe('COMPLETED')
 const session=(await currentSession(request))!
 expect(session.id).toBe(started.id);expect(session.build?.success).toBe(true);expect(session.exitCode).toBe(0)
 expect(session.recording?.state).toBe('FULL');expect(session.stdout).toBe('TOPOLOGY 73 100 1000 3 true\n')
 expect(session.rawEvents.length).toBeGreaterThan(0)
 const {trace}=normalizeTrace(session.rawEvents,session.sourceManifest,{status:'complete',exitCode:0,diagnostic:null},`execution:${session.id}`)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.appState().dimensions.view.recordingId)).toBe(`execution:${session.id}`)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.scene().liveHead)).toBe(trace.events.length)
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await slider.press('End')
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.scene().cursor)).toBe(trace.events.length)
 await ready(page)
 await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,normalizedEvents:trace.events.length}),contentType:'application/json'})
 return{session,trace}
}
