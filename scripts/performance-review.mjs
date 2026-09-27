import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
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
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
const reset = () => page.evaluate(() => { window.__renderTimes = [] })
async function sample(label) {
  const times = await page.evaluate(() => window.__renderTimes)
  const deltas = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b)
  return { label, renderedFrames: times.length, medianFrameMs: deltas[Math.floor(deltas.length / 2)] ?? null, p95FrameMs: deltas[Math.floor(deltas.length * .95)] ?? null, approximateFps: times.length > 1 ? +((times.length - 1) * 1000 / (times.at(-1) - times[0])).toFixed(1) : 0 }
}
await page.getByRole('button', { name: /^Go to event 8:/ }).click()
await page.waitForTimeout(800)
await reset()
await page.getByRole('button', { name: /^Go to event 9:/ }).click()
await page.waitForTimeout(800)
const allocation = await sample('allocation and guided reframe')
await page.getByRole('button', { name: /^Go to event 18:/ }).click()
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
async function memory() {
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  return metrics.find((metric) => metric.name === 'JSHeapUsedSize').value / 1024 / 1024
}
const beforeMB = await memory()
const latencies = []
for (let i = 0; i < 100; i++) {
  const start = performance.now()
  await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(i % 22))
  if (i < 22) latencies.push(performance.now() - start)
}
await page.waitForTimeout(300)
const afterMB = await memory()
for (let i = 0; i < 100; i++) await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(i % 22))
await page.waitForTimeout(300)
const secondBatchMB = await memory()
latencies.sort((a, b) => a - b)
const result = { environment: 'Installed Chrome headless, ANGLE WebGL, 1440×900, balanced tier. Rendering timestamps recorded from WebGL draw calls; scrub latency includes Playwright roundtrip.', allocation, idle, orbit, scrubRoundtripMedianMs: latencies[Math.floor(latencies.length / 2)], scrubRoundtripP95Ms: latencies[Math.floor(latencies.length * .95)], memory: { beforeMB, after100SeeksMB: afterMB, after200SeeksMB: secondBatchMB } }
await writeFile('docs/checkpoints/person-v1/performance.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
await browser.close()
