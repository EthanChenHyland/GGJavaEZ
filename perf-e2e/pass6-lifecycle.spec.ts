import { expect, test, type APIRequestContext, type CDPSession, type Page } from '@playwright/test'
import { createWriteStream } from 'node:fs'
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { finished } from 'node:stream/promises'
import { normalizeTrace } from '../src/instrumentation/normalize'
import type { ExecutionSession } from '../src/execution/contracts'
import manifest from '../fixtures/reference-exact/manifest.json' with { type: 'json' }
import { home, ready, selectEntity } from '../e2e/reference/harness'
import { openDock } from '../e2e/reference/dockActions'
import { selectProject } from '../e2e/reference/menuActions'
import {
  ARRAY_LENGTH, ARRAY_INDEX, COLLECTION_SIZE, DENSE_OBJECTS, arraySource, collectionSource, collectionKinds,
  denseExceptionSource, ioSource, inputValue, stdoutRows, stderrRows, selectBody, closeInspector, pickCluster,
} from './pass6-lifecycle-workloads'

test.skip(process.env.VJ_PASS6_LIFECYCLE !== '1', 'Long real-JVM soak requires VJ_PASS6_LIFECYCLE=1')
test.use({ reducedMotion: 'no-preference', actionTimeout: 10_000, screenshot: 'only-on-failure' })

type Project = 'array' | 'dense' | 'large-array' | 'collections' | 'exceptions' | 'io'
type Phase = ExecutionSession['phase']
const active = new Set<Phase>(['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'])
const qualityBoundaries = new Set([1, 5, 10, 20, 50])
const projects = new WeakMap<Page, Partial<Record<Project, string>>>()
const rail = (page: Page) => page.getByRole('slider', { name: 'Recorded execution position', exact: true })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Selection inspector', exact: true })
const dock = (page: Page, name: string) => page.getByRole('navigation', { name: 'Dock', exact: true })
  .getByRole('button', { name, exact: true })
const settings = (page: Page) => page.locator('summary[aria-label="Timeline settings"]')
const source = { 'large-array': arraySource, collections: collectionSource, exceptions: denseExceptionSource, io: ioSource }

function countEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1) throw new Error(name + ' must be a positive integer')
  return value
}

async function projectFiles(kind: Project) {
  if (kind !== 'array' && kind !== 'dense') return [{ path: 'Main.java', content: source[kind] }]
  const dir = resolve(process.cwd(), 'fixtures/reference-exact', kind)
  const files = (await readdir(dir, { recursive: true })).filter(file => file.endsWith('.java')).sort()
  expect(files.length).toBeGreaterThan(0)
  return Promise.all(files.map(async path => ({ path, content: await readFile(join(dir, path), 'utf8') })))
}

async function currentSession(request: APIRequestContext): Promise<ExecutionSession | null> {
  const response = await request.get('/api/execution/current')
  try {
    expect(response.ok()).toBe(true)
    return await response.json() as ExecutionSession | null
  } finally {
    await response.dispose()
  }
}

async function setup(page: Page, request: APIRequestContext, kinds: readonly Project[]) {
  const current = await currentSession(request)
  expect(!current || !active.has(current.phase), 'Bridge must be idle before this test imports its own QA projects').toBe(true)
  const ids: Partial<Record<Project, string>> = {}
  projects.set(page, ids)
  for (const kind of kinds) {
    const response = await request.post('/api/projects/import', {
      data: { name: 'Pass 6 ' + kind + ' ' + randomUUID(), files: await projectFiles(kind) },
    })
    expect(response.ok(), await response.text()).toBe(true)
    ids[kind] = (await response.json()).id
  }
  await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), ids[kinds[0]]!)
  await page.goto('/?qa=1')
  await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
  return ids
}

test.afterEach(async ({ page, request }) => {
  const ids = projects.get(page)
  if (!ids) return
  const session = await currentSession(request)
  if (session && Object.values(ids).includes(session.projectId) && active.has(session.phase)) {
    expect((await request.post('/api/execution/' + session.id + '/stop', { data: {} })).ok()).toBe(true)
  }
})

async function sessionAt(request: APIRequestContext, id: string, phase: Phase) {
  let found: ExecutionSession | null = null
  await expect.poll(async () => {
    found = await currentSession(request)
    return found?.id === id ? found.phase : null
  }, { timeout: 55_000, intervals: [100, 200, 300, 500] }).toBe(phase)
  return found! as ExecutionSession
}

