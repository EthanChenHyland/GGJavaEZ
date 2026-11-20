import {expect,test} from '@playwright/test'
import {resolve} from 'node:path'
import {currentSession} from './harness'

test('a copied project opens while an unrelated catalog refresh is delayed',async({page,request})=>{
 const previous=await currentSession(request)
 expect(!previous||!['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(previous.phase),'Preserve unrelated execution').toBe(true)
 const initialCatalog=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects'&&response.request().method()==='GET')
 await page.goto('/?qa=1')
 expect((await initialCatalog).ok()).toBe(true)
 await expect(page.getByRole('heading',{name:'Open Project',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Project menu',exact:true})).toBeEnabled()
 let release!:()=>void
 const held=new Promise<void>(resolve=>{release=resolve})
 // Delay transport only. Every project/metadata/source response remains real;
 // no Java execution, fake project, store action or app setter is involved.
 await page.route('**/api/projects',async route=>{
  if(route.request().method()==='GET')await held
  await route.continue()
 })
 try{
  const imported=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects/import'&&response.request().method()==='POST')
  const chooser=page.waitForEvent('filechooser')
  await page.getByRole('button',{name:'Import folder (copy)',exact:true}).click()
  await(await chooser).setFiles(resolve('fixtures/reference-exact/array'))
  const response=await imported;expect(response.ok()).toBe(true)
  const project=await response.json()
  expect(project.id).toMatch(/^[a-f0-9-]{36}$/)
  await expect(page.locator('.ide-first-use')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',project.id)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.locator('.ide-tab.is-active')).toContainText('ReorderApp.java')
  expect(await page.evaluate(()=>localStorage.getItem('ggjavaez:project'))).toBe(project.id)
 }finally{release()}
})

test('late startup catalog metadata preserves a newly imported project',async({page,request})=>{
 const previous=await currentSession(request)
 expect(!previous||!['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(previous.phase),'Preserve unrelated execution').toBe(true)
 let release!:()=>void,fetched!:()=>void
 const held=new Promise<void>(resolve=>{release=resolve}),captured=new Promise<void>(resolve=>{fetched=resolve})
 let first=true
 await page.route('**/api/projects',async route=>{
  if(route.request().method()==='GET'&&first){
   first=false
   const response=await route.fetch();expect(response.ok()).toBe(true)
   fetched();await held;await route.fulfill({response})
  }else await route.continue()
 })
 try{
  await page.goto('/?qa=1');await captured
  await expect(page.getByRole('heading',{name:'Open Project',exact:true})).toBeVisible()
  const imported=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects/import'&&response.request().method()==='POST')
  const chooser=page.waitForEvent('filechooser')
  await page.getByRole('button',{name:'Import folder (copy)',exact:true}).click()
  await(await chooser).setFiles(resolve('fixtures/reference-exact/array'))
  const response=await imported;expect(response.ok()).toBe(true)
  const project=await response.json(),menu=page.getByRole('button',{name:'Project menu',exact:true})
  await expect(page.locator('.ide-first-use')).toHaveCount(0)
  await expect(menu).toHaveAttribute('data-project-id',project.id)
  await expect(menu).toContainText(project.name)
  const stale=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects'&&response.request().method()==='GET')
  release();expect((await stale).ok()).toBe(true)
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await expect(menu).toHaveAttribute('data-project-id',project.id)
  await expect(menu).toContainText(project.name)
  await expect(page.locator('.ide-tab.is-active')).toContainText('ReorderApp.java')
 }finally{release()}
})

test('a new project opens while an unrelated catalog refresh is delayed',async({page,request})=>{
 const previous=await currentSession(request)
 expect(!previous||!['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(previous.phase),'Preserve unrelated execution').toBe(true)
 const initialCatalog=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects'&&response.request().method()==='GET')
 await page.goto('/?qa=1');expect((await initialCatalog).ok()).toBe(true)
 await expect(page.getByRole('heading',{name:'Open Project',exact:true})).toBeVisible()
 let release!:()=>void
 const held=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/projects',async route=>{
  if(route.request().method()==='GET')await held
  await route.continue()
 })
 try{
  await page.getByRole('button',{name:'New Project',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'New Project',exact:true})
  await dialog.getByRole('textbox').fill(`Catalog creation ${Date.now()}`)
  const created=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects'&&response.request().method()==='POST')
  await dialog.getByRole('button',{name:'Create',exact:true}).click()
  const response=await created;expect(response.ok()).toBe(true)
  const project=await response.json()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.ide-first-use')).toHaveCount(0)
  const menu=page.getByRole('button',{name:'Project menu',exact:true})
  await expect(menu).toHaveAttribute('data-project-id',project.id)
  await expect(menu).toContainText(project.name)
 }finally{release()}
})
