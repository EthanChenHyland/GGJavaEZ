import { expect, test } from '@playwright/test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {ExecutionSession} from '../src/execution/contracts'
import {currentSession,focusSelection,home,ready,seekCursor,selectEntity} from './reference/harness'

const output = `${process.env.VJ_QA_OUTPUT_ROOT ?? '.ggjavaez/qa/reference-exact'}/coverage`
const cases = [
  ['oop', '16-static-nested', /Channel #/],
  ['arrays', '03-reference-arrays', /Parcel\[\] #/],
  ['statics', '01-static-initialization', /<clinit>/],
  ['collections', '07-array-list', /ArrayList #/],
  ['stdin-stdout', '25-cross-feature-dispatch', /Dispatch #/],
  ['dependency', '22-maven-dependency', /main/],
  ['exception', '29-exception-interactions', /main/],
  ['large-world', '28-bounded-values', /long\[\] #/],
] as const

const ownedProjects=new Set<string>()

test.afterEach(async ({ request }) => {
  const current = await (await request.get('/api/execution/current')).json()
  if (current && ownedProjects.has(current.projectId) && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase))
    await request.post(`/api/execution/${current.id}/stop?transport=delta`, { data: {} })
})

async function projectFiles(root: string, prefix = ''): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'expected.facts.json') continue
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await projectFiles(join(root, entry.name), relative))
    else files.push({ path: relative, content: await readFile(join(root, entry.name), 'utf8') })
  }
  return files
}