async function startRun(page: Page, id: string, save = false) {
  await expect(button(page, 'Run')).toBeEnabled()
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/projects/' + id + '/execution'
    && response.request().method() === 'POST', { timeout: 25_000 })
  await button(page, 'Run').click()
  if (save) await page.getByRole('dialog', { name: 'Unsaved changes before Run', exact: true })
    .getByRole('button', { name: 'Save All and Run', exact: true }).click()
  const response = await responsePromise
  expect(response.ok(), await response.text()).toBe(true)
  const session = await response.json() as ExecutionSession
  expect(session).toMatchObject({ projectId: id, kind: 'run' })
  return session.id
}

async function seek(page: Page, cursor: number, wait = true) {
  const control = rail(page), max = Number(await control.getAttribute('aria-valuemax'))
  expect(cursor).toBeGreaterThanOrEqual(0)
  expect(cursor).toBeLessThanOrEqual(max)
  if (cursor === 0 || cursor === max) await control.press(cursor === 0 ? 'Home' : 'End')
  else await control.fill(String(cursor))
  await expect(control).toHaveAttribute('aria-valuenow', String(cursor))
  await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld?.scene().cursor), { intervals: [16, 33, 50] }).toBe(cursor)
  if (wait) await ready(page)
}

async function exitFocus(page: Page) {
  const exit = inspector(page).getByRole('button', { name: 'Return to World', exact: true })
  if (await exit.isVisible()) {
    await exit.click()
    await ready(page)
  }
}

async function focus(page: Page, id: string) {
  await inspector(page).getByRole('button', { name: 'Focus selection', exact: true }).click()
  await ready(page)
  expect(await page.evaluate(() => window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(id)
}

async function dismissTools(page: Page) {
  await exitFocus(page)
  await closeInspector(page)
  for (const name of ['Console', 'Errors', 'Problems', 'Debug drawer']) {
    const tool = dock(page, name)
    if (await tool.getAttribute('aria-expanded') === 'true') await tool.click()
  }
  if (await page.locator('details.gg-time-settings[open]').count()) await settings(page).click()
}

async function run(page: Page, request: APIRequestContext, kind: Project, id: string) {
  const start = performance.now()
  await dismissTools(page)
  await selectProject(page, id)
  await expect(page.locator('.ide-tab.is-active')).toBeVisible()
  const rawId = await startRun(page, id)
  if (kind === 'io') {
    await sessionAt(request, rawId, 'WAITING_FOR_INPUT')
    const field = page.getByLabel('Console input', { exact: true })
    await expect(field).toBeEnabled()
    await field.fill(inputValue)
    await button(page, 'Send ↵').click()
  }
  const session = await sessionAt(request, rawId, kind === 'exceptions' ? 'FAILED' : 'COMPLETED')
  const terminalMs = Math.round(performance.now() - start)
  expect(session).toMatchObject({ build: { success: true }, recording: { state: 'FULL' },
    terminalStatus: kind === 'exceptions' ? 'program_crashed' : 'complete' })
  const expectedOutput = {
    array: manifest.array.stdout, dense: manifest.dense.stdout, 'large-array': '17:29\n',
    collections: '64:64:64:64\n', exceptions: 'Recovered 95: recoverable validation\n', io: stdoutRows.join(''),
  }
  expect(session.stdout).toBe(expectedOutput[kind])
  if (kind === 'io') expect(session.stderr).toBe(stderrRows.join(''))
  if (kind === 'exceptions') expect(session.stderr).toContain('java.lang.IllegalArgumentException: terminal validation')
  expect(session.rawEvents.length).toBeGreaterThan(0)
  const recordingId = 'execution:' + rawId
  const normalized = normalizeTrace(session.rawEvents, session.sourceManifest, {
    exitCode: session.exitCode, status: session.terminalStatus!, diagnostic: session.diagnostic,
    ...(session.recording ? { recording: session.recording } : {}),
    ...(session.capability ? { capability: session.capability } : {}),
  }, recordingId).trace.events.length
  await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld?.scene().recordingId)).toBe(recordingId)
  await expect(rail(page)).toHaveAttribute('aria-valuemax', String(normalized), { timeout: 45_000 })
  await dismissTools(page)
  await seek(page, normalized)
  return { id: rawId, recordingId, terminalMs, readyMs: Math.round(performance.now() - start), rawEvents: session.rawEvents.length, normalized }
}

