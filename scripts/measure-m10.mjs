import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const api = 'http://127.0.0.1:8787'
const response = await fetch(`${api}/api/projects/import`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: `M10 streaming performance ${Date.now()}`, files: [{ path: 'Main.java', content: `public class Main {
  public static void main(String[] args) throws Exception {
    int sum = 0;
    for (int i = 0; i < 600; i++) {
      sum += i;
      if (i % 100 == 0) System.out.println("tick " + i);
      Thread.sleep(3);
    }
    System.out.println("sum " + sum);
  }
}
` }] }) })
if (!response.ok) throw new Error(await response.text())
const project = await response.json()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
await page.addInitScript(() => {
  const metrics = { drawCalls: 0, frameTimes: [], timelineChanges: [], consoleChanges: [], messages: [] }
  Object.assign(window, { __vjMetrics: metrics })
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = proto[name]
      if (typeof original !== 'function') continue
      proto[name] = function (...args) { metrics.drawCalls++; return original.apply(this, args) }
    }
  }
  const tick = (time) => { metrics.frameTimes.push(time); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  const observer = new MutationObserver(() => {
    const timeline = document.querySelector('.vj-timeline__count')?.textContent
    const consoleText = document.querySelector('.ide-console-output')?.textContent
    const now = performance.now()
    if (timeline && metrics.timelineChanges.at(-1)?.text !== timeline) metrics.timelineChanges.push({ at: now, text: timeline })
    if (consoleText && metrics.consoleChanges.at(-1)?.length !== consoleText.length) metrics.consoleChanges.push({ at: now, length: consoleText.length })
  })
  observer.observe(document, { subtree: true, childList: true, characterData: true })
})

try {
  await page.goto('http://127.0.0.1:5173/ide')
  await page.evaluate((id) => localStorage.setItem('ggjavaez:project', id), project.id)
  await page.reload()
  await page.locator('.monaco-editor').waitFor()
  const pending = page.waitForResponse((item) => item.url().endsWith(`/api/projects/${project.id}/execution`) && item.request().method() === 'POST')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const started = await (await pending).json()
  await page.evaluate((id) => {
    const source = new EventSource(`/api/execution/${id}/events`)
    source.addEventListener('session', (event) => {
      const raw = event.data
      const item = JSON.parse(raw)
      window.__vjMetrics.messages.push({ at: performance.now(), phase: item.phase, rawEvents: item.rawEvents.length, stdout: item.stdout.length, bytes: raw.length })
      if (['COMPLETED', 'FAILED', 'STOPPED'].includes(item.phase)) source.close()
    })
  }, started.id)
  let session
  for (let i = 0; i < 300; i++) {
    await new Promise((done) => setTimeout(done, 100))
    session = await fetch(`${api}/api/execution/${started.id}`).then((item) => item.json())
    if (['COMPLETED', 'FAILED', 'STOPPED'].includes(session.phase)) break
  }
  if (session?.phase !== 'COMPLETED') throw new Error(`Measurement did not complete: ${JSON.stringify(session?.diagnostic ?? session?.phase)}`)
  await page.waitForTimeout(300)
  const browserMetrics = await page.evaluate(() => window.__vjMetrics)
  const messages = browserMetrics.messages
  const firstEvent = messages.find((item) => item.rawEvents > 0)
  const last = messages.at(-1)
  const durations = browserMetrics.frameTimes.slice(1).map((time, index) => time - browserMetrics.frameTimes[index])
  const percentile = (values, fraction) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] : null
  const output = {
    source: 'One fresh 600-iteration local JVM run, Chrome headless 1440x900; descriptive sample, not GPU presentation percentile',
    projectId: project.id, sessionId: session.id, phase: session.phase, support: session.support,
    rawEvents: session.rawEvents.length, stdoutBytes: session.stdout.length, sessionRevisions: session.revision,
    publishedSnapshots: messages.length, publishedBytes: messages.reduce((sum, item) => sum + item.bytes, 0),
    observedEventSpanMs: firstEvent && last ? Math.round(last.at - firstEvent.at) : null,
    observedEventsPerSecond: firstEvent && last && last.at > firstEvent.at ? Math.round((last.rawEvents - firstEvent.rawEvents) * 1000 / (last.at - firstEvent.at)) : null,
    timelineDomUpdates: browserMetrics.timelineChanges.length, consoleDomUpdates: browserMetrics.consoleChanges.length,
    webglDrawCalls: browserMetrics.drawCalls, rafFrameCount: durations.length,
    rafGapP50Ms: percentile(durations, 0.5), rafGapP95Ms: percentile(durations, 0.95), rafGapMaxMs: Math.max(...durations),
    pageErrors, snapshots: messages,
  }
  await mkdir(resolve('docs/checkpoints/unified-v10'), { recursive: true })
  await writeFile(resolve('docs/checkpoints/unified-v10/performance.json'), JSON.stringify(output, null, 2))
  console.log(JSON.stringify({ ...output, snapshots: undefined }, null, 2))
} finally {
  await browser.close()
}