for (const [view, fixture, preferred] of cases) test(`Phase 4 ${view}: real project, retained world and inspection`, async ({ page, request }) => {
  test.setTimeout(120000)
  const previous=await currentSession(request);expect(!previous||!['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(previous.phase),'Preserve unrelated active execution').toBe(true)
  const root = `fixtures/acceptance-v12-p4/${fixture}`
  const spec = JSON.parse(await readFile(`${root}/expected.facts.json`, 'utf8'))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const imported = await request.post('/api/projects/import', { data: { name: `Phase4 ${view}`, files: await projectFiles(root) } })
  expect(imported.ok(), await imported.text()).toBe(true)
  const { id } = await imported.json();ownedProjects.add(id)
  await page.addInitScript(projectId => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/?qa=1')
  await page.waitForFunction(id=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const current = async () => (await request.get('/api/execution/current')).json() as Promise<ExecutionSession>
  let sent = false
  await expect.poll(async () => {
    const session = await current()
    if (session?.projectId !== id) return 'other'
    if (session.phase === 'WAITING_FOR_INPUT' && !sent && spec.stdin) {
      sent = true
      await request.post(`/api/execution/${session.id}/input`, { data: { text: spec.stdin } })
    }
    return session.phase
  }, { timeout: 90000 }).toBe('COMPLETED')
  const completed = await current()
  expect(completed.exitCode).toBe(spec.exitCode)
  expect(completed.stdout).toBe(spec.stdout)
  expect(completed.stderr).toBe(spec.stderr)
  expect(completed.recording?.state).toBe('FULL');expect(completed.build?.success).toBe(true);expect(completed.rawEvents.length).toBeGreaterThan(0)
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:completed.id,rawEvents:completed.rawEvents.length,buildSuccess:true}),contentType:'application/json'})
  await expect(page.locator('.world-canvas canvas')).toBeVisible()
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${completed.id}`)
  const scrub=page.getByRole('slider',{name:'Recorded execution position',exact:true})
  const max=await page.evaluate(async session=>{
   const path='/src/instrumentation/normalize.ts',{TraceNormalizer}=await import(path),normalizer=new TraceNormalizer(session.sourceManifest)
   normalizer.append(session.rawEvents);const result=normalizer.finish({status:session.terminalStatus,exitCode:session.exitCode,diagnostic:session.diagnostic,recording:session.recording,capability:session.capability}),count=result.trace.events.length;normalizer.history.dispose();return count
  },completed)
  expect(max).toBeGreaterThan(5);await expect.poll(async()=>Number(await scrub.getAttribute('aria-valuemax')),{timeout:90000}).toBe(max)
  await seekCursor(page,max);await home(page)
  const options=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).map(node=>({id:node.id,kind:node.kind,label:node.kind==='class'?`${node.title} static state`:node.kind==='frame'?node.title:`${node.title} #${node.displayId}`})))
  // Statics now belong to their own Class_State shelf, rather than being
  // mixed into an invocation Inspector. The other original preferred types stay.
  const chosen=view==='statics'?options.find(option=>option.kind==='class'&&option.label.includes('Meter')):
    options.find(option=>preferred.test(option.label))??options.find(option=>['object','array','collection'].includes(option.kind))??options.find(option=>option.kind==='frame')
  expect(chosen).toBeDefined()
  let selectedId=chosen!.id
  if(chosen!.kind==='array'){
   await page.locator('.world-canvas').focus();await page.keyboard.press('Tab');await ready(page)
   const offered=await page.getByRole('listbox',{name:'Runtime entities',exact:true}).getByRole('option').evaluateAll(nodes=>nodes.map(node=>decodeURIComponent(node.id.slice('world-entity-'.length))))
   const actualCell=offered.find(id=>id.startsWith(`${chosen!.id}:element:`));expect(actualCell,'Native catalog offers a real represented array cell').toBeDefined();selectedId=actualCell!
  }
  await selectEntity(page,selectedId)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(selectedId)
  const inspector=page.getByRole('complementary',{name:'Selection inspector',exact:true});await expect(inspector).toBeVisible()
  if(view==='statics')await expect(inspector).toContainText('static ·')
  if(view==='collections')await expect(inspector).toContainText('size 0')
  await mkdir(output,{recursive:true});await home(page)
  await expect(page.locator('.array-status')).toHaveCount(0)
  await expect(page.locator('.runtime-status-readouts')).toHaveCount(0)
  await expect(page.locator('.world-detail-summary')).toHaveCount(0)
  const actual=await page.evaluate(id=>{const world=window.__ggjavaezWorld!,scene=world.scene(),node=scene.entities[id],cellWindow=world.plan().cellWindows.get(id);return{node,window:cellWindow?{recordedLength:cellWindow.recordedLength,mapped:cellWindow.mapping.size,ellipses:cellWindow.ellipses}:null,shell:window.__ggjavaezQA!.shellRects()}},chosen!.id)
  if(view==='arrays'){
   expect(actual.node.kind).toBe('array')
   if(actual.node.kind==='array'){const refs=actual.node.cells.filter(cell=>cell.value.kind==='reference');expect(refs.length).toBeGreaterThan(0);expect(refs.every(cell=>cell.value.kind==='reference'&&cell.value.targetType.includes('Parcel'))).toBe(true)}
  }
  if(view==='large-world'){
   expect(actual.node.kind).toBe('array');if(actual.node.kind==='array')expect(actual.node.length).toBe(100000)
   expect(actual.window).not.toBeNull();expect(actual.window!.mapped).toBeLessThan(actual.window!.recordedLength);expect(actual.window!.ellipses.length).toBeGreaterThan(0)
  }
  const source=actual.shell.source,card=actual.shell.inspector
  expect(source).not.toBeNull()
  if(card&&source)expect(source.x+source.width<=card.x||card.x+card.width<=source.x||source.y+source.height<=card.y||card.y+card.height<=source.y).toBe(true)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${output}/${view}-overview-1440x900.png` })
  await focusSelection(page)
  const sizes = view === 'oop' || view === 'collections' ? [[1728, 1117], [1440, 900], [1280, 800], [760, 900]] : [[1440, 900]]
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });await ready(page);await focusSelection(page);await page.waitForTimeout(650)
    await page.screenshot({ path: `${output}/${view}-focus-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  if (view === 'collections') {
    const populatedCursor = await page.evaluate(async ({ session, objectId }) => {
      const modulePath = '/src/instrumentation/normalize.ts'
      const { TraceNormalizer } = await import(modulePath)
      const normalizer = new TraceNormalizer(session.sourceManifest)
      normalizer.append(session.rawEvents)
      const result = normalizer.finish({ status: 'complete', exitCode: 0, diagnostic: null })
      const event = result.trace.events.find((event: { type: string; objectId?: string; library?: { size?: number } }) =>
        event.type === 'OBJECT_OBSERVE' && event.objectId === objectId && event.library?.size === 2)
      normalizer.history.dispose()
      return event?event.seq+1:NaN
    }, { session: completed, objectId: chosen!.id })
    expect(Number.isSafeInteger(populatedCursor)).toBe(true)
    await seekCursor(page,populatedCursor)
    await expect(inspector).toContainText('size 2')
    expect(await page.evaluate(id=>{const node=window.__ggjavaezWorld!.scene().entities[id];return node.kind==='collection'?{kind:node.collectionKind,size:node.size}:null},chosen!.id)).toEqual({kind:'List',size:2})
    await focusSelection(page)
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${output}/collections-populated-focus-1440x900.png` })
  }
  await seekCursor(page,1);await seekCursor(page,max)
  expect(await page.evaluate(id=>!!window.__ggjavaezWorld!.scene().entities[id],chosen!.id)).toBe(true)
  expect((await current()).id).toBe(completed.id)
  expect(errors).toEqual([])
  await writeFile(`${output}/${view}-proof.json`, JSON.stringify({ fixture, exitCode: completed.exitCode,
    recording: completed.recording, sessionId:completed.id,rawEvents:completed.rawEvents.length,semanticEvents:max, selected: chosen,selectedId,errors }, null, 2) + '\n')
})
