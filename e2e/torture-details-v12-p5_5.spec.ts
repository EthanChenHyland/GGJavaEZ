import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { seek } from '../src/runtime/seek'
import { browserErrors, home, ready, seekCursor } from './reference/harness'
import { clearTortureSelection, pickTortureEntity } from './reference/tortureNavigation'

const payloads = process.env.VJ_TORTURE_BROWSER_PAYLOADS ?? '.ggjavaez/qa/v12-p5_5/payloads'
const captures = process.env.VJ_TORTURE_DETAILS_OUTPUT ?? '.ggjavaez/qa/v12-p5_5/details'

// Opt-in companion to the fresh-JVM suite: these views use its exact retained
// sessions, never a synthetic scene or another Java invocation.
for (const name of ['02-arrays-cycles-collections', '04-statics-and-exceptions', '07-observed-wide-and-deep', '08-many-lazy-statics']) {
  test(`retained torture detail: ${name}`, async ({ page, request }) => {
    test.skip(process.env.VJ_PHASE5_5_DETAILS !== '1', 'Run immediately after fresh torture fixtures while their actual sessions are retained')
    test.setTimeout(240000)
    const saved = JSON.parse(await readFile(`${payloads}/${name}.json`, 'utf8')) as ExecutionSession
    const endpoint = `/api/execution/${saved.id}`
    const response = await request.get(endpoint)
    expect(response.ok()).toBe(true)
    expect(await response.json()).toMatchObject({ id: saved.id, projectId: saved.projectId, phase: saved.phase })
    const trace = normalizeTrace(saved.rawEvents, saved.sourceManifest, { status: saved.terminalStatus!, exitCode: saved.exitCode, diagnostic: saved.diagnostic, recording: saved.recording }).trace
    const state = seek(trace, trace.events.length)
    const objects = Object.values(state.objects)
    const subjects: Array<{ label: string; id: string; text?: string; arrayId?: string; index?: number; collectionSize?: number }> = []
    if (name.startsWith('02')) {
      const huge = objects.find(object => object.array?.length === 10001)!
      const sparse = huge.array!.sparseElements![10000]
      expect(sparse.value).toEqual({ kind: 'primitive', javaType: 'int', value: 73 })
      subjects.push({ label: 'large-array', id: huge.id, text: '10001' }, { label: 'sparse-index-10000', id: sparse.id, text: '73', arrayId: huge.id, index: 10000 })
      subjects.push({ label: 'ragged-array', id: objects.find(object => object.array?.elementType.endsWith('$Node[]') && object.array.length === 5)!.id })
      subjects.push({ label: 'collection-1000', id: objects.find(object => object.library?.size === 1000)!.id, collectionSize: 1000 })
      subjects.push({ label: 'cyclic-shared', id: objects.find(object => Object.values(object.fields).some(field => field.value.kind === 'reference' && field.value.objectId === object.id))!.id })
    } else if (name.startsWith('04')) {
      subjects.push({ label: 'wrapped-exception', id: objects.find(object => object.className === 'java.lang.IllegalStateException')!.id })
    } else if (name.startsWith('07')) {
      const frames = Object.values(state.frames)
      const deepest = frames.reduce((a, b) => a.depth > b.depth ? a : b)
      subjects.push({ label: 'deepest-observed', id: deepest.id }, { label: 'wide-leaf', id: frames.filter(frame => frame.methodName === 'leaf').at(-1)!.id })
    } else {
      const classes = Object.values(state.classes!)
      expect(classes.length).toBeGreaterThanOrEqual(24)
      subjects.push({ label: 'last-lazy-static', id: classes.find(owner => owner.className.endsWith('$Family24'))!.id })
    }
    const output = `${captures}/${name}`
    await mkdir(output, { recursive: true })
    await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), saved.projectId)
    // Select the retained real bridge session during hydration. Subsequent
    // event streaming and raw backlog fetches still use its native endpoints.
    await page.route('**/api/execution/current?transport=delta', async route => {
      const url = new URL(`${endpoint}?transport=delta`, route.request().url())
      await route.fulfill({ response: await route.fetch({ url: url.href }) })
    })
    const errors = browserErrors(page)
    await page.goto('/?qa=1')
    await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
    await page.waitForFunction(id => document.querySelector('[data-project-id]')?.getAttribute('data-project-id') === id, saved.projectId)
    await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld?.scene().recordingId), { timeout: 60000 }).toBe(`execution:${saved.id}`)
    const slider = page.getByRole('slider', { name: 'Recorded execution position', exact: true })
    await expect(slider).toHaveAttribute('aria-valuemax', String(trace.events.length), { timeout: 60000 })
    await seekCursor(page, trace.events.length)
    const dock = page.getByRole('navigation', { name: 'Dock', exact: true })
    const expanded = dock.locator('button[data-dock-tool][aria-expanded="true"]')
    if (await expanded.count()) await expanded.click()
    const inspector = page.getByRole('complementary', { name: 'Selection inspector', exact: true })
    const observations = []
    const widths = name.startsWith('02') ? [1440, 760] : [1440]
    for (const subject of subjects) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        if (width === widths[0]) {
          await clearTortureSelection(page)
          await home(page)
          await test.step(`Select ${subject.label} at ${width}×900`, () => pickTortureEntity(page, subject.arrayId ?? subject.id))
          if (subject.index !== undefined) {
            const field = inspector.getByRole('spinbutton', { name: 'Recorded values index', exact: true })
            await field.fill(String(subject.index))
            await field.press('Enter')
            await inspector.getByRole('button', { name: `Reveal index ${subject.index}`, exact: true }).click()
            await ready(page)
          }
        }
        await expect.poll(() => page.evaluate(() => window.__ggjavaezQA!.selection()?.id)).toBe(subject.id)
        if (subject.text) await expect(inspector).toContainText(subject.text)
        if (subject.collectionSize) {
          const status = await inspector.locator('p').first().textContent()
          const numbers = status?.match(/^size (\d+) · (\d+) entries captured · (\d+) not recorded$/)
          expect(numbers).toBeTruthy()
          const [, size, captured, omitted] = numbers!.map(Number)
          expect(size).toBe(subject.collectionSize)
          expect(captured).toBeGreaterThan(0)
          expect(captured).toBeLessThan(size)
          expect(captured + omitted).toBe(size)
        }
        await inspector.getByRole('button', { name: 'Focus selection', exact: true }).click()
        await ready(page)
        await expect.poll(() => page.evaluate(() => window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(subject.id)
        await page.waitForTimeout(700)
        await page.screenshot({ path: `${output}/${subject.label}-${width}x900.png` })
        observations.push({ id: subject.id, width, pose: await page.evaluate(() => window.__ggjavaezQA!.cameraPose()) })
        await inspector.getByRole('button', { name: 'Return to World', exact: true }).click()
        await ready(page)
      }
    }
    await expect(slider).toHaveAttribute('aria-valuenow', String(trace.events.length))
    const retained = await request.get(endpoint)
    expect(retained.ok()).toBe(true)
    expect((await retained.json()).id).toBe(saved.id)
    expect(errors).toEqual([])
    await writeFile(`${output}/proof.json`, JSON.stringify({ sessionId: saved.id, subjects, observations, errors, method: 'Exact fresh-JVM sessions and production normalization, replay and rendering; no new Java.' }, null, 2) + '\n')
  })
}