function observe(page: Page) {
  return page.evaluate(() => {
    const world = window.__ggjavaezWorld!, qa = window.__ggjavaezQA!, scene = world.scene(), plan = world.plan()
    const resource = world.resources()
    return {
      href: location.href, timeOrigin: performance.timeOrigin,
      project: document.querySelector('[data-project-id]')?.getAttribute('data-project-id'),
      state: { cursor: scene.cursor, liveHead: scene.liveHead, detail: plan.detailLevel, pose: qa.cameraPose(),
        selection: world.selection(), focus: qa.focusTarget(), quality: world.quality().active, sceneId: scene.recordingId,
        safeFrame: qa.shellRects().safeFrame, commandFrame: qa.shellRects().commandFrame,
        app: qa.appState(), navigation: qa.navigationState() },
      counts: { frames: scene.order.frames.length, objects: scene.order.objects.length, classes: scene.order.classes.length,
        refs: scene.references.length, entities: plan.entities.size, clusters: plan.clusters.length, curves: plan.curves.length,
        windows: plan.cellWindows.size, cells: [...plan.cellWindows.values()].reduce((sum, window) => sum + window.visible.length, 0),
        headings: world.runtimeHeadings().length, structuralLabels: world.structuralLabels().length },
      renderer: world.renderer(), resource, effects: world.effects(), editor: qa.editorModels(),
      motion: world.motion(),
    }
  })
}

async function heap(cdp: CDPSession) {
  const before = await cdp.send('Runtime.getHeapUsage')
  await cdp.send('HeapProfiler.collectGarbage')
  const after = await cdp.send('Runtime.getHeapUsage')
  const dom = await cdp.send('Memory.getDOMCounters')
  return { before, after, dom }
}

async function snapshotHeap(cdp: CDPSession, label: string) {
  if (process.env.VJ_PASS6_HEAP_SNAPSHOTS !== '1') return 0
  const started = performance.now()
  const path = test.info().outputPath(label + '.heapsnapshot')
  const stream = createWriteStream(path)
  const written = finished(stream)
  const chunk = ({ chunk }: { chunk: string }) => { stream.write(chunk) }
  cdp.on('HeapProfiler.addHeapSnapshotChunk', chunk)
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', chunk)
    stream.end()
    await written
  }
  return performance.now() - started
}

type World = Awaited<ReturnType<typeof observe>>
function equivalent(reference: World, actual: World, sameRun = false) {
  expect(actual.timeOrigin, 'All equivalent samples stay in one document').toBe(reference.timeOrigin)
  expect(actual.project).toBe(reference.project)
  expect(actual.counts).toEqual(reference.counts)
  if (sameRun) expect(actual.state.sceneId).toBe(reference.state.sceneId)
  const fixed = (value: World['state']) => ({
    cursor: value.cursor, liveHead: value.liveHead, detail: value.detail, focus: value.focus, selection: value.selection,
    quality: value.quality, safeFrame: value.safeFrame, commandFrame: value.commandFrame, navigation: value.navigation,
  })
  expect(fixed(actual.state)).toEqual(fixed(reference.state))
  for (const axis of ['position', 'target'] as const) {
    actual.state.pose[axis].forEach((value, index) => expect(value).toBeCloseTo(reference.state.pose[axis][index], 3))
  }
}

function receipts(page: Page) {
  const start = performance.now(), errors: string[] = [], warnings: string[] = []
  const path = test.info().outputPath('observations.jsonl')
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
    if (message.type() === 'warning') warnings.push(message.text())
  })
  const write = async (data: object) => {
    await mkdir(resolve(path, '..'), { recursive: true })
    await appendFile(path, JSON.stringify({ elapsedMs: Math.round(performance.now() - start), ...data }) + '\n')
  }
  const checkpoint = async (cdp: CDPSession, label: string, mark: object = {}) => {
    await ready(page)
    const collected = await heap(cdp)
    const world = await observe(page)
    expect(world.motion.pending, 'Settled checkpoint drains the presentation queue').toBe(0)
    await write({ checkpoint: label, ...mark, world, heap: collected })
    console.log(JSON.stringify({ checkpoint: label, ...mark, elapsed: Math.round((performance.now() - start) / 1000),
      usedMiB: +(collected.after.usedSize / 2 ** 20).toFixed(2), nodes: collected.dom.nodes,
      textures: world.renderer.textures, geometries: world.renderer.geometries, programs: world.resource.programs,
      sceneMaterials: world.resource.sceneMaterials, composerTargets: world.resource.composerTargets }))
    return world
  }
  return { write, checkpoint, async finish() {
    await write({ errors, warnings })
    expect.soft(errors.filter(error => !/^THREE\.WebGLRenderer: Context Lost\.?$/.test(error))).toEqual([])
  } }
}

async function arrayCheckpoint(page: Page) {
  await dismissTools(page)
  await seek(page, 63)
  await home(page)
}

async function qualityTrip(page: Page, cinematic?: () => Promise<void>) {
  await settings(page).click()
  await button(page, 'Rendering quality: INTERACTIVE').click()
  await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld!.quality().active), { timeout: 15_000 }).toBe('CINEMATIC')
  await ready(page)
  if (cinematic) await cinematic()
  await button(page, 'Rendering quality: CINEMATIC').click()
  await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld!.quality().active), { timeout: 15_000 }).toBe('INTERACTIVE')
  await settings(page).click()
  await ready(page)
}

