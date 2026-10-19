import {expect,test} from '@playwright/test'
import {browserErrors,currentSession,ready,seekCursor} from './harness'
let ownedProject:string|null=null
const source=`public class PauseApp {
 public static void main(String[] args) {
  int outer = 7;
  int answer = compute(outer);
  System.out.println(answer);
 }
 static int compute(int value) {
  int local = value + 11;
  local += 1;
  return local;
 }
}
`
test.afterEach(async({request})=>{
 const session=await currentSession(request)
 if(session?.projectId===ownedProject&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase)){
  const response=await request.post(`/api/execution/${session.id}/stop`,{data:{}});expect(response.ok()).toBe(true)
 }
 ownedProject=null
})
for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`paused debugger drawer remains live while the World is rewound ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});const errors=browserErrors(page)
 const response=await request.post('/api/projects/import',{data:{name:`Paused drawer ${Date.now()}`,files:[{path:'PauseApp.java',content:source}]}})
 expect(response.ok()).toBe(true);const{id}=await response.json();ownedProject=id
 await page.addInitScript(id=>{
  localStorage.setItem('ggjavaez:project',id)
  localStorage.setItem(`ggjavaez:breakpoints:${id}`,JSON.stringify([{fileId:'PauseApp.java',line:9}]))
 },id)
 await page.goto('/?qa=1');await expect(page.getByRole('button',{name:'Debug',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'Debug',exact:true}).click()
 await expect.poll(async()=>{const s=await currentSession(request);return s&&s.projectId===id&&s.phase==='PAUSED'?s.pause?.reason:null},{timeout:15000}).toBe('entry')
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await expect.poll(async()=>{const s=await currentSession(request);return s&&s.projectId===id&&s.phase==='PAUSED'?s.pause?.line:null},{timeout:15000}).toBe(9)
 await page.waitForFunction(()=>!!window.__ggjavaezQA?.ready);await ready(page)
 await page.getByRole('button',{name:'Inspect debugger',exact:true}).click()
 const drawer=page.getByRole('region',{name:'Debugger inspection'}),stack=drawer.getByRole('list',{name:'Paused call stack'}),variables=drawer.getByRole('list',{name:'Paused variables'})
 await expect(drawer).toBeVisible();await expect(stack.getByRole('listitem')).toHaveCount(2)
 const geometry=await drawer.evaluate(node=>({display:getComputedStyle(node).display,columns:getComputedStyle(node).gridTemplateColumns.split(' ').length,width:node.clientWidth,scrollWidth:node.scrollWidth,children:Array.from(node.children).map(child=>{const r=child.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})}))
 expect(geometry.display).toBe('grid');expect(geometry.columns).toBe(viewport.width<1024?2:4);expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width)
 for(let index=0;index<geometry.children.length;index++)for(const other of geometry.children.slice(index+1)){
  const item=geometry.children[index];expect(Math.min(item.x+item.width,other.x+other.width)<=Math.max(item.x,other.x)||Math.min(item.y+item.height,other.y+other.height)<=Math.max(item.y,other.y)).toBe(true)
 }
 await expect(stack.getByRole('listitem').first()).toContainText('PauseApp.compute()');await expect(stack.getByRole('listitem').first()).toContainText('PauseApp.java:9')
 await expect(stack.getByRole('listitem').nth(1)).toContainText('PauseApp.main()');await expect(stack.getByRole('listitem').nth(1)).toContainText('PauseApp.java:4')
 await expect(variables.getByRole('button',{name:'Inspect paused value',exact:true})).toContainText('7')
 await expect(variables.getByRole('button',{name:'Inspect paused local',exact:true})).toContainText('18')
 const pause=(await currentSession(request))!.pause,before=await drawer.innerText()
 await seekCursor(page,0)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cursor().cursor)).toBe(0)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().order.frames)).toEqual([])
 expect(await drawer.innerText()).toBe(before);expect((await currentSession(request))!.pause).toEqual(pause)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/debug-drawer-history-${viewport.width}.png`})
 // A real debugger command in HISTORY advances the suspended process while the
 // World stays at zero; drawer values follow the new paused prefix only.
 await page.getByRole('button',{name:'Step Over',exact:true}).click()
 await expect.poll(async()=>{const s=await currentSession(request);return s&&s.projectId===id&&s.phase==='PAUSED'?s.pause?.line:null},{timeout:15000}).toBe(10)
 await expect(variables.getByRole('button',{name:'Inspect paused local',exact:true})).toContainText('19')
 await expect(stack.getByRole('listitem').first()).toContainText('PauseApp.java:10')
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cursor().cursor)).toBe(0)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.appState().overlays)).toContain('HISTORY')
 await page.getByRole('button',{name:'Return to Live',exact:true}).click();await ready(page)
 await variables.getByRole('button',{name:'Inspect paused local',exact:true}).click()
 const exact=drawer.getByRole('region',{name:'Captured paused local'})
 await expect(exact).toContainText('OBSERVED');await expect(exact.locator('pre')).toHaveText('19')
 await drawer.getByRole('button',{name:'Remove breakpoint PauseApp.java:9',exact:true}).click()
 await expect.poll(async()=>(await currentSession(request))!.breakpoints.length).toBe(0)
 expect((await currentSession(request))!.pause!.line).toBe(10)
 await page.getByRole('button',{name:'Stop debugger',exact:true}).click()
 await expect.poll(async()=>(await currentSession(request))!.phase).toBe('STOPPED')
 await expect(page.getByRole('toolbar',{name:'JVM debugger controls'})).toHaveCount(0)
 await expect(drawer.getByRole('list',{name:'Paused variables'})).toHaveCount(0);await expect(drawer.getByRole('list',{name:'Paused call stack'})).toHaveCount(0)
 expect(errors).toEqual([])
})
