/* global process, console, localStorage */
import { chromium, expect, request } from '@playwright/test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

// Run only in the root's serialized M9 browser/JVM/build QA window.
const base = 'http://127.0.0.1:5173'
const fixtureRoot = resolve('fixtures/projects-m9')
const output = resolve('docs/checkpoints/java-v9')
const sizes = [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]
const captures = [], errors = []
await mkdir(output, { recursive: true })
const api = await request.newContext({ baseURL: base })
const browser = await chromium.launch({ channel: 'chrome' })
let activeDebug = null

async function fixture(name) {
  const root = join(fixtureRoot, name)
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['target', 'build', '.gradle', '.git', '.idea'].includes(entry.name)) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) { await visit(absolute); continue }
      if (!entry.isFile()) throw new Error(`Unsupported fixture entry: ${absolute}`)
      const path = relative(root, absolute).split('\\').join('/')
      if (path.endsWith('.md')) continue
      const bytes = await readFile(absolute)
      files.push(/\.(jar|class|zip)$/i.test(path) ? { path, content: bytes.toString('base64'), encoding: 'base64' } : { path, content: bytes.toString('utf8') })
    }
  }
  await visit(root)
  if (!files.some((file) => file.path.endsWith('.java'))) throw new Error(`No Java sources in ${root}`)
  const response = await api.post('/api/projects/import', { data: { name: name === 'people-gradle' ? 'People · Gradle' : 'People · Maven', files } })
  if (!response.ok()) throw new Error(`${name} import: ${await response.text()}`)
  return { id: (await response.json()).id, files }
}
async function pageFor(id) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((projectId) => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto(`${base}/ide`)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  return page
}
async function ready(id, page) {
  await expect.poll(async () => {
    const response = await api.get(`/api/projects/${id}/language`)
    const status = await response.json()
    if (['failed', 'unavailable'].includes(status.status)) throw new Error(`Language service: ${status.message}`)
    return status.status
  }, { timeout: 90_000, intervals: [1000, 2000, 3000] }).toBe('ready')
  await expect(page.locator('.ide-language-status')).toContainText('ready')
}
async function shot(page, state, width, height, { home = false } = {}) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(220)
  if (home && await page.getByRole('button', { name: 'Overview', exact: true }).count()) {
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.waitForTimeout(650)
  }
  const file = join(output, `${state}-${width}x${height}.png`)
  await page.screenshot({ path: file, animations: 'disabled', timeout: 20000 })
  const world = await page.locator('.ide-runtime-panel').boundingBox()
  const editor = await page.locator('.ide-editor-panel').boundingBox()
  captures.push({ state, width, height, file: relative(process.cwd(), file), world, editor })
  console.log(`${state} ${width}×${height}`)
}
async function matrix(page, state, options, reopenExplorer = false) {
  for (const [width, height] of sizes) await shot(page, state, width, height, options)
  await page.setViewportSize({ width: 1440, height: 900 })
  if (reopenExplorer) {
    const showExplorer = page.getByRole('button', { name: 'Show project explorer' })
    if (await showExplorer.count()) await showExplorer.click()
  }
}
async function clickWord(page, lineText, word) {
  const line = page.locator('.monaco-editor .view-line').filter({ hasText: lineText }).first()
  await expect(line).toBeVisible()
  const point = await line.evaluate((element, token) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const index = node.textContent?.indexOf(token) ?? -1
      if (index < 0) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + token.length)
      const rect = range.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    return null
  }, word)
  if (!point) throw new Error(`Could not find visible Monaco token ${word}`)
  await page.mouse.click(point.x, point.y)
  return point
}
async function waitDebug(reason) {
  await expect.poll(async () => {
    activeDebug = await (await api.get('/api/debug/current')).json()
    if (activeDebug?.status === 'failed') throw new Error(activeDebug.diagnostic ?? activeDebug.stderr)
    return activeDebug?.status === 'paused' ? activeDebug.pause?.reason : null
  }, { timeout: 30000 }).toBe(reason)
}

