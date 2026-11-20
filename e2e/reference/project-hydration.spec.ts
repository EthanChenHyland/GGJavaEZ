import {expect,test} from '@playwright/test'
import {browserErrors,ready} from './harness'

test('a verified saved project restores source while the unrelated catalog is still pending',async({page,request})=>{
 const errors=browserErrors(page)
 const name=`Saved project ${Date.now()}`
 const imported=await request.post('/api/projects/import',{data:{name,files:[{path:'Main.java',content:'public class Main { public static void main(String[] args) {} }\n'}]}})
 expect(imported.ok(),await imported.text()).toBe(true)
 const {id}=await imported.json()as{id:string}
 const summary=await request.get(`/api/projects/${id}`);expect(summary.ok()).toBe(true);expect(await summary.json()).toMatchObject({id,name})
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id)
 let release!:()=>void,requested=false,completed=false,listed:ReturnType<typeof page.waitForResponse>|undefined
 const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/projects',async route=>{
  if(route.request().method()!=='GET'){await route.continue();return}
  requested=true
  await gate
  await route.continue()
  completed=true
 })
 try{
  await page.goto('/?qa=1')
  const button=page.getByRole('button',{name:'Project menu',exact:true})
  await expect(button).toHaveAttribute('data-project-id',id)
  await expect(button).toContainText(name)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
  await ready(page)
  expect(requested).toBe(true);expect(completed,'Full catalog has not supplied the selected project').toBe(false)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toContain('/'+id+'/')
  listed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects'&&response.request().method()==='GET')
 }finally{release()}
 await expect.poll(()=>completed).toBe(true)
 // The live project-menu catalog still arrives from the normal server request.
 // A route is held only to prove independence; it supplies no fake API data.
 await listed
 await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',id)
 expect(errors).toEqual([])
 await test.info().attach('saved-project-hydration-boundary',{body:JSON.stringify({projectId:id,realJvm:false,catalogHeld:true,sourceRestoredBeforeCatalog:true}),contentType:'application/json'})
})

test('a late saved-project lookup cannot replace a newer explicit project choice',async({page,request})=>{
 const errors=browserErrors(page),ids:string[]=[]
 for(const suffix of ['saved','chosen']){
  const response=await request.post('/api/projects/import',{data:{name:`Hydration ${suffix} ${Date.now()}`,files:[{path:'Main.java',content:'public class Main {}\n'}]}})
  expect(response.ok(),await response.text()).toBe(true);ids.push((await response.json()).id as string)
 }
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),ids[0])
 let release!:()=>void,requested=false
 const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route(`**/api/projects/${ids[0]}`,async route=>{requested=true;await gate;await route.continue()})
 let savedResponse:ReturnType<typeof page.waitForResponse>|undefined
 try{
  await page.goto('/?qa=1')
  const firstUse=page.getByRole('region',{name:'Open Project',exact:true})
  // The ordinary full catalog remains usable while the saved lookup is held.
  const chooser=page.getByRole('combobox',{name:'Open existing project',exact:true})
  await expect(chooser.locator(`option[value="${ids[1]}"]`)).toHaveCount(1)
  await chooser.selectOption(ids[1])
  await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',ids[1])
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(firstUse).toHaveCount(0)
  expect(requested).toBe(true)
  savedResponse=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${ids[0]}`)
 }finally{release()}
 await savedResponse
 await ready(page)
 await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',ids[1])
 expect(await page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toContain('/'+ids[1]+'/')
 expect(errors).toEqual([])
})
