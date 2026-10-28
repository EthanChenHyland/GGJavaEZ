import {test,expect,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,currentSession,ready,runFixture,startFixture,stopOwnedSession} from './harness'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import manifest from '../../fixtures/reference-exact/manifest.json' with {type:'json'}

async function observeStreams(page:Page){
 await page.addInitScript(()=>{
  const NativeEventSource=window.EventSource
  const observed:EventSource[]=[]
  Object.defineProperty(window,'__nativeExecutionStreams',{value:observed})
  window.EventSource=class extends NativeEventSource{
   constructor(url:string|URL,options?:EventSourceInit){
    super(url,options)
    if(new URL(String(url),location.href).pathname.startsWith('/api/execution/')){
     observed.push(this)
     this.addEventListener('session',event=>{const data=JSON.parse((event as MessageEvent<string>).data);Reflect.set(this,'__observedSession',{phase:data.phase,terminalStatus:data.terminalStatus,rawEventCount:data.rawEventCount})})
    }
   }
  }
 })
}
async function streams(page:Page){return page.evaluate(()=>((window as unknown as {__nativeExecutionStreams:EventSource[]}).__nativeExecutionStreams).map(source=>({url:source.url,readyState:source.readyState,session:Reflect.get(source,'__observedSession') as {phase:string;terminalStatus:string|null;rawEventCount:number}|undefined})))}
let stopProject:string|null=null
test.afterEach(async({request})=>{
 if(stopProject){const session=await currentSession(request);if(session?.projectId===stopProject&&!['COMPLETED','FAILED','STOPPED'].includes(session.phase))await request.post(`/api/execution/${session.id}/stop`,{data:{}});stopProject=null}
 await stopOwnedSession(request)
})
for(const fixture of ['domain','dense'] as const)test(`a fully captured real JVM ${fixture} recording retires its event stream`,async({page,request})=>{
 test.setTimeout(90000);await observeStreams(page);const errors=browserErrors(page),session=await runFixture(page,request,fixture)
 if(fixture==='dense')expect(session.rawEvents.length,'Catch-up spans multiple bounded raw pages').toBeGreaterThan(1024)
 const observed=await streams(page);expect(observed.length).toBeGreaterThan(0)
 await writeFile(`.ggjavaez/qa/reference-exact/stream-terminal-${fixture}-native.json`,JSON.stringify({sessionId:session.id,rawEvents:session.rawEvents.length,phase:session.phase,recording:session.recording,observed,errors},null,2)+'\n')
 await expect.poll(async()=>(await streams(page)).every(source=>source.readyState===2),{timeout:5000}).toBe(true)
 expect(errors).toEqual([])
})
test('an input wait retains observation until real Java exits and its recorded prefix arrives',async({page,request})=>{
 test.setTimeout(90000);await observeStreams(page);const errors=browserErrors(page),started=await startFixture(page,request,'io')
 await expect.poll(async()=>{const session=await currentSession(request);return session?.id===started.id?session.phase:null},{timeout:30000}).toBe('WAITING_FOR_INPUT')
 await expect.poll(async()=>(await streams(page)).some(source=>source.readyState===1)).toBe(true)
 const waiting=await streams(page),response=await request.post(`/api/execution/${started.id}/input`,{data:{text:manifest.io.stdin}});expect(response.ok()).toBe(true)
 await expect.poll(async()=>{const session=await currentSession(request);return session?.id===started.id?session.phase:null},{timeout:45000}).toBe('COMPLETED')
 const session=(await currentSession(request))!;expect(session.stdout).toBe(manifest.io.stdout);expect(session.recording?.state).toBe('FULL');expect(session.exitCode).toBe(0)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.appState().dimensions.view.recordingId??null)).toBe(`execution:${session.id}`)
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await page.keyboard.press('End');await ready(page)
 await writeFile('.ggjavaez/qa/reference-exact/stream-input-native.json',JSON.stringify({sessionId:session.id,rawEvents:session.rawEvents.length,waiting,finished:await streams(page),stdout:session.stdout,recording:session.recording,errors},null,2)+'\n')
 await expect.poll(async()=>(await streams(page)).every(source=>source.readyState===2),{timeout:5000}).toBe(true)
 expect(errors).toEqual([])
})


test('a stop request still receives the shutdown recording before retiring observation',async({page,request})=>{
 test.setTimeout(90000);await observeStreams(page);const errors=browserErrors(page)
 const content='public class StopLate {static class Farewell extends Thread {public void run(){try{Thread.sleep(500);}catch(InterruptedException e){Thread.currentThread().interrupt();}for(int i=0;i<5;i++){System.out.println("LATE "+i);}}} public static void main(String[] args)throws Exception{Runtime.getRuntime().addShutdownHook(new Farewell());System.out.println("READY");System.in.read();}}\n'
 const response=await request.post('/api/projects/import',{data:{name:'Stop shutdown observation '+Date.now(),files:[{path:'StopLate.java',content}]}});expect(response.ok()).toBe(true);const project=(await response.json()).id as string;stopProject=project
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),project);await page.goto('/?qa=1');await page.waitForFunction(id=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,project);await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Run',exact:true}).click()
 await expect.poll(async()=>{const s=await currentSession(request);return s?.projectId===project?s.phase:null},{timeout:45000}).toBe('WAITING_FOR_INPUT')
 const waiting=(await currentSession(request))!;await ready(page)
 await page.getByRole('button',{name:'Stop',exact:true}).click()
 await expect.poll(async()=>(await streams(page)).some(source=>source.session?.phase==='STOPPED'&&source.session.terminalStatus===null),{timeout:5000}).toBe(true)
 const pendingStop=await streams(page);await writeFile('.ggjavaez/qa/reference-exact/stream-stop-pending-native.json',JSON.stringify({sessionId:waiting.id,pendingStop,errors},null,2)+'\n')
 expect(pendingStop.some(source=>source.readyState===1)).toBe(true)
 await expect.poll(async()=>{const s=await currentSession(request);return s?.id===waiting.id&&s.phase==='STOPPED'&&s.terminalStatus!==null},{timeout:30000}).toBe(true)
 const session=(await currentSession(request))!;expect(session.stdout).toContain('LATE 4');expect(session.rawEvents.length).toBeGreaterThan(waiting.rawEvents.length)
 const expected=normalizeTrace(session.rawEvents,session.sourceManifest,{status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic},`execution:${session.id}`)
 await writeFile('.ggjavaez/qa/reference-exact/stream-stop-native.json',JSON.stringify({sessionId:session.id,waitingRawEvents:waiting.rawEvents.length,finalRawEvents:session.rawEvents.length,expectedNormalizedEvents:expected.trace.events.length,actualNormalizedEvents:await page.evaluate(()=>window.__ggjavaezWorld!.recordedEvents().length),streams:await streams(page),errors},null,2)+'\n')
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.recordedEvents().length),{timeout:5000}).toBe(expected.trace.events.length)
 await expect.poll(async()=>(await streams(page)).every(source=>source.readyState===2),{timeout:5000}).toBe(true);expect(errors).toEqual([])
})
