/* global process, localStorage, window, PerformanceObserver, WebGLRenderingContext, WebGL2RenderingContext, performance, fetch, document, console, setTimeout, URL, requestAnimationFrame */
import { chromium, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { performance as clock } from 'node:perf_hooks'

// Run only after the lead has released the browser-test/performance lock:
// node scripts/measure-m8.mjs --authorized
// Replays accepted captures through browser-local routes. Never starts a server,
// compiles Java, imports a project, or sends a request to the execution bridge.
if (!process.argv.includes('--authorized')) {
  throw new Error('Await lead authorization, then use --authorized. Browser/performance work is currently gated.')
}
const base = process.env.M8_BASE_URL ?? 'http://127.0.0.1:5173'
const fixturePath = resolve('docs/checkpoints/debug-v7/performance.json')
const output = resolve(process.env.M8_PERF_OUTPUT ?? 'docs/checkpoints/gui-v8/performance.json')
const fixtureBytes = await readFile(fixturePath)
const accepted = JSON.parse(fixtureBytes.toString('utf8'))
const durationMs = 3000
const viewport = { width: 1440, height: 900 }
const fixtures = ['person', 'recursion']
const layouts = ['Compact layout-only baseline', 'Visualize', 'Runtime Focus']
const compactViewport = { width: 752, height: 257 }
for (const name of fixtures) {
  const payload = accepted.fixtures?.[name]?.payload
  if (payload?.status !== 'complete' || !payload.build?.success || !payload.rawEvents?.length || !payload.sourceManifest?.sources?.length) {
    throw new Error(`Accepted cached ${name} capture missing; no live JVM fallback is permitted.`)
  }
}

const report = {
  version: 1,
  measuredAt: new Date().toISOString(),
  environment: { browser: 'installed Chrome headless', frontend: 'Vite development server', base, viewport, deviceScaleFactor: 1, quality: 'balanced' },
  provenance: { fixturePath, sha256: createHash('sha256').update(fixtureBytes).digest('hex'), recorderCommit: accepted.recorderCommit,
    method: 'Accepted M7 Person/recursion payloads; all /api routes fulfilled locally or blocked; no bridge/JVM/server mutations' },
  method: {
    durationMs,
    scenes: fixtures,
    layouts,
    baseline: { label: layouts[0], renderViewport: compactViewport,
      method: 'Same current frontend and renderer, browser-only CSS constrains the Spatial render viewport to 752×257 at 1440×900. Dimension-equivalent compact baseline, NOT historical M7 source or an M7 performance rerun.',
      cache: 'One warmed context/renderer per fixture is reused sequentially across compact, Visualize, then Focus; accepted trace and render quality remain identical. Fixed ordering is not a controlled historical benchmark.' },
    phases: ['playback', 'orbit', 'idle'],
    renders: 'Three WebGLRenderer.render completions with one or more actual WebGL draw commands; timestamps from performance.now()',
    cadence: 'WebGL render submissions/draw commands and separately sampled RAF callbacks are software cadence, not physical display/GPU presentation or GPU percentiles',
    cpu: 'JavaScript renderer submission wall time including WebGL calls, not GPU completion time',
    idle: 'Demand rendering is expected to stop; zero idle draws is success, not zero interactive FPS',
    scrub: 'Eight fixed forward/reverse slider seeks per scene/layout; wall-clock roundtrip includes Playwright fill and two subsequent RAF callbacks. This is not physical presentation or synchronized-label readiness.',
    scope: 'Warm representative playback and pointer orbit, one 3-second sample per phase/layout/scene; compact comparison isolates viewport layout on current code. No historical-source or hardware-wide performance claim.',
  },
  samples: [], scrubSamples: [], errors: [], blockedApiRequests: [],
}

function intervalsFor(timestamps) {
  const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]).sort((a, b) => a - b)
  return { count: intervals.length, median: intervals.length ? intervals[Math.floor(intervals.length / 2)] : null,
    max: intervals.length ? intervals.at(-1) : null,
    over25: intervals.filter(value => value > 25).length, over50: intervals.filter(value => value > 50).length }
}

function summarize(sample) {
  const frames = sample.frames
  const submit = frames.map(frame => frame.submitMs)
  const elapsedMs = sample.end - sample.start
  return { ...sample, elapsedMs, renderCount: frames.length, rendersPerSecond: frames.length * 1000 / elapsedMs,
    intervalsMs: intervalsFor(frames.map(frame => frame.at)),
    raf: { count: sample.rafTimestamps.length, callbacksPerSecond: sample.rafTimestamps.length * 1000 / elapsedMs,
      intervalsMs: intervalsFor(sample.rafTimestamps), note: 'Observation callbacks only; idle RAF callbacks do not imply WebGL draws.' },
    submissionMs: { mean: submit.length ? submit.reduce((a, b) => a + b, 0) / submit.length : null,
      max: submit.length ? Math.max(...submit) : null },
    drawCommands: frames.reduce((sum, frame) => sum + frame.drawCommands, 0),
  }
}