test('same-project repeated Runs, quality round trips, and WebGL recovery', async ({ page, request, context }) => {
  test.setTimeout(600_000)
  const log = receipts(page), ids = await setup(page, request, ['array'])
  const cdp = await context.newCDPSession(page)
  try {
    const first = await run(page, request, 'array', ids.array!)
    const sessions = new Set([first.id])
    await arrayCheckpoint(page)
    const initial = await log.checkpoint(cdp, 'repeated-run-0', first)
    await snapshotHeap(cdp, 'repeated-run-0')
    const runCount = countEnv('VJ_PASS6_RUNS', 20)
    for (let cycle = 1; cycle <= runCount; cycle++) {
      const next = await run(page, request, 'array', ids.array!)
      expect(sessions.has(next.id), 'Each Run starts a new JVM recording').toBe(false)
      sessions.add(next.id)
      expect(next.normalized).toBe(first.normalized)
      await arrayCheckpoint(page)
      equivalent(initial, await log.checkpoint(cdp, 'repeated-run-' + cycle, next))
      if (cycle === 5 || cycle === runCount) await snapshotHeap(cdp, 'repeated-run-' + cycle)
    }
    const afterRuns = await log.checkpoint(cdp, 'quality-0')
    expect(afterRuns.state.quality).toBe('INTERACTIVE')
    await snapshotHeap(cdp, 'quality-0')
    const available = await page.evaluate(() => window.__ggjavaezWorld!.quality().availability)
    await log.write({ cinematicAvailability: available })
    if (available.enabled) {
      const count = countEnv('VJ_PASS6_QUALITY_ROUND_TRIPS', 50)
      let firstCinematic: World | undefined
      for (let trip = 1; trip <= count; trip++) {
        const sample = qualityBoundaries.has(trip) || trip === count
        await qualityTrip(page, sample ? async () => {
          await settings(page).click()
          const measured = await log.checkpoint(cdp, 'cinematic-' + trip)
          if (firstCinematic) equivalent(firstCinematic, measured, true)
          else firstCinematic = measured
          await settings(page).click()
        } : undefined)
        if (sample) equivalent(afterRuns, await log.checkpoint(cdp, 'quality-' + trip), true)
      }
      await snapshotHeap(cdp, 'quality-final')
    } else {
      await settings(page).click()
      const toggle = button(page, 'Rendering quality: INTERACTIVE')
      await expect(toggle).toHaveAttribute('aria-disabled', 'true')
      await toggle.click({ force: true })
      await settings(page).click()
      equivalent(afterRuns, await log.checkpoint(cdp, 'quality-capability-fallback'), true)
    }
    await failedBuild(page, request, ids.array!, await observe(page), log, cdp)
    await exerciseRecovery(page, cdp, log, available.enabled)
  } finally {
    await cdp.detach()
    await log.finish()
  }
})

async function failedBuild(page: Page, request: APIRequestContext, id: string, before: World,
  log: ReturnType<typeof receipts>, cdp: CDPSession) {
  if (process.env.VJ_PASS6_FAILED_BUILD === '0') return
  const expand = button(page, 'Expand source for editing')
  if (await expand.isVisible()) await expand.click()
  const editor = page.getByRole('textbox', { name: 'Editor content', exact: true })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('public class ReorderApp { deliberatelyInvalid }')
  const failed = await sessionAt(request, await startRun(page, id, true), 'FAILED')
  expect(failed.build?.success).toBe(false)
  expect(failed.rawEvents).toHaveLength(0)
  await dismissTools(page)
  await seek(page, 63)
  await home(page)
  const retained = await log.checkpoint(cdp, 'failed-build-preserved-world', { attemptedSession: failed.id })
  expect(retained.state.sceneId).toBe(before.state.sceneId)
  expect(retained.counts).toEqual(before.counts)
}

