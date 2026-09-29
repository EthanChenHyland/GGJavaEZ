/* global process, localStorage, console */
import { chromium, expect, request } from '@playwright/test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const base = 'http://127.0.0.1:5173'
const output = join(process.cwd(), 'docs/checkpoints/gui-v8')
const sizes = [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]
await mkdir(output, { recursive: true })
const api = await request.newContext({ baseURL: base })
const browser = await chromium.launch({ channel: 'chrome' })
const captures = [], errors = []
let activeDebug = null

async function project(name, files) {
  const response = await api.post('/api/projects/import', { data: { name: `M8 QA ${name} ${Date.now()}`, files } })
  if (!response.ok()) throw new Error(`${name} import: ${await response.text()}`)
  return (await response.json()).id
}
async function fixture(name) {
  const dir = join(process.cwd(), 'fixtures/debug-v7', name)
  const files = await Promise.all((await readdir(dir)).filter((path) => path.endsWith('.java')).map(async (path) => ({ path, content: await readFile(join(dir, path), 'utf8') })))
  return project(name, files)
}
async function pageFor(id, breakpoints = []) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(({ projectId, breakpoints }) => { localStorage.setItem('ggjavaez:project', projectId); if (breakpoints.length) localStorage.setItem(`ggjavaez:breakpoints:${projectId}`, JSON.stringify(breakpoints)) }, { projectId: id, breakpoints })
  await page.goto(`${base}/ide`)
  await page.locator('.monaco-editor').waitFor()
  return page
}
async function shot(page, name, width, height) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(250)
  // Deliberate overview QA; layout changes preserve a freely explored camera.
  if (await page.getByRole('button', { name: 'Overview', exact: true }).count()) await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.waitForTimeout(650)
  const path = join(output, `${name}-${width}x${height}.png`)
  await page.screenshot({ path, animations: 'disabled', timeout: 15000 })
  console.log(`Captured ${name} ${width}×${height}`)
  captures.push({ name, width, height, path: path.slice(process.cwd().length + 1), world: await page.locator('.world-panel').count() ? await page.locator('.world-panel').boundingBox() : null })
}
async function matrix(page, name) {
  for (const [width, height] of sizes) await shot(page, name, width, height)
  await page.setViewportSize({ width: 1440, height: 900 })
}
async function visualize(page) {
  await page.getByRole('button', { name: 'Visualize', exact: true }).click()
  await page.locator('.ide-runtime-live').waitFor({ timeout: 30000 })
}

try {
  const personId = await project('Person', [
    { path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    Person p = new Person("Ethan");\n    p.setAge(18);\n  }\n}\n' },
    { path: 'Person.java', content: 'public class Person {\n  String name;\n  int age;\n  Person(String name) { this.name = name; }\n  void setAge(int age) { this.age = age; }\n}\n' },
  ])
  const person = await pageFor(personId)
  await matrix(person, 'code')
  await visualize(person)
  await person.locator('.vj-timeline__marker[title="age: 0 → 18"]').click()
  await matrix(person, 'visualize-person')
  await person.getByRole('button', { name: 'Expand runtime' }).click()
  await matrix(person, 'runtime-focus')
  await person.getByRole('button', { name: 'Show source drawer' }).click()
  await shot(person, 'runtime-focus-source', 1440, 900)
  await person.getByRole('button', { name: 'Close source drawer' }).click()
  await person.getByRole('button', { name: 'Show tools in runtime focus' }).click()
  await shot(person, 'runtime-focus-tools', 1440, 900)
  await person.getByRole('button', { name: 'Hide tools in runtime focus' }).click()
  await person.getByRole('button', { name: 'Restore IDE layout' }).click()
  const picker = person.getByRole('combobox', { name: 'Select runtime entity' })
  const object = await picker.locator('option').filter({ hasText: /^Person #/ }).first().getAttribute('value')
  await picker.selectOption(object)
  await shot(person, 'person-inspector', 1440, 900)
  await shot(person, 'person-inspector', 760, 900)
  await person.close()

  const steppingId = await fixture('stepping')
  const debug = await pageFor(steppingId, [{ fileId: 'Main.java', line: 5 }])
  await debug.getByRole('button', { name: 'Debug', exact: true }).click()
  await expect.poll(async () => { activeDebug = await (await api.get('/api/debug/current')).json(); return activeDebug?.status === 'paused' && activeDebug.pause?.reason === 'entry' }, { timeout: 15000 }).toBe(true)
  await debug.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => { activeDebug = await (await api.get('/api/debug/current')).json(); return activeDebug?.status === 'paused' && activeDebug.pause?.reason === 'breakpoint' }, { timeout: 15000 }).toBe(true)
  await matrix(debug, 'debug-breakpoint')
  await debug.getByRole('button', { name: 'Inspect Debugger' }).click()
  await shot(debug, 'debug-inspection', 1440, 900)
  await shot(debug, 'debug-inspection', 760, 900)
  await debug.getByRole('button', { name: 'Stop Debug' }).click()
  await debug.close()
  activeDebug = null

  const nullId = await fixture('null')
  const failure = await pageFor(nullId)
  await visualize(failure)
  await failure.getByRole('region', { name: 'Error Explorer', exact: true }).waitFor()
  await matrix(failure, 'error-explorer')
  await failure.getByRole('region', { name: 'Error Explorer', exact: true }).getByRole('button', { name: 'name String null', exact: true }).click()
  await failure.getByRole('button', { name: 'Trace Cause', exact: true }).click()
  await shot(failure, 'trace-cause', 1440, 900)
  await shot(failure, 'trace-cause', 760, 900)
  await failure.close()

  const examples = [
    ['recursion', 'public class Main {\n  static int factorial(int n) {\n    if(n<=1) return 1;\n    return n*factorial(n-1);\n  }\n  public static void main(String[] args) {\n    System.out.println(factorial(5));\n  }\n}\n', '.vj-timeline__marker[title="factorial entered"]', 'recursion'],
    ['array', 'public class Main {\n  public static void main(String[] args) {\n    int[] a={3,8,1,6,2};\n    for(int i=0;i<a.length-1;i++)\n      for(int j=0;j<a.length-1-i;j++)\n        if(a[j]>a[j+1]) {\n          int t=a[j]; a[j]=a[j+1]; a[j+1]=t;\n        }\n  }\n}\n', '.vj-timeline__marker[title^="Write ["]', 'array-theater'],
    ['control', 'public class Main {\n  public static void main(String[] args) {\n    int sum=0;\n    for(int i=0;i<3;i++) {\n      if(i%2==0) sum+=i;\n    }\n    System.out.println(sum);\n  }\n}\n', '.vj-timeline__marker[title="JVM branch evaluated"]', 'control'],
  ]
  for (const [name, source, marker, shotName] of examples) {
    const id = await project(name, [{ path: 'Main.java', content: source }])
    const page = await pageFor(id)
    await visualize(page)
    await page.locator(marker).last().click()
    if (name === 'array') await page.getByRole('button', { name: 'Theater', exact: true }).click()
    await shot(page, shotName, 1440, 900)
    await page.close()
  }
  await writeFile(join(output, 'capture.json'), JSON.stringify({ capturedAt: new Date().toISOString(), captures, errors }, null, 2))
  if (errors.length) throw new Error(errors.join('; '))
  console.log(`Captured ${captures.length} screenshots; ${errors.length} page errors`)
} finally {
  if (activeDebug && ['starting', 'running', 'paused'].includes(activeDebug.status)) await api.post(`/api/debug/${activeDebug.sessionId}/command`, { data: { command: 'stop' } })
  await browser.close()
  await api.dispose()
}