async function openFixture(browser, name) {
  const { id, payload } = accepted.fixtures[name]
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference', serviceWorkers: 'block' })
  const sources = payload.sourceManifest.sources
  const project = { id, name: `M8 cached ${name}`, createdAt: '2026-09-28T00:00:00.000Z' }
  await context.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()
    let json
    if (method === 'GET' && pathname === '/api/projects') json = [project]
    else if (method === 'GET' && pathname === '/api/health') json = { jdk: payload.build.jdk }
    else if (method === 'GET' && ['/api/runs/current', '/api/debug/current'].includes(pathname)) json = null
    else if (method === 'GET' && pathname === `/api/projects/${id}/tree`) {
      json = sources.map(source => ({ path: source.fileId, name: source.fileId, kind: 'file' }))
    } else if (method === 'GET' && pathname === `/api/projects/${id}/files`) {
      const source = sources.find(source => source.fileId === url.searchParams.get('path'))
      if (source) json = { path: source.fileId, content: source.content, revision: source.sha256 }
    } else if (method === 'POST' && pathname === `/api/projects/${id}/visualize`) json = payload
    if (json !== undefined) return route.fulfill({ json })
    report.blockedApiRequests.push({ fixture: name, method, pathname })
    await route.fulfill({ status: 409, json: { error: 'M8 measurement blocks uncached bridge requests' } })
  })
  await context.addInitScript(({ id }) => {
    localStorage.setItem('ggjavaez:project', id)
    localStorage.setItem('ggjavaez:m8:explorer', 'closed')
    window.__m8 = { active: null, result: null, draws: 0, longTasks: [] }
    new PerformanceObserver(list => {
      window.__m8.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, ms: entry.duration })))
    }).observe({ type: 'longtask', buffered: true })
    for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        if (!Object.hasOwn(Type.prototype, method)) continue
        const original = Type.prototype[method]
        Type.prototype[method] = function (...args) {
          window.__m8.draws++
          return original.apply(this, args)
        }
      }
    }
  }, { id })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push({ fixture: name, message: error.message }))
  await page.goto(`${base}/ide`)
  await page.locator('.monaco-editor').waitFor()
  await page.getByRole('button', { name: 'Visualize', exact: true }).click()
  await page.locator('.app-shell--embedded').waitFor()
  await page.getByRole('button', { name: 'Spatial', exact: true }).click()
  await page.getByRole('combobox', { name: 'Rendering quality' }).selectOption('balanced')
  // Resolve the exact Fiber instance used by this Vite page. Renderer-level
  // sampling excludes global animation callbacks and frames with no WebGL draw.
  const trace = await page.evaluate(async payload => {
    const source = await (await fetch('/src/scene/RuntimeCanvas.tsx')).text()
    const fiberUrl = source.match(/from\s+["']([^"']*@react-three_fiber[^"']*)["']/)?.[1]
    if (!fiberUrl) throw new Error('Could not locate the current Vite Fiber module')
    const { _roots } = await import(fiberUrl)
    if (_roots.size !== 1) throw new Error(`Expected exactly one runtime Canvas, got ${_roots.size}`)
    const state = [..._roots.values()][0].store.getState()
    const renderer = state.gl
    const original = renderer.render
    renderer.render = function (...args) {
      const data = window.__m8
      const sample = data.active
      const start = performance.now()
      const before = data.draws
      const result = original.apply(this, args)
      const end = performance.now()
      const drawCommands = data.draws - before
      if (sample && drawCommands && start < sample.deadline) {
        sample.frames.push({ at: start, submitMs: end - start, drawCommands,
          triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures })
      }
      return result
    }
    window.__m8.renderer = renderer
    const gl = renderer.getContext()
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    window.__m8.adapter = { version: gl.getParameter(gl.VERSION),
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null }
    const { normalizeTrace } = await import('/src/instrumentation/normalize.ts')
    return normalizeTrace(payload.rawEvents, payload.sourceManifest, payload, 'm8-measure').trace
  }, payload)
  const guided = page.getByRole('button', { name: 'Guided execution', exact: true })
  await expect(guided).toHaveAttribute('aria-pressed', 'true')
  const startCursor = name === 'person'
    ? trace.events.findIndex(event => event.type === 'ALLOCATE_OBJECT') + 1
    : trace.events.map((event, index) => ({ event, cursor: index + 1 })).filter(({ event }) => event.type === 'ENTER_METHOD' && event.methodName === 'factorial')[1]?.cursor
  const orbitCursor = name === 'person'
    ? trace.events.findIndex(event => event.type === 'SET_FIELD' && event.label.includes('age')) + 1
    : trace.events.map((event, index) => ({ event, cursor: index + 1 })).filter(({ event }) => event.type === 'ENTER_METHOD' && event.methodName === 'factorial').at(-1)?.cursor
  if (!startCursor || !orbitCursor || trace.events.length - startCursor < 5) throw new Error(`Insufficient representative ${name} cached trace`)
  // Warm full representative geometry/text before comparing viewport layouts.
  await page.getByRole('slider', { name: 'Scrub execution', exact: true }).fill(String(orbitCursor))
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.waitForTimeout(1300)
  return { page, context, startCursor, orbitCursor, traceEvents: trace.events.length, rawEvents: payload.rawEvents.length }
}