async function exerciseRecovery(page: Page, cdp: CDPSession, log: ReturnType<typeof receipts>, cinematic: boolean) {
  const object = await page.evaluate(() => {
    const world = window.__ggjavaezWorld!
    return Object.values(world.scene().entities).find(entity => entity.kind === 'array' && entity.length === 5)!.id
  })
  await selectEntity(page, object)
  const canvas = page.locator('.world-canvas canvas')
  await canvas.evaluate(node => node.setAttribute('data-pass6-canvas', 'same'))
  const identity = () => page.evaluate(() => {
    const world = window.__ggjavaezWorld!, qa = window.__ggjavaezQA!
    return { recording: world.scene().recordingId, cursor: world.scene().cursor, selection: world.selection(),
      pose: qa.cameraPose(), tier: world.quality().active }
  })
  const restore = async (count: number, tier: string) => {
    const before = await identity()
    expect(before.selection?.id).toBe(object)
    const baseline = await log.checkpoint(cdp, 'context-' + tier + '-0')
    await snapshotHeap(cdp, 'context-' + tier + '-0')
    for (let round = 1; round <= count; round++) {
      const available = await canvas.evaluate(node => {
        const extension = (node as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')
        Object.defineProperty(node, '__pass6Context', { value: extension, configurable: true })
        extension?.loseContext()
        return !!extension
      })
      if (!available) {
        await log.write({ contextRecoveryUnavailable: true, tier })
        return
      }
      await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld!.quality().contextLost)).toBe(true)
      await canvas.evaluate(node => (Reflect.get(node, '__pass6Context') as WEBGL_lose_context).restoreContext())
      await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld!.quality().contextLost)).toBe(false)
      await ready(page)
      await expect(canvas).toHaveAttribute('data-pass6-canvas', 'same')
      expect(await identity()).toEqual(before)
      expect(await page.evaluate(() => window.__ggjavaezWorld!.effects())).toMatchObject({ ready: true, failure: '' })
      equivalent(baseline, await log.checkpoint(cdp, 'context-' + tier + '-' + round), true)
    }
    await snapshotHeap(cdp, 'context-' + tier + '-final')
  }
  const count = countEnv('VJ_PASS6_CONTEXT_ROUNDS', 5)
  await restore(count, 'interactive')
  if (cinematic) {
    await settings(page).click()
    await button(page, 'Rendering quality: INTERACTIVE').click()
    await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld!.quality().active)).toBe('CINEMATIC')
    await settings(page).click()
    await ready(page)
    await restore(count, 'cinematic')
    await settings(page).click()
    await button(page, 'Rendering quality: CINEMATIC').click()
    await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld!.quality().active)).toBe('INTERACTIVE')
    await settings(page).click()
    await log.checkpoint(cdp, 'context-return-interactive')
  }
}

async function navigate(page: Page) {
  const safe = await page.evaluate(() => window.__ggjavaezQA!.shellRects().safeFrame)
  const x = safe.x + safe.width * .52, y = safe.y + safe.height * .55
  const pose = () => page.evaluate(() => window.__ggjavaezQA!.cameraPose())
  const drag = async (button: 'left' | 'right', dx: number, dy: number) => {
    await page.mouse.move(x, y)
    await page.mouse.down({ button })
    try {
      await page.mouse.move(x + dx, y + dy, { steps: 8 })
    } finally {
      await page.mouse.up({ button })
    }
  }
  for (const action of [() => drag('left', 53, 18), () => drag('right', 31, -12), async () => {
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, -120)
  }]) {
    const before = await pose()
    await action()
    await ready(page)
    expect(await pose()).not.toEqual(before)
  }
}

async function timeline(page: Page, maximum: number, cycle: number) {
  const timings: { cursor: number; elapsedMs: number }[] = []
  let seed = (173 + cycle * 193) >>> 0
  for (let step = 0; step < 8; step++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const cursor = 1 + seed % (maximum - 2), start = performance.now()
    await seek(page, cursor)
    timings.push({ cursor, elapsedMs: performance.now() - start })
  }
  await seek(page, Math.max(1, maximum - 8))
  await button(page, 'Previous Event').click()
  await expect(rail(page)).toHaveAttribute('aria-valuenow', String(maximum - 9))
  await button(page, 'Next Event').click()
  await expect(rail(page)).toHaveAttribute('aria-valuenow', String(maximum - 8))
  await button(page, 'Play recorded execution').click()
  await expect.poll(async () => Number(await rail(page).getAttribute('aria-valuenow'))).toBeGreaterThan(maximum - 8)
  if (await button(page, 'Pause playback').isVisible()) await button(page, 'Pause playback').click()
  const live = button(page, 'Return to Live')
  if (await live.isVisible()) await live.click()
  await expect(rail(page)).toHaveAttribute('aria-valuenow', String(maximum))
  await ready(page)
  return timings
}

async function zoom(page: Page, targets: readonly string[]) {
  const canvas = page.locator('.world-canvas')
  const rank = ['FAR', 'MEDIUM', 'CLOSE']
  const detail = () => page.evaluate(() => window.__ggjavaezWorld!.plan().detailLevel)
  const samples: { target: string; steps: number; resources: World['renderer'] }[] = []
  for (const target of targets) {
    await canvas.focus()
    let actual = await detail(), steps = 0
    for (; steps < 45 && actual !== target; steps++) {
      await page.keyboard.press(rank.indexOf(actual) < rank.indexOf(target) ? '=' : '-')
      await ready(page)
      actual = await detail()
    }
    expect(actual, 'Semantic zoom through production keyboard controls').toBe(target)
    samples.push({ target, steps, resources: await page.evaluate(() => window.__ggjavaezWorld!.renderer()) })
  }
  return samples
}

