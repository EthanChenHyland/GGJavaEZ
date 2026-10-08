import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { seek } from '../src/runtime/seek'

// Opt-in companion to the fresh-JVM suite: these views use its exact retained
// sessions, never a synthetic scene or another Java invocation.
for (const name of ['02-arrays-cycles-collections', '04-statics-and-exceptions', '07-observed-wide-and-deep', '08-many-lazy-statics']) {
  test(`retained torture detail: ${name}`, async ({ page, request }) => {
    test.skip(process.env.VJ_PHASE5_5_DETAILS !== '1', 'Run immediately after fresh torture fixtures while their actual sessions are retained')
    test.setTimeout(120000)
    const saved = JSON.parse(await readFile(`.ggjavaez/qa/v12-p5_5/payloads/${name}.json`, 'utf8')) as ExecutionSession
    const endpoint = `/api/execution/${saved.id}`
    const response = await request.get(endpoint)
    expect(response.ok()).toBe(true)
    expect((await response.json()).id).toBe(saved.id)
    const trace = normalizeTrace(saved.rawEvents, saved.sourceManifest, { status: saved.terminalStatus!, exitCode: saved.exitCode, diagnostic: saved.diagnostic, recording: saved.recording }).trace
    const state = seek(trace, trace.events.length)
    const objects = Object.values(state.objects)
    const subjects: Array<{ label: string; id: string; text?: string }> = []
    if (name.startsWith('02')) {
      const huge = objects.find(object => object.array?.length === 10001)!
      const sparse = huge.array!.sparseElements![10000]
      expect(sparse.value).toEqual({ kind: 'primitive', javaType: 'int', value: 73 })
      subjects.push({ label: 'large-array', id: huge.id, text: '10001' }, { label: 'sparse-index-10000', id: sparse.id, text: '73' })
      subjects.push({ label: 'ragged-array', id: objects.find(object => object.array?.elementType.endsWith('$Node[]') && object.array.length === 5)!.id })
      subjects.push({ label: 'collection-1000', id: objects.find(object => object.library?.size === 1000)!.id, text: 'bounded preview' })
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
    const output = `.ggjavaez/qa/v12-p5_5/details/${name}`
    await mkdir(output, { recursive: true })
    await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), saved.projectId)
    await page.route('**/api/execution/current?transport=delta', async route => route.fulfill({ response: await route.fetch({ url: `http://127.0.0.1:5173${endpoint}?transport=delta` }) }))
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto('/ide')
    const slider = page.getByRole('slider', { name: 'Scrub execution' })
    await expect(slider).toHaveAttribute('max', String(trace.events.length), { timeout: 60000 })
    await slider.fill(String(trace.events.length))
    const close = page.getByRole('button', { name: 'Collapse bottom panel', exact: true }); if (await close.count()) await close.click()
    const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
    for (const subject of subjects) {
      const search = page.getByRole('searchbox', { name: 'Search runtime entities' })
      if (await search.count()) await search.fill(subject.id)
      await picker.selectOption(subject.id)
      const inspector = page.getByRole('complementary', { name: 'Runtime inspector' })
      if (subject.text) await expect(inspector).toContainText(subject.text)
      await inspector.getByRole('button', { name: 'Focus', exact: true }).click(); await page.waitForTimeout(700)
      await page.screenshot({ path: `${output}/${subject.label}-1440x900.png` })
      if (name.startsWith('02')) {
        await page.setViewportSize({ width: 760, height: 900 })
        await inspector.getByRole('button', { name: 'Focus', exact: true }).click(); await page.waitForTimeout(700)
        await page.screenshot({ path: `${output}/${subject.label}-760x900.png` })
        await page.setViewportSize({ width: 1440, height: 900 })
      }
      await page.getByRole('button', { name: 'Return to world', exact: true }).click()
      if (await search.count()) await search.fill('')
    }
    expect(errors).toEqual([])
    await writeFile(`${output}/proof.json`, JSON.stringify({ sessionId: saved.id, subjects, errors, method: 'Exact fresh-JVM sessions and production normalization, replay and rendering; no new Java.' }, null, 2) + '\n')
  })
}
