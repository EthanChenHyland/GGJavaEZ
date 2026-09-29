import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const base = 'http://127.0.0.1:5173'
const api = 'http://127.0.0.1:8787'
const output = resolve('docs/checkpoints/unified-v10/screenshots')
const sizes = [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]
const files = [
  { path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) throws Exception {\n    Person p = new Person("Ethan");\n    System.out.println("Created " + p.name);\n    p.age = 18;\n    System.out.println("Age: " + p.age);\n    Thread.sleep(12000);\n  }\n}\n' },
  { path: 'Person.java', content: 'public class Person {\n  String name;\n  int age;\n  Person(String name) { this.name = name; }\n}\n' },
]

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const req = async (path, options) => {
  const response = await fetch(`${api}${path}`, options)
  const value = await response.json()
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(value)}`)
  return value
}
const make = (name, sources) => req('/api/projects/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, files: sources }) })
const current = () => req('/api/execution/current')
async function waitFor(predicate, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const session = await current()
    if (predicate(session)) return session
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Timed out: ${JSON.stringify(await current())}`)
}
async function open(id) {
  await page.goto(`${base}/ide`)
  await page.evaluate((value) => localStorage.setItem('ggjavaez:project', value), id)
  await page.goto(`${base}/ide`)
  await page.locator('.monaco-editor').waitFor()
}
async function capture(name) {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(350)
    const layout = await page.evaluate(() => ({ shellHeight: document.querySelector('.ide-shell')?.getBoundingClientRect().height, topbars: document.querySelectorAll('.ide-topbar').length, scrollHeight: document.documentElement.scrollHeight }))
    if (layout.topbars !== 1 || layout.shellHeight !== height || layout.scrollHeight !== height) console.log('layout', name, width, height, layout)
    await page.screenshot({ path: join(output, `${name}-${width}x${height}.png`), animations: 'disabled' })
  }
  console.log(name, 'captured')
}

try {
  const person = await make('M10 Visual QA Person', files)
  await open(person.id)
  await capture('01-code-idle')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const live = await waitFor((session) => session?.projectId === person.id && session.phase === 'RUNNING' && session.rawEvents.some((event) => event.type === 'field'))
  await capture('03-live-run')
  await waitFor((session) => session?.id === live.id && session.phase === 'COMPLETED', 30000)
  await capture('07-completed')
  await page.getByRole('button', { name: 'Expand runtime' }).click()
  await capture('09-runtime-focus')

  const input = await make('M10 Visual QA Input', [{ path: 'Main.java', content: 'import java.util.Scanner; public class Main { public static void main(String[] args) { System.out.println("Name?"); System.out.println("Hello " + new Scanner(System.in).nextLine()); } }' }])
  await open(input.id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const waiting = await waitFor((session) => session?.projectId === input.id && session.phase === 'WAITING_FOR_INPUT')
  await capture('04-waiting-input')
  await req(`/api/execution/${waiting.id}/input`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Ethan\n' }) })
  await waitFor((session) => session?.id === waiting.id && session.phase === 'COMPLETED')

  const debug = await make('M10 Visual QA Debug', files)
  await open(debug.id)
  await page.getByRole('button', { name: 'Debug', exact: true }).click()
  const paused = await waitFor((session) => session?.projectId === debug.id && session.phase === 'PAUSED')
  await capture('05-debug-paused')
  const scrub = page.getByRole('slider', { name: 'Scrub execution' })
  const liveCursor = Number(await scrub.getAttribute('max'))
  await scrub.fill(String(Math.max(1, liveCursor - 1)))
  await capture('06-history')
  await req(`/api/execution/${paused.id}/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })

  const failure = await make('M10 Visual QA Failure', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) {\n  Person p = null;\n  System.out.println(p.name);\n }\n}\nclass Person { String name; }\n' }])
  await open(failure.id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await waitFor((session) => session?.projectId === failure.id && session.phase === 'FAILED')
  await page.getByRole('button', { name: 'ERROR EXPLORER' }).click()
  await capture('08-failed')

  // A bounded synthetic BUILDING session isolates the visual state, because a
  // real compilation finishes before four successive screenshots can complete.
  await page.route('**/api/execution/current', async (route) => route.fulfill({ json: {
    id: 'visual-building', revision: 1, projectId: failure.id, mainClass: null, kind: 'run', phase: 'BUILDING',
    support: 'RUN_ONLY', supportReason: null, build: null, rawEvents: [], sourceManifest: { sources: [], classes: [] },
    capability: null, stdout: '', stderr: '', runEvents: [], pause: null, breakpoints: [], terminalStatus: null,
    exitCode: null, diagnostic: null, failureKind: null, startedAt: new Date().toISOString(),
  } }))
  await page.reload()
  await page.locator('.monaco-editor').waitFor()
  await capture('02-compiling-fixture')
  console.log(JSON.stringify({ person: person.id, input: input.id, debug: debug.id, failure: failure.id, errors }, null, 2))
  await writeFile(resolve('docs/checkpoints/unified-v10/capture-result.json'), JSON.stringify({ person: person.id, input: input.id, debug: debug.id, failure: failure.id, errors }, null, 2))
} finally {
  await browser.close()
}