async function denseActions(page: Page) {
  await home(page)
  await navigate(page)
  await home(page)
  const cuts = await zoom(page, ['FAR', 'MEDIUM', 'CLOSE', 'MEDIUM', 'FAR'])
  const cluster = await pickCluster(page)
  const member = inspector(page).getByRole('list', { name: 'Cluster members' }).getByRole('button').first()
  await member.click()
  await ready(page)
  const selected = await page.evaluate(() => window.__ggjavaezQA!.selection()?.id)
  expect(selected).toBeTruthy()
  await focus(page, selected!)
  await navigate(page)
  await exitFocus(page)
  await closeInspector(page)
  await home(page)
  return { cuts, cluster, selected, settled: await observe(page) }
}

async function inspectLargeArray(page: Page, maximum: number) {
  const array = await page.evaluate(length => {
    const world = window.__ggjavaezWorld!, scene = world.scene()
    const node = Object.values(scene.entities).find(entity => entity.kind === 'array' && entity.length === length)
    if (node?.kind !== 'array') throw new Error('Pass 5 large array missing from native trace')
    const events = world.recordedEvents()
    const write = events.find(event => event.type === 'ARRAY_WRITE' && event.objectId === node.id && event.source?.line === 7)
    const read = events.find(event => event.type === 'ARRAY_READ' && event.objectId === node.id && event.source?.line === 5)
    if (!read || !write) throw new Error('Missing exact indexed read/write events')
    return { id: node.id, write: write.seq, read: read.seq }
  }, ARRAY_LENGTH)
  await seek(page, array.read)
  await home(page)
  await selectBody(page, array.id)
  const paging = inspector(page).getByRole('group', { name: 'Recorded values index navigation', exact: true })
  const jump = paging.getByRole('spinbutton', { name: 'Recorded values index', exact: true })
  const selections = []
  for (const index of [0, Math.floor(ARRAY_LENGTH / 2), ARRAY_INDEX]) {
    await jump.fill(String(index))
    await paging.getByRole('button', { name: 'Go', exact: true }).click()
    await expect(inspector(page).getByRole('button', { name: 'Inspect [' + index + ']', exact: true })).toBeVisible()
    await inspector(page).getByRole('button', { name: 'Reveal index ' + index, exact: true }).click()
    const slot = array.id + ':element:' + index
    await ready(page)
    expect(await page.evaluate(() => window.__ggjavaezQA!.selection()?.id)).toBe(slot)
    selections.push(slot)
  }
  const slot = selections.at(-1)!
  await focus(page, slot)
  await navigate(page)
  const windows = []
  for (const [cursor, exact] of [[array.read + 1, '17'], [array.write + 1, '29'], [array.write, '17'], [array.write + 1, '29']] as const) {
    await seek(page, cursor)
    const observed = await page.evaluate(({ id, index }) => {
      const world = window.__ggjavaezWorld!, node = world.scene().entities[id]!
      const cellWindow = world.plan().cellWindows.get(id)!
      const value = node.kind === 'array' ? node.cells.find(cell => cell.index === index)?.value.exact : null
      return { selection: world.selection()?.id, value, visible: cellWindow.visible, hidden: cellWindow.hiddenCount,
        mandatory: cellWindow.budgetOverflow.mandatoryCount, nominal: cellWindow.budgetOverflow.nominal, renderer: world.renderer() }
    }, { id: array.id, index: ARRAY_INDEX })
    expect(observed.selection).toBe(slot)
    expect(observed.value).toBe(exact)
    expect(observed.visible).toContain(ARRAY_INDEX)
    expect(observed.visible.length).toBeLessThanOrEqual(Math.max(observed.mandatory, observed.nominal))
    expect(observed.visible.length + observed.hidden).toBe(ARRAY_LENGTH)
    windows.push({ cursor, ...observed })
  }
  await exitFocus(page)
  await closeInspector(page)
  await seek(page, maximum)
  return { selections, windows }
}