async function beginWindow(page, fixture, layout, phase) {
  await page.evaluate(({ fixture, layout, phase, durationMs }) => {
    const data = window.__m8
    if (data.active) throw new Error('Overlapping measurement windows')
    data.result = null
    const start = performance.now()
    data.active = { fixture, layout, phase, start, deadline: start + durationMs, frames: [], rafTimestamps: [],
      cursorStart: document.querySelector('.vj-timeline__count')?.textContent }
    const sample = data.active
    const observeRaf = timestamp => {
      if (data.active !== sample || performance.now() >= sample.deadline) return
      sample.rafTimestamps.push(timestamp)
      requestAnimationFrame(observeRaf)
    }
    requestAnimationFrame(observeRaf)
    setTimeout(() => {
      const sample = data.active
      sample.end = performance.now()
      sample.cursorEnd = document.querySelector('.vj-timeline__count')?.textContent
      sample.longTasks = data.longTasks.filter(task => task.start < sample.end && task.start + task.ms >= sample.start)
      data.active = null
      data.result = sample
    }, durationMs)
  }, { fixture, layout, phase, durationMs })
}

async function collectWindow(page) {
  await page.waitForFunction(() => window.__m8.result !== null, undefined, { timeout: 5000 })
  const sample = await page.evaluate(() => window.__m8.result)
  return summarize(sample)
}

