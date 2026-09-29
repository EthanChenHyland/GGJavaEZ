/* global process, console, localStorage, window, WebGLRenderingContext, WebGL2RenderingContext, requestAnimationFrame, performance */
import { chromium } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

// Run against one owned dev bridge after all other JVM/browser QA has settled.
const base = 'http://127.0.0.1:5173'
const fixtureRoot = resolve('fixtures/projects-m9')
const output = resolve('docs/checkpoints/java-v9/performance.json')
const samples = { capturedAt: new Date().toISOString(), environment: '', measurements: {} }
async function api(path, options) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...options?.headers } })
  const body = await response.json()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body).slice(0, 400)}`)
  return body
}
const health = await api('/api/health')
samples.environment = `local Chromium + owned Vite/Node bridge, OpenJDK ${health.jdk?.version ?? 'unavailable'}`
async function timed(action) {
  const start = performance.now()
  const value = await action()
  return { ms: Math.round((performance.now() - start) * 10) / 10, value }
}
async function fixtureFiles(name) {
  const root = join(fixtureRoot, name), files = []
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['target', 'build', '.gradle', '.git', '.idea'].includes(entry.name)) continue
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) { await visit(absolute); continue }
      if (!entry.isFile()) continue
      const path = relative(root, absolute).split('\\').join('/')
      if (path.endsWith('.md')) continue
      const bytes = await readFile(absolute)
      files.push(/\.(jar|class|zip)$/i.test(path) ? { path, content: bytes.toString('base64'), encoding: 'base64' } : { path, content: bytes.toString('utf8') })
    }
  }
  await visit(root)
  return files
}
async function importFixture(name) {
  const files = await fixtureFiles(name)
  const created = await api('/api/projects/import', { method: 'POST', body: JSON.stringify({ name: `M9 performance ${name} ${randomUUID()}`, files }) })
  return { id: created.id, files }
}
async function waitReady(id) {
  const start = performance.now()
  while (performance.now() - start < 90000) {
    const status = await api(`/api/projects/${id}/language`)
    if (status.status === 'ready') return status
    if (['failed', 'unavailable'].includes(status.status)) throw new Error(`Language ${status.status}: ${status.message}`)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Language initialization exceeded 90 seconds')
}
async function settledClasspath(id) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const status = await api(`/api/projects/${id}/language`)
    if (status.metrics.classpathMismatch !== null && status.metrics.classpathMismatch !== undefined) return status.metrics.classpathMismatch
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return null
}
function at(content, needle, occurrence = 0, offset = 0) {
  let index = -1
  for (let i = 0; i <= occurrence; i++) index = content.indexOf(needle, index + 1)
  if (index < 0) throw new Error(`Missing ${needle}`)
  const before = content.slice(0, index + offset)
  return { line: before.split('\n').length - 1, character: before.length - before.lastIndexOf('\n') - 1 }
}
async function semantic(id, method, path, position, extra = {}) {
  return api(`/api/projects/${id}/language/request`, { method: 'POST', body: JSON.stringify({ method, params: {
    textDocument: { uri: `inmemory://ggjavaez/${id}/${path}` }, position, ...extra,
  } }) })
}
function summarizeFrames(intervals) {
  const sorted = [...intervals].sort((a, b) => a - b)
  const value = (fraction) => Math.round((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0) * 10) / 10
  return { count: sorted.length, medianMs: value(0.5), p95Ms: value(0.95), maxMs: value(1) }
}
async function sampleFrames(page, durationMs = 2400) {
  const sampled = await page.evaluate(async (duration) => {
    const values = []
    const drawsBefore = window.__m9draws
    let previous = 0
    const start = performance.now()
    await new Promise(resolve => {
      const frame = (now) => {
        if (previous) values.push(now - previous)
        previous = now
        if (now - start >= duration) resolve(null)
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    return { intervals: values, drawCommands: window.__m9draws - drawsBefore }
  }, durationMs)
  return { ...summarizeFrames(sampled.intervals), drawCommands: sampled.drawCommands }
}
async function orbitFor(page) {
  const box = await page.locator('.spatial-view canvas').boundingBox()
  if (!box) throw new Error('Spatial canvas disappeared before orbit measurement')
  const x = box.x + box.width * 0.55, y = box.y + box.height * 0.57
  await page.mouse.move(x, y)
  await page.mouse.down()
  try {
    for (let i = 0; i < 52; i++) {
      await page.mouse.move(x + i * 1.8, y + Math.sin(i / 7) * 16)
      await page.waitForTimeout(27)
    }
  } finally { await page.mouse.up() }
}

const maven = await importFixture('people-maven')
const gradle = await importFixture('people-gradle')
const modelMaven = await timed(() => api(`/api/projects/${maven.id}/java-project`))
const modelMavenCached = await timed(() => api(`/api/projects/${maven.id}/java-project`))
const modelGradle = await timed(() => api(`/api/projects/${gradle.id}/java-project`))
samples.measurements.mavenModelFirstMs = modelMaven.ms
samples.measurements.mavenModelCachedMs = modelMavenCached.ms
samples.measurements.gradleModelFirstMs = modelGradle.ms
samples.measurements.modelStatus = { maven: modelMaven.value.status, gradle: modelGradle.value.status }
const mavenBuild = await timed(() => api(`/api/projects/${maven.id}/build`, { method: 'POST', body: '{}' }))
samples.measurements.mavenBuildMs = mavenBuild.ms
samples.measurements.mavenBuildSuccess = mavenBuild.value.success

const openMaven = await timed(async () => { await api(`/api/projects/${maven.id}/language/open`, { method: 'POST', body: '{}' }); return waitReady(maven.id) })
samples.measurements.mavenLanguageOpenToReadyMs = openMaven.ms
const main = maven.files.find(file => file.path.endsWith('/Main.java'))
if (!main) throw new Error('Maven Main.java missing')
const completionAt = at(main.content, 'PersonService', 0, 6)
const definitionAt = at(main.content, 'PersonService', 1, 5)
const completion = () => semantic(maven.id, 'textDocument/completion', main.path, completionAt, { context: { triggerKind: 1 } })
samples.measurements.firstCompletionMs = (await timed(completion)).ms
samples.measurements.repeatCompletionMs = (await timed(completion)).ms
samples.measurements.definitionMs = (await timed(() => semantic(maven.id, 'textDocument/definition', main.path, definitionAt))).ms
samples.measurements.mavenClasspathMismatch = await settledClasspath(maven.id)

let browser, page
try {
  browser = await chromium.launch({ channel: 'chrome' })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await page.addInitScript(() => {
    window.__m9draws = 0
    for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        if (!Object.hasOwn(Type.prototype, method)) continue
        const original = Type.prototype[method]
        Type.prototype[method] = function (...args) { window.__m9draws++; return original.apply(this, args) }
      }
    }
  })
  await page.addInitScript((id) => localStorage.setItem('ggjavaez:project', id), maven.id)
  await page.goto(`${base}/ide`)
  await page.getByRole('button', { name: 'Visualize', exact: true }).click()
  await page.locator('.spatial-view canvas').waitFor({ state: 'visible', timeout: 60000 })
  await page.getByRole('slider', { name: 'Scrub execution' }).fill('24')
  await page.locator('.vj-timeline__count').getByText('24 /', { exact: false }).waitFor().catch(() => {})
  await page.waitForTimeout(1400)
  samples.measurements.spatialFramesIdle = await sampleFrames(page)
  const [framesDuringBuild, gradleBuild] = await Promise.all([
    sampleFrames(page),
    timed(() => api(`/api/projects/${gradle.id}/build`, { method: 'POST', body: '{}' })),
    orbitFor(page),
  ])
  samples.measurements.gradleBuildMs = gradleBuild.ms
  samples.measurements.gradleBuildSuccess = gradleBuild.value.success
  samples.measurements.spatialFramesDuringGradleBuild = framesDuringBuild
  const [framesDuringSwitch, gradleSwitch] = await Promise.all([
    sampleFrames(page),
    timed(async () => { await api(`/api/projects/${gradle.id}/language/open`, { method: 'POST', body: '{}' }); return waitReady(gradle.id) }),
    orbitFor(page),
  ])
  samples.measurements.spatialFramesDuringLanguageSwitch = framesDuringSwitch
  samples.measurements.mavenToGradleLanguageSwitchMs = gradleSwitch.ms
  samples.measurements.gradleClasspathMismatch = await settledClasspath(gradle.id)
  samples.measurements.spatialCanvasRemainedVisible = await page.locator('.spatial-view canvas').isVisible()
} finally {
  await page?.close()
  await browser?.close()
}

await mkdir(resolve('docs/checkpoints/java-v9'), { recursive: true })
await writeFile(output, JSON.stringify(samples, null, 2))
console.log(JSON.stringify(samples.measurements, null, 2))