async function inspectCollections(page: Page) {
  const nodes = await page.evaluate(() => Object.values(window.__ggjavaezWorld!.scene().entities)
    .filter(node => node.kind === 'collection').map(node => ({
      id: node.id, kind: node.collectionKind, size: node.size, captured: node.recordedEntries,
      first: node.entries[0], final: node.entries.at(-1),
    })))
  expect(nodes.map(node => node.kind).sort()).toEqual([...collectionKinds].sort())
  const samples = []
  for (const node of nodes) {
    await home(page)
    await selectBody(page, node.id)
    await focus(page, node.id)
    const list = inspector(page).getByRole('list', { name: 'Recorded collection members', exact: true })
    const final = node.captured
    for (const [position, entry] of [[1, node.first], [final, node.final]] as const) {
      await list.evaluate((element, index) => {
        const item = element.querySelector('[role="listitem"]')!
        element.scrollTop = (index - 1) * item.getBoundingClientRect().height
      }, position)
      const row = list.getByRole('listitem').and(list.locator('[aria-posinset="' + position + '"]'))
      await expect(row).toHaveAttribute('aria-setsize', String(final))
      const value = node.kind === 'Map' ? 'Entry ' + position + ' value' : 'Member ' + position
      const labels = [{ name: value, exact: entry!.value.exact }]
      if (entry!.key) labels.unshift({ name: 'Entry ' + position + ' key', exact: entry!.key.exact })
      for (const label of labels) {
        await row.getByRole('button', { name: 'Inspect ' + label.name, exact: true }).click()
        const detail = inspector(page).getByRole('region', { name: 'Captured ' + label.name, exact: true })
        expect(await detail.locator('pre').textContent()).toBe(label.exact)
        await detail.getByRole('button', { name: 'Close detail', exact: true }).click()
      }
    }
    const rows = await list.getByRole('listitem').count()
    expect(node.size).toBe(COLLECTION_SIZE)
    expect(rows).toBeLessThanOrEqual(20)
    const renderer = await page.evaluate(() => window.__ggjavaezWorld!.renderer())
    samples.push({ kind: node.kind, size: node.size, captured: final, rows, renderer })
    await exitFocus(page)
    await closeInspector(page)
  }
  return samples
}

async function inspectExceptions(page: Page, maximum: number) {
  const evidence = await page.evaluate(() => ({
    entries: Object.values(window.__ggjavaezWorld!.scene().entities).filter(entity => entity.kind === 'object' && entity.title === 'Entry').length,
    marks: window.__ggjavaezWorld!.recordedEvents().flatMap(event =>
      event.type === 'THROW_EXCEPTION' || event.type === 'UNWIND_EXCEPTION' || event.type === 'CATCH_EXCEPTION'
        ? [{ eventId: event.eventId, seq: event.seq, type: event.type }] : []),
  }))
  expect(evidence.entries).toBe(DENSE_OBJECTS)
  expect(evidence.marks.filter(mark => mark.type === 'THROW_EXCEPTION')).toHaveLength(2)
  const snapshots = []
  for (const mark of evidence.marks) {
    await seek(page, mark.seq + 1)
    await home(page)
    const path = await page.evaluate(() => {
      const world = window.__ggjavaezWorld!, panel = world.plan().exceptionPanel
      return { current: panel?.content.current, exception: panel?.content.exceptionId,
        curves: world.plan().curves.length, renderer: world.renderer() }
    })
    expect(path.current?.eventId).toBe(mark.eventId)
    snapshots.push(path)
  }
  await seek(page, maximum)
  await openDock(page, 'Errors')
  await expect(page.getByRole('region', { name: 'Error Explorer', exact: true })).toContainText('terminal validation')
  await dismissTools(page)
  return { ...evidence, snapshots }
}

async function inspectIo(page: Page) {
  const view = await page.evaluate(() => {
    const world = window.__ggjavaezWorld!, scene = world.scene()
    return { ports: scene.io.map(port => ({ id: port.id, lines: port.lines, preview: port.preview })),
      labelCount: world.ioText().length }
  })
  for (const [name, rows] of [['stdout', stdoutRows], ['stderr', stderrRows]] as const) {
    const port = view.ports.find(item => item.id === name)
    expect(port?.lines).toBe(rows.length)
    expect(port?.preview).toBe(rows.at(-1)!.slice(0, 60) + '…')
  }
  await openDock(page, 'Console')
  const panel = page.getByLabel('Program console', { exact: true })
  await panel.getByText('Full process output', { exact: true }).click()
  for (const [name, rows] of [['stdout', stdoutRows], ['stderr', stderrRows]] as const) {
    const region = panel.getByRole('region', { name, exact: true })
    for (const index of [1, rows.length]) {
      await region.getByRole('spinbutton', { name: name + ' row', exact: true }).fill(String(index))
      await region.getByRole('button', { name: 'Go', exact: true }).click()
      await region.getByRole('button', { name: 'Open ' + name + ' row ' + index, exact: true }).click()
      expect(await region.getByRole('region', { name: 'Exact ' + name + ' row ' + index, exact: true }).locator('pre').textContent()).toBe(rows[index - 1])
    }
  }
  await panel.getByRole('button', { name: 'Open Submitted input row 1', exact: true }).click()
  expect(await panel.getByRole('region', { name: 'Exact Submitted input row 1', exact: true }).locator('pre').textContent()).toBe(inputValue + '\n')
  await dismissTools(page)
  return view
}