async function scrubRoundtrips(page, fixture, layout, cursors, traceEvents) {
  const samples = []
  const slider = page.getByRole('slider', { name: 'Scrub execution', exact: true })
  for (const cursor of cursors) {
    const beforeDraws = await page.evaluate(() => window.__m8.draws)
    const start = clock.now()
    await slider.fill(String(cursor))
    const observed = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({
      draws: window.__m8.draws, cursor: document.querySelector('.vj-timeline__count')?.textContent,
    })))))
    const roundtripMs = clock.now() - start
    if (observed.cursor !== `${cursor} / ${traceEvents}`) throw new Error(`Scrub cursor mismatch: expected ${cursor} / ${traceEvents}, got ${observed.cursor}`)
    samples.push({ cursor, roundtripMs, drawCommandsDuringRoundtrip: observed.draws - beforeDraws })
  }
  const sorted = samples.map(sample => sample.roundtripMs).sort((a, b) => a - b)
  return { fixture, layout, samples, count: samples.length, medianMs: sorted[Math.floor(sorted.length / 2)], maxMs: sorted.at(-1),
    method: 'Slider fill + two RAF callbacks including automation roundtrip. Draw count is evidence of submission only, not physical presentation.' }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const name of fixtures) {
    const { page, context, startCursor, orbitCursor, traceEvents, rawEvents } = await openFixture(browser, name)
    try {
      for (const layout of layouts) {
        if (layout === layouts[0]) {
          await page.addStyleTag({ content: `
            .ide-runtime-live .app-shell--embedded .world-panel { width:${compactViewport.width}px !important; }
            .ide-runtime-live .app-shell--embedded .world-panel .spatial-view {
              inset:auto !important; top:48px !important; left:0 !important;
              width:${compactViewport.width}px !important; height:${compactViewport.height}px !important;
              max-width:none !important; max-height:none !important;
            }
          ` }).then(style => style.evaluate(element => { element.id = 'm8-compact-layout-only-baseline' }))
        } else {
          await page.evaluate(() => document.getElementById('m8-compact-layout-only-baseline')?.remove())
        }
        if (layout === 'Runtime Focus') await page.getByRole('button', { name: 'Expand runtime', exact: true }).click()
        const slider = page.getByRole('slider', { name: 'Scrub execution', exact: true })
        const follow = page.getByRole('button', { name: 'Follow execution', exact: true })
        if (await follow.getAttribute('aria-pressed') !== 'true') await follow.click()
        await slider.fill(String(startCursor))
        await page.getByRole('button', { name: 'Overview', exact: true }).click()
        await page.waitForTimeout(1300)
        await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('1')
        await beginWindow(page, name, layout, 'playback')
        await page.getByRole('button', { name: 'Play execution', exact: true }).click()
        const playback = await collectWindow(page)
        await page.getByRole('button', { name: 'Pause execution', exact: true }).click()
        if (playback.cursorStart === playback.cursorEnd) throw new Error(`${name}/${layout}: playback cursor did not advance`)
        report.samples.push(playback)

        await slider.fill(String(orbitCursor))
        await page.getByRole('button', { name: 'Overview', exact: true }).click()
        await page.waitForTimeout(1300)
        const canvas = page.locator('.spatial-view canvas')
        const box = await canvas.boundingBox()
        if (!box || box.width < 300 || box.height < 150) throw new Error('Runtime canvas is too small for the bounded orbit')
        const x = box.x + box.width * 0.52, y = box.y + box.height * 0.55
        await page.mouse.move(x, y)
        await page.mouse.down()
        await beginWindow(page, name, layout, 'orbit')
        const orbitStart = clock.now()
        // Oscillating horizontal drag keeps geometry in view; actual automation
        // pacing is recorded, rather than claiming a fixed pointer sample rate.
        let moves = 0
        while (clock.now() - orbitStart < durationMs) {
          const elapsed = clock.now() - orbitStart
          await page.mouse.move(x + Math.sin(elapsed / 700) * 70, y + Math.sin(elapsed / 1100) * 15)
          moves++
          await page.waitForTimeout(50)
        }
        await page.mouse.up()
        const orbit = await collectWindow(page)
        orbit.pointerMoves = moves
        if (!orbit.renderCount || orbit.cursorStart !== orbit.cursorEnd) throw new Error(`${name}/${layout}: orbit was not a stable paused runtime render sample`)
        report.samples.push(orbit)

        await page.waitForTimeout(1300) // Exclude damped camera settling from idle.
        await beginWindow(page, name, layout, 'idle')
        report.samples.push(await collectWindow(page))
        const geometry = await page.evaluate(() => {
          const canvas = document.querySelector('.spatial-view canvas')
          const box = canvas.getBoundingClientRect()
          return { cssWidth: box.width, cssHeight: box.height, drawingWidth: canvas.width, drawingHeight: canvas.height,
            adapter: window.__m8.adapter, visibility: document.visibilityState }
        })
        for (const sample of report.samples.filter(sample => sample.fixture === name && sample.layout === layout)) {
          Object.assign(sample, { geometry, traceEvents, rawEvents })
        }
        if (layout === layouts[0] && (Math.abs(geometry.cssWidth - compactViewport.width) > 1 || Math.abs(geometry.cssHeight - compactViewport.height) > 1)) {
          throw new Error(`Compact baseline viewport mismatch: ${JSON.stringify(geometry)}`)
        }
        report.scrubSamples.push(await scrubRoundtrips(page, name, layout,
          [0, startCursor, orbitCursor, traceEvents, orbitCursor, startCursor, 0, orbitCursor], traceEvents))
        console.log(JSON.stringify({ fixture: name, layout, samples: report.samples.filter(sample => sample.fixture === name && sample.layout === layout)
          .map(({ phase, renderCount, rendersPerSecond, intervalsMs, submissionMs }) => ({ phase, renderCount, rendersPerSecond, intervalsMs, submissionMs })) }))
      }
    } finally { await context.close() }
  }
  report.comparison = fixtures.map(fixture => ({ fixture,
    label: 'Same current frontend/layout-only comparison; compact viewport is not historical M7 source',
    layouts: layouts.map(layout => ({ layout,
      windows: report.samples.filter(sample => sample.fixture === fixture && sample.layout === layout)
        .map(({ phase, geometry, renderCount, rendersPerSecond, intervalsMs, submissionMs, drawCommands, raf }) => ({ phase, geometry, renderCount, rendersPerSecond, intervalsMs, submissionMs, drawCommands, raf })),
      scrub: report.scrubSamples.find(sample => sample.fixture === fixture && sample.layout === layout),
    })),
  }))
  report.completed = true
} catch (error) {
  report.completed = false
  report.errors.push({ message: error.message })
} finally {
  await browser.close()
  await writeFile(output, JSON.stringify(report, null, 2))
}
console.log(`M8 performance evidence: ${output}`)
if (!report.completed || report.errors.length || report.blockedApiRequests.length) {
  throw new Error(`Measurement incomplete or unexpected requests: ${JSON.stringify({ errors: report.errors, blockedApiRequests: report.blockedApiRequests })}`)
}
