import { randomUUID } from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { ExecutionSession } from '../src/execution/contracts'
import {currentSession,ready,seekCursor,selectEntity} from './reference/harness'
import {openDock} from './reference/dockActions'

test.describe.configure({ mode: 'serial', timeout: 90_000 })
const owned=new Set<string>()
test.afterEach(async({request})=>{const session=await currentSession(request);if(session&&owned.has(session.projectId)&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase))expect((await request.post(`/api/execution/${session.id}/stop`,{data:{}})).ok()).toBe(true)})
async function currentPhase(request: APIRequestContext, projectId: string, phase: ExecutionSession['phase']) {
  await expect.poll(async () => {
    const session = await (await request.get('/api/execution/current')).json() as ExecutionSession | null
    return session?.projectId === projectId ? session.phase : 'different project'
  }, { timeout: 45_000 }).toBe(phase)
  return await (await request.get('/api/execution/current')).json() as ExecutionSession
}
async function replaceSource(page:Page,content:string){
 await page.getByRole('button',{name:'Expand source for editing',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.readOnly)).toBe(false)
 await page.getByRole('textbox',{name:'Editor content',exact:true}).focus();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(content)
 await expect(page.locator('.ide-dirty')).toBeVisible()
}
async function saveAndRun(page:Page,runOnly=false){
 if(runOnly){
  await page.keyboard.press('ControlOrMeta+Shift+P')
  const palette=page.getByRole('dialog',{name:'Command Palette',exact:true})
  await palette.getByRole('combobox').fill('Run Without Visualization')
  await palette.getByRole('option').filter({hasText:'Run Without Visualization'}).click()
 }else await page.getByRole('button',{name:'Run',exact:true}).click()
 const decision=page.getByRole('dialog',{name:'Unsaved changes before Run',exact:true})
 await expect(decision.getByRole('listitem')).toHaveText(['Main.java'])
 await decision.getByRole('button',{name:'Save All and Run',exact:true}).click();await expect(decision).toHaveCount(0)
}
async function world(page:Page){return page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{recordingId:scene.recordingId,cursor:scene.cursor,entities:scene.entities,references:scene.references,selection:window.__ggjavaezQA!.selection(),pose:window.__ggjavaezQA!.cameraPose()}})}

test('a new failed or console-only session labels retained output and isolates current output', async ({ page, request }) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  const previous=await currentSession(request);expect(!previous||!['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(previous.phase),'Preserve unrelated active execution').toBe(true)
  const created = await request.post('/api/projects/import', { data: {
    name: `Recording handoff ${randomUUID()}`,
    files: [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { System.out.println("first-output"); } }' }],
  } })
  expect(created.ok(), await created.text()).toBe(true)
  const { id } = await created.json() as { id: string };owned.add(id)
  await page.addInitScript((projectId) => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/?qa=1');await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const first = await currentPhase(request, id, 'COMPLETED')
  expect(first.rawEvents.length).toBeGreaterThan(0);expect(first.stdout).toBe('first-output\n');expect(first.build?.success).toBe(true);expect(first.recording?.state).toBe('FULL');expect(first.exitCode).toBe(0)
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:first.id,rawEvents:first.rawEvents.length,buildSuccess:true}),contentType:'application/json'})
  await expect(page.locator('.world-canvas canvas')).toBeVisible()
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.scene().recordingId)).toBe(`execution:${first.id}`)
  const slider=page.getByRole('slider',{name:'Recorded execution position',exact:true});await slider.focus();await page.keyboard.press('End');await ready(page)
  const frameId=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).find(node=>node.kind==='frame'&&node.title.includes('main('))!.id)
  await selectEntity(page,frameId);await ready(page)
  const before=await world(page);expect(before.selection).toEqual({kind:'frame',id:frameId})
  expect(Object.values(before.entities).some(node=>node.kind==='frame'&&node.title.includes('main(')&&node.status.kind==='returned')).toBe(true)
  const prior=page.getByRole('status').filter({hasText:'Previous run'})
  await expect(prior).toHaveCount(0)
  await page.locator('.world-canvas canvas').evaluate(node=>node.setAttribute('data-handoff-canvas','retained'))

  await replaceSource(page,'public class Main { public static void main(String[] args) { MissingType broken; } }')
  await saveAndRun(page)
  const failed=await currentPhase(request,id,'FAILED');expect(failed.id).not.toBe(first.id);expect(failed.build?.success).toBe(false)
  await expect(prior).toHaveText('Previous run · source changed');await expect(page.locator('.world-canvas canvas')).toBeVisible();await expect(page.locator('.world-canvas canvas')).toHaveAttribute('data-handoff-canvas','retained')
  expect(await world(page)).toEqual(before)
  // The prior World remains navigable after compilation fails.
  await seekCursor(page,0);expect((await world(page)).cursor).toBe(0)
  await seekCursor(page,before.cursor);expect(await world(page)).toEqual(before)
  await expect(page.getByRole('navigation',{name:'Dock',exact:true}).getByRole('button',{name:'Problems',exact:true})).toBeVisible()
  await openDock(page,'Problems');await expect(page.locator('.ide-problems')).toContainText('cannot find symbol')
  await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(0)
  await openDock(page,'Console');await expect(page.getByRole('region',{name:'Previous run console',exact:true})).toContainText('first-output');await expect(page.getByRole('region',{name:'Current attempt console',exact:true})).not.toContainText('first-output')
  await page.screenshot({path:'.ggjavaez/qa/reference-exact/recording-handoff-failed-1440x900.png'})

  await replaceSource(page,'public class Main { public static void main(String[] args) { System.out.println("second-output"); } }')
  await saveAndRun(page,true)
  const second = await currentPhase(request, id, 'COMPLETED')
  expect(second.id).not.toBe(first.id);expect(second.id).not.toBe(failed.id)
  expect(second.support).toBe('RUN_ONLY');expect(second.build?.success).toBe(true);expect(second.exitCode).toBe(0);expect(second.stdout).toBe('second-output\n');expect(second.rawEvents).toEqual([])
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:second.id,rawEvents:second.rawEvents.length,buildSuccess:true,support:second.support}),contentType:'application/json'})
  await expect(prior).toHaveText('Previous run · source changed');expect(await world(page)).toEqual(before)
  await expect(page.locator('.world-canvas canvas')).toHaveAttribute('data-handoff-canvas','retained')
  await openDock(page,'Console');await expect(page.getByRole('region',{name:'Current attempt console',exact:true})).toContainText('second-output');await expect(page.getByRole('region',{name:'Previous run console',exact:true})).toContainText('first-output');await expect(page.getByRole('region',{name:'Current attempt console',exact:true})).not.toContainText('first-output')
  await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(0)
  await page.screenshot({path:'.ggjavaez/qa/reference-exact/recording-handoff-run-only-1440x900.png'})
  await writeFile('.ggjavaez/qa/reference-exact/recording-handoff-native.json',JSON.stringify({first:{id:first.id,rawEvents:first.rawEvents.length,stdout:first.stdout},failed:{id:failed.id,buildSuccess:failed.build?.success},second:{id:second.id,support:second.support,rawEvents:second.rawEvents.length,stdout:second.stdout},before,after:await world(page),errors},null,2)+'\n')
  expect(errors).toEqual([])
})
