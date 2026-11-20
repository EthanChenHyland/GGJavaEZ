import {test,expect,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,ready,currentSession} from './harness'
let ownedSessionId:string|null=null
test.use({actionTimeout:10000})
test.afterEach(async({request})=>{
 const id=ownedSessionId;ownedSessionId=null;if(!id)return
 const session=await currentSession(request)
 if(session?.id===id&&!['COMPLETED','FAILED','STOPPED'].includes(session.phase)){const response=await request.post(`/api/execution/${id}/stop`,{data:{}});expect(response.ok()).toBe(true)}
})
async function headerBounds(page:Page){
 return page.locator('.shell-state').evaluate(status=>{
  const rect=(node:{getBoundingClientRect():DOMRect})=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}
  const lines=Array.from(status.querySelectorAll('.shell-state-badges small')).map(node=>{const text=node.textContent!,prefix=text.startsWith('Partial recording')?'Partial recording':text,range=document.createRange();range.setStart(node.firstChild!,0);range.setEnd(node.firstChild!,prefix.length);return{text,fontSize:parseFloat(getComputedStyle(node).fontSize),box:rect(node),ink:rect(range)}})
  return{header:rect(document.querySelector('.shell-header')!),status:rect(status),lines}
 })
}
function expectHeaderBounds(bounds:Awaited<ReturnType<typeof headerBounds>>){
 expect(bounds.status.y).toBeGreaterThanOrEqual(bounds.header.y);expect(bounds.status.bottom).toBeLessThanOrEqual(bounds.header.bottom+.1)
 for(const line of bounds.lines){expect(line.fontSize).toBeGreaterThanOrEqual(12);expect(line.ink.right).toBeLessThanOrEqual(line.box.right+.1);expect(line.ink.bottom).toBeLessThanOrEqual(bounds.header.bottom+.1)}
}
for(const viewport of [{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650},{width:1024,height:768},{width:1024,height:650}])test(`Header retains partial recording and liveness at input wait ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport);const errors=browserErrors(page)
 const source='public class HeaderPartial { static class Item { int value; Item(int n) { value = n; } } public static void main(String[] args) throws Exception { for(int i=0;i<300;i++) new Item(i); System.out.println("HEADER PARTIAL WAIT"); int input=System.in.read(); System.out.println("HEADER PARTIAL DONE " + input); } }\n'
 const imported=await request.post('/api/projects/import',{data:{name:'Header Partial '+Date.now(),files:[{path:'HeaderPartial.java',content:source}]}});expect(imported.ok()).toBe(true);const id=(await imported.json()).id
 let sessionId:string|null=null

  await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id);await page.goto('/?qa=1');await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function');await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
  const response=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${id}/execution`&&response.request().method()==='POST');await page.getByRole('button',{name:'Run',exact:true}).click();const started=await (await response).json();sessionId=started.id;ownedSessionId=sessionId
  await expect.poll(async()=>{const s=await currentSession(request);if(s?.id===sessionId&&s.phase==='FAILED')throw new Error('Actual Java run failed: '+s.diagnostic);return s?.id===sessionId?s.phase:null},{timeout:60000}).toBe('WAITING_FOR_INPUT')
  const session=(await currentSession(request))!;expect(session.recording).toMatchObject({state:'STOPPED_LIMIT',budget:'objects',executionContinued:true});expect(session.stdout).toContain('HEADER PARTIAL WAIT')
  // Waiting-input metadata can precede the streamed recording-limit fact.
  // Observe that actual committed boundary before capturing its badges.
  await expect.poll(()=>page.evaluate(()=>{const state=window.__ggjavaezQA!.appState();return{execution:state.execution,recording:state.dimensions.recording?.state,recordingId:state.dimensions.view.recordingId}})).toEqual({execution:'WAITING_INPUT',recording:'STOPPED_LIMIT',recordingId:`execution:${session.id}`});await ready(page)
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,buildSuccess:session.build?.success}),contentType:'application/json'})
  const observation=await page.evaluate(()=>({state:window.__ggjavaezQA!.appState(),headerText:document.querySelector('.shell-state')!.textContent,title:document.querySelector('.shell-state')!.getAttribute('title')}));await writeFile(`.ggjavaez/qa/reference-exact/header-partial-${viewport.width}x${viewport.height}.json`,JSON.stringify({sessionId:session.id,...observation},null,2)+'\n');await page.screenshot({path:`.ggjavaez/qa/reference-exact/header-partial-${viewport.width}x${viewport.height}.png`})
  expect(observation.state.badges.some(value=>value.startsWith('Partial recording'))).toBe(true);expect(observation.state.badges).toContain('Process alive')
  await expect(page.locator('.shell-state-badges')).toContainText('Partial recording');await expect(page.locator('.shell-state-badges')).toContainText('Process alive');await expect(page.locator('.shell-state-badges')).toBeVisible()
  const waitingBounds=await headerBounds(page);expectHeaderBounds(waitingBounds)
  await page.keyboard.press('ControlOrMeta+p');await page.getByRole('combobox',{name:'Search project files',exact:true}).fill('HeaderPartial.java');await page.getByRole('option',{name:'HeaderPartial.java HeaderPartial.java',exact:true}).click()
  await page.getByRole('button',{name:'Expand source for editing',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.readOnly)).toBe(false)
  await page.getByRole('textbox',{name:'Editor content',exact:true}).focus();await page.keyboard.press('ControlOrMeta+Home');await page.keyboard.insertText('// changed while recording is partial\n')
  await expect(page.locator('.shell-source-changed')).toHaveText('Source changed since this run');const changedBounds=await headerBounds(page);expectHeaderBounds(changedBounds)
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/header-partial-draft-${viewport.width}x${viewport.height}.png`})
  if(viewport.height===650){
   await page.getByRole('button',{name:'Stop',exact:true}).click();await expect.poll(async()=>{const s=await currentSession(request);return s?.id===sessionId?s.phase:null}).toBe('STOPPED')
   await expect(page.locator('.shell-state-label')).toContainText('Stopped by user');await expect(page.locator('.shell-state-badges')).toContainText('Partial recording')
  }else{
   await page.getByRole('button',{name:'Console',exact:true}).click();await page.getByRole('textbox',{name:'Console input',exact:true}).fill('A');await page.getByRole('button',{name:/^Send/}).click()
   await expect.poll(async()=>{const s=await currentSession(request);return s?.id===sessionId?s.phase:null}).toBe('COMPLETED');await expect(page.locator('.shell-state-label')).toContainText('Partial recording')
   const done=(await currentSession(request))!;expect(done.id).toBe(session.id);expect(done.rawEvents.length).toBe(session.rawEvents.length);expect(done.stdout).toContain('HEADER PARTIAL DONE 65');expect(done.exitCode).toBe(0)
  }
  await expect(page.locator('.shell-state')).not.toContainText('Process alive');const terminal=await page.evaluate(()=>({execution:window.__ggjavaezQA!.appState().execution,recording:window.__ggjavaezQA!.appState().partial}))
  await writeFile(`.ggjavaez/qa/reference-exact/header-partial-bounds-${viewport.width}x${viewport.height}.json`,JSON.stringify({sessionId:session.id,waitingBounds,changedBounds,terminal,errors},null,2)+'\n');expect(errors).toEqual([])
})