test('active mixed lifecycle soak with equivalent Array Home CDP checkpoints', async ({ page, request, context }) => {
  const duration = countEnv('VJ_PASS6_SOAK_MS', 600_000)
  const minimum = countEnv('VJ_PASS6_MIN_CYCLES', 4)
  test.setTimeout(Math.max(480_000, duration + 210_000))
  const log = receipts(page)
  const rotating = ['large-array', 'collections', 'exceptions', 'io'] as const
  const ids = await setup(page, request, ['array', 'dense', ...rotating])
  const cdp = await context.newCDPSession(page)
  const sessions = new Set<string>()
  let baseline: World | undefined
  let cycles = 0
  let heapSnapshotMs = 0
  const failures: string[] = []
  const start = performance.now()
  async function act<T>(phase: string, action: () => Promise<T>) {
    try {
      const proof = await action()
      await log.write({ cycle: cycles, phase, proof })
      return proof
    } catch (error) {
      const failure = String(error)
      failures.push(cycles + ' ' + phase + ': ' + failure)
      await log.write({ cycle: cycles, phase, failure })
      await page.screenshot({ path: test.info().outputPath('cycle-' + cycles + '-' + phase + '-failure.png'), timeout: 5000 })
        .catch(() => undefined)
      const session = await currentSession(request)
      if (session && Object.values(ids).includes(session.projectId) && active.has(session.phase)) {
        await request.post('/api/execution/' + session.id + '/stop', { data: {} })
      }
      return undefined
    }
  }
  async function fresh(kind: Project) {
    const result = await run(page, request, kind, ids[kind]!)
    expect(sessions.has(result.id)).toBe(false)
    sessions.add(result.id)
    await log.write({ cycle: cycles, run: kind, ...result })
    return result
  }
  async function arraySample(label: string) {
    const result = await fresh('array')
    await arrayCheckpoint(page)
    const measured = await log.checkpoint(cdp, label, { cycle: cycles, ...result })
    expect(measured.state.quality).toBe('INTERACTIVE')
    if (baseline) equivalent(baseline, measured)
    else baseline = measured
    if (cycles === 1 || cycles === 5 || label === 'mixed-final') heapSnapshotMs += await snapshotHeap(cdp, label)
    return result
  }
  try {
    while (performance.now() - start - heapSnapshotMs < duration || cycles < minimum) {
      cycles++
      const array = await act('array-home', () => arraySample('mixed-' + cycles))
      if (array) {
        await act('timeline', () => timeline(page, array.normalized, cycles))
        await act('array-focus', async () => {
          await arrayCheckpoint(page)
          const id = await page.evaluate(() => Object.values(window.__ggjavaezWorld!.scene().entities)
            .find(entity => entity.kind === 'array' && entity.length === 5)!.id)
          await selectEntity(page, id)
          await button(page, 'Reveal index 0').click()
          await focus(page, id + ':element:0')
          await navigate(page)
          await exitFocus(page)
          await closeInspector(page)
          await home(page)
        })
        await act('quality', async () => {
          const availability = await page.evaluate(() => window.__ggjavaezWorld!.quality().availability)
          if (availability.enabled) await qualityTrip(page)
          return availability
        })
      }
      const dense = await act('dense-run', () => fresh('dense'))
      if (dense) await act('dense-zoom-and-focus', () => denseActions(page))
      const kind = rotating[(cycles - 1) % rotating.length]
      const scale = await act(kind + '-run', () => fresh(kind))
      if (scale) await act<unknown>(kind + '-inspect', () => {
        switch (kind) {
          case 'large-array': return inspectLargeArray(page, scale.normalized)
          case 'collections': return inspectCollections(page)
          case 'exceptions': return inspectExceptions(page, scale.normalized)
          case 'io': return inspectIo(page)
        }
      })
    }
    await act('final-array-home', () => arraySample('mixed-final'))
  } finally {
    await log.write({ soakMs: Math.round(performance.now() - start - heapSnapshotMs), durationTargetMs: duration,
      heapSnapshotMs: Math.round(heapSnapshotMs), cycles, sessions: [...sessions], failures })
    await cdp.detach()
    await log.finish()
  }
  expect(failures, 'Every scheduled product interaction must succeed').toEqual([])
})