try {
  const people = await fixture('people-maven')
  const page = await pageFor(people.id)
  await ready(people.id, page)
  await expect(page.locator('.ide-project-status')).toContainText('Maven')
  await matrix(page, 'maven-code-ready', undefined, true)

  const main = people.files.find((file) => file.path.endsWith('/Main.java'))
  if (!main) throw new Error('people-maven Main.java missing')
  await page.locator('.ide-tree-name').filter({ hasText: 'Main.java' }).last().click()
  await clickWord(page, 'PersonService', 'PersonService')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget')).toBeVisible({ timeout: 10000 })
  await shot(page, 'maven-completion', 1440, 900)
  await page.keyboard.press('Escape')
  const word = await clickWord(page, 'getName', 'getName')
  await page.mouse.move(word.x, word.y)
  await expect(page.locator('.monaco-hover:not(.hidden)').first()).toBeVisible()
  await shot(page, 'maven-hover', 1440, 900)
  await page.mouse.move(1, 1)

  await page.getByRole('button', { name: 'Configure launch' }).click()
  await expect(page.getByRole('dialog', { name: 'Launch configuration' })).toBeVisible()
  await matrix(page, 'maven-launch-dialog')
  await page.getByRole('dialog', { name: 'Launch configuration' }).getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Visualize', exact: true }).click()
  await expect(page.locator('.ide-runtime-live')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  const timeline = page.locator('.vj-timeline__range')
  await timeline.focus()
  await timeline.press('Home')
  for (let step = 0; step < 24; step++) await timeline.press('ArrowRight')
  await expect(page.locator('.vj-timeline__count')).toContainText('24 /')
  await matrix(page, 'maven-visualize', { home: true })
  await page.getByRole('button', { name: 'Expand runtime' }).click()
  await matrix(page, 'maven-runtime-focus', { home: true })
  await page.getByRole('button', { name: 'Restore IDE layout' }).click()

  await page.getByRole('button', { name: 'Debug', exact: true }).click()
  await waitDebug('entry')
  await matrix(page, 'maven-debug-entry', { home: true })
  await page.getByRole('button', { name: 'Stop Debug' }).click()
  activeDebug = null
  await page.close()

  const gradle = await fixture('people-gradle')
  const gradlePage = await pageFor(gradle.id)
  await expect(gradlePage.locator('.ide-project-status')).toContainText('Gradle', { timeout: 60_000 })
  await ready(gradle.id, gradlePage)
  await expect.poll(async () => (await (await api.get(`/api/projects/${gradle.id}/language`)).json()).metrics.classpathMismatch, { timeout: 10000 }).not.toBeNull()
  await matrix(gradlePage, 'gradle-code-status')
  await gradlePage.close()

  const broken = await fixture('people-maven')
  const pom = broken.files.find((file) => file.path === 'pom.xml')
  if (!pom) throw new Error('people-maven pom.xml missing')
  const current = await (await api.get(`/api/projects/${broken.id}/files?path=pom.xml`)).json()
  const saved = await api.put(`/api/projects/${broken.id}/files`, { data: { path: 'pom.xml', revision: current.revision, content: pom.content.replace('</project>', '<broken></project>') } })
  if (!saved.ok()) throw new Error(`Broken POM save: ${await saved.text()}`)
  const failure = await pageFor(broken.id)
  await failure.getByRole('button', { name: 'Build', exact: true }).click()
  await expect(failure.locator('.ide-problems')).toBeVisible({ timeout: 60_000 })
  await matrix(failure, 'maven-build-problems')
  await failure.close()

  await writeFile(join(output, 'capture-m9.json'), JSON.stringify({ capturedAt: new Date().toISOString(), captures, errors }, null, 2))
  if (errors.length) throw new Error(errors.join('; '))
  console.log(`Captured ${captures.length} M9 screenshots`)
} finally {
  if (activeDebug && ['starting', 'running', 'paused'].includes(activeDebug.status))
    await api.post(`/api/debug/${activeDebug.sessionId}/command`, { data: { command: 'stop' } })
  await browser.close()
  await api.dispose()
}
