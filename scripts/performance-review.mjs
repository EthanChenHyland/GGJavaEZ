import { chromium } from '@playwright/test'
import { writeFile, readFile } from 'node:fs/promises'
const demo = process.env.REVIEW_DEMO ?? 'person'
const recursion = demo === 'recursion'
const arrays = demo === 'arrays'
const control = demo === 'control'
const controlTrace = control ? JSON.parse(await readFile('src/demos/control/trace.json','utf8')) : null
const inputCursor = controlTrace ? controlTrace.events.findIndex((event) => event.type === 'INPUT_READ') + 1 : 0
const branchCursor = controlTrace ? controlTrace.events.findIndex((event) => event.type === 'DECLARE_LOCAL' && event.slot.name === 'corrected') + 1 : 0
const arrayTrace = arrays ? JSON.parse(await readFile('src/demos/arrays/trace.json','utf8')) : null
const eventCount = controlTrace?.events.length ?? arrayTrace?.events.length ?? (recursion ? 36 : 21)
const allocationCursor = arrayTrace ? arrayTrace.events.findIndex((event) => event.type === 'ALLOCATE_ARRAY') + 1 : 0
const comparisonCursor = arrayTrace ? arrayTrace.events.findIndex((event) => event.type === 'ARRAY_COMPARE') + 1 : 0
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-webgl', '--use-gl=angle'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => {
  window.__renderTimes = []
  let frameTime = 0
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => raf((time) => { frameTime = time; callback(time) })
  for (const Constructor of [WebGLRenderingContext, WebGL2RenderingContext]) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = Constructor.prototype[name]
      if (!original) continue
      Constructor.prototype[name] = function (...args) {
        if (window.__renderTimes.at(-1) !== frameTime) window.__renderTimes.push(frameTime)
        return original.apply(this, args)
      }
    }
  }
})
await page.goto(process.env.REVIEW_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
if (demo !== 'person') await page.getByLabel('Runtime example').selectOption(demo)
if (arrays) {
  await page.getByRole('button', { name:'Theater',exact:true }).click()
  await page.getByRole('button', { name:'Follow execution',exact:true }).click()
}
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
const reset = () => page.evaluate(() => { window.__renderTimes = [] })
async function sample(label) {
  const times = await page.evaluate(() => window.__renderTimes)
  const deltas = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b)
  return { label, renderedFrames: times.length, medianFrameMs: deltas[Math.floor(deltas.length / 2)] ?? null, p95FrameMs: deltas[Math.floor(deltas.length * .95)] ?? null, continuousSample: times.length >= 10, activeFrameCadenceFps: deltas.length >= 9 ? +(1000 / deltas[Math.floor(deltas.length / 2)]).toFixed(1) : null, approximateFps: times.length > 1 ? +((times.length - 1) * 1000 / (times.at(-1) - times[0])).toFixed(1) : 0 }
}
await page.getByRole('slider', { name: 'Scrub execution' }).fill(control ? String(inputCursor - 1) : arrays ? String(allocationCursor - 1) : recursion ? '19' : '8')
await page.waitForTimeout(800)
await reset()
await page.getByRole('slider', { name: 'Scrub execution' }).fill(control ? String(inputCursor) : arrays ? String(allocationCursor) : recursion ? '20' : '9')
await page.waitForTimeout(800)
const allocation = await sample(control ? 'Scanner input and scoped variable update' : arrays ? 'array allocation and reserved Home framing' : recursion ? 'base-case return and guided reframe' : 'allocation and guided reframe')
await page.getByRole('slider', { name: 'Scrub execution' }).fill(control ? String(branchCursor) : arrays ? String(comparisonCursor) : recursion ? '19' : '18')
await page.getByRole('button', { name: 'Home', exact: true }).first().click()
await page.waitForTimeout(900)
await reset()
await page.waitForTimeout(1000)
const idle = await sample('idle demand rendering, one second')
await reset()
await page.mouse.move(850, 520)
await page.mouse.down()
for (let i = 0; i < 120; i++) {
  await page.mouse.move(850 + Math.sin(i / 20) * 70, 520 + Math.cos(i / 20) * 20)
}
await page.mouse.up()
const orbit = await sample('orbit')
let playback = null
if (arrays || control) {
  const firstWrite = control ? inputCursor : arrayTrace.events.findIndex((event) => event.type === 'ARRAY_WRITE') + 1
  await page.getByRole('slider', { name:'Scrub execution' }).fill(String(firstWrite - 1))
  await page.getByRole('button', { name:'Home',exact:true }).click()
  await page.waitForTimeout(800)
  await reset()
  await page.getByRole('button', { name:'Play execution',exact:true }).click()
  await page.waitForTimeout(1650)
  await page.getByRole('button', { name:'Pause execution',exact:true }).click()
  playback = await sample(control ? 'input and early scoped playback' : 'two indexed writes during playback, including value travel')
}
async function memory() {
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  return metrics.find((metric) => metric.name === 'JSHeapUsedSize').value / 1024 / 1024
}
const beforeMB = await memory()
const latencies = []
for (let i = 0; i < 100; i++) {
  const start = performance.now()
  await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(i % (eventCount + 1)))
  if (i <= eventCount) latencies.push(performance.now() - start)
}
await page.waitForTimeout(300)
const afterMB = await memory()
for (let i = 0; i < 100; i++) await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(i % (eventCount + 1)))
await page.waitForTimeout(300)
const secondBatchMB = await memory()
latencies.sort((a, b) => a - b)
const result = { demo, representation: arrays ? 'theater' : 'spatial', environment: 'Installed Chrome headless, ANGLE WebGL, 1440×900, balanced tier. Rendering timestamps recorded from WebGL draw calls; scrub latency includes Playwright roundtrip.', allocation, idle, orbit, ...(playback ? { playback } : {}), scrubRoundtripMedianMs: latencies[Math.floor(latencies.length / 2)], scrubRoundtripP95Ms: latencies[Math.floor(latencies.length * .95)], memory: { beforeMB, after100SeeksMB: afterMB, after200SeeksMB: secondBatchMB } }
await writeFile(process.env.REVIEW_OUTPUT ?? 'docs/checkpoints/person-v1/performance.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
await browser.close()
