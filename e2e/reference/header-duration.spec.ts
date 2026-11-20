import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { browserErrors, currentSession, ready } from './harness'

for (const outcome of ['exit', 'stop', 'plain'] as const) {
  test(`Header keeps the ${outcome} JVM duration when the session is reopened`, async ({ page, request }, testInfo) => {
    test.setTimeout(60000)
    const errors = browserErrors(page)
    const source = `public class Main { public static void main(String[] args) throws Exception { System.out.println("START"); Thread.sleep(${outcome === 'stop' ? 15000 : 650}); System.out.println("DONE"); } }`
    const imported = await request.post('/api/projects/import', { data: { name: `Header duration ${outcome}`, files: [{ path: 'Main.java', content: source }] } })
    expect(imported.ok()).toBe(true)
    const { id } = await imported.json() as { id: string }
    await page.addInitScript(projectId => localStorage.setItem('ggjavaez:project', projectId), id)
    await page.goto('/?qa=1')
    await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
    await expect(page.getByRole('button', { name: 'Project menu', exact: true })).toHaveAttribute('data-project-id', id)
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
    const launch = page.waitForResponse(response => new URL(response.url()).pathname === `/api/projects/${id}/execution` && response.request().method() === 'POST')
    if (outcome === 'plain') {
      await page.keyboard.press('F1')
      await page.getByRole('combobox', { name: 'Search commands', exact: true }).fill('Run Without Visualization')
      await page.getByRole('dialog', { name: 'Command Palette', exact: true }).getByRole('option').click()
    } else await page.getByRole('button', { name: 'Run', exact: true }).click()
    const response = await launch
    expect(response.ok()).toBe(true)
    const { id: sessionId } = await response.json() as { id: string }
    try {
      if (outcome === 'stop') {
        await expect.poll(async () => (await currentSession(request))?.stdout, { timeout: 20000 }).toContain('START')
        await page.getByRole('button', { name: 'Stop', exact: true }).click()
      }
      const phase = outcome === 'stop' ? 'STOPPED' : 'COMPLETED'
      await expect.poll(async () => (await currentSession(request))?.phase, { timeout: 20000 }).toBe(phase)
      const terminal = (await currentSession(request))!
      expect(terminal.id).toBe(sessionId)
      const label = page.locator('.shell-state-label')
      await expect(label).toHaveText(outcome === 'stop' ? /^Completed · \d+\.\d{2} s · Stopped by user$/ : /^Completed · \d+\.\d{2} s · Exit code 0$/)
      const initial = await label.innerText()
      await page.waitForTimeout(1500)
      await page.reload()
      await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
      await expect(page.locator('.shell-state')).toHaveAttribute('data-state', 'COMPLETED')
      await ready(page)
      const reopened = await label.innerText()
      const retained = (await currentSession(request))!
      const durationMs = Reflect.get(terminal, 'durationMs') as number | null | undefined
      const proof = { sessionId, phase, durationMs, initial, reopened, browserErrors: errors }
      await writeFile(testInfo.outputPath('duration.json'), JSON.stringify(proof, null, 2) + '\n')
      await testInfo.attach('actual-jvm-session', { body: JSON.stringify(proof), contentType: 'application/json' })
      expect(retained.id).toBe(sessionId)
      expect(reopened).toBe(initial)
      expect(Reflect.get(retained, 'durationMs')).toBe(durationMs)
      expect(durationMs).toBeGreaterThanOrEqual(outcome === 'stop' ? 0 : 650)
      expect(reopened).toContain(`${(durationMs! / 1000).toFixed(2)} s`)
      expect(errors).toEqual([])
    } finally {
      const session = await currentSession(request)
      if (session?.id === sessionId && !['COMPLETED', 'FAILED', 'STOPPED'].includes(session.phase)) await request.post(`/api/execution/${sessionId}/stop`, { data: {} })
    }
  })
}
