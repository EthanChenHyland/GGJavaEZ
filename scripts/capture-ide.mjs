import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const base = 'http://127.0.0.1:5173'
const output = resolve('docs/checkpoints/ide-v5')
await mkdir(output, { recursive: true })
async function api(path, data) {
  const response = await fetch(base + '/api' + path, data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : undefined)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
const fixtures = {
  starter: [
    { path: 'Main.java', content: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello GGJavaEZ");\n        System.out.print("Your name: ");\n        Scanner input = new Scanner(System.in);\n        String name = input.nextLine();\n        System.out.println(Greeting.forName(name));\n        System.err.println("stderr is captured separately");\n    }\n}\n' },
    { path: 'Greeting.java', content: 'public class Greeting {\n    static String forName(String name) {\n        return "Welcome, " + name + "!";\n    }\n}\n' },
  ],
  problems: [{ path: 'Main.java', content: 'public class Main {\n    public static void main(String[] args) {\n        Person person = new Person();\n        System.out.println(person.name);\n    }\n}\n' }],
  crash: [{ path: 'Main.java', content: 'public class Main {\n    public static void main(String[] args) {\n        String value = null;\n        System.out.println(value.length());\n    }\n}\n' }],
}
const projects = await api('/projects')
const ids = {}
for (const [name, files] of Object.entries(fixtures)) {
  const projectName = `IDE QA · ${name}`
  ids[name] = projects.find((item) => item.name === projectName)?.id ?? (await api('/projects/import', { name: projectName, files })).id
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.addInitScript((id) => localStorage.setItem('ggjavaez:project', id), ids.starter)
    await page.goto(base + '/ide')
    await expect(page.locator('.monaco-editor')).toBeVisible()
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByLabel('Console input')).toBeEnabled()
    await page.getByLabel('Console input').fill('Ada')
    await page.getByLabel('Console input').press('Enter')
    await expect(page.locator('.ide-process-status')).toContainText('EXIT 0')
    await page.screenshot({ path: `${output}/workspace-${width}x${height}.png` })
    await page.getByLabel('Project', { exact: true }).selectOption(ids.problems)
    await page.getByRole('button', { name: 'Build', exact: true }).click()
    await expect(page.locator('.ide-problem').first()).toBeVisible()
    await page.locator('.ide-problem').first().click()
    await page.screenshot({ path: `${output}/problems-${width}x${height}.png` })
    await page.getByLabel('Project', { exact: true }).selectOption(ids.crash)
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.locator('.ide-stack')).toBeVisible()
    await page.screenshot({ path: `${output}/exception-${width}x${height}.png` })
    await page.goto(base)
    await page.getByRole('slider', { name: 'Scrub execution' }).fill('18')
    await page.getByRole('button', { name: 'Home', exact: true }).first().click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${output}/person-regression-${width}x${height}.png` })
    await context.close()
  }
} finally { await browser.close() }
console.log(`Captured IDE and runtime regression checkpoints in ${output}`)
