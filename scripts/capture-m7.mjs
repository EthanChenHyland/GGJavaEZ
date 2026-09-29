import { chromium, expect, request } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = 'http://127.0.0.1:5173', output = join(process.cwd(), 'docs/checkpoints/debug-v7');
await mkdir(output, { recursive: true });
const api = await request.newContext({ baseURL: base });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], captures = [];
page.on('pageerror', (error) => errors.push(error.message));
async function fixture(name, breakpoints = []) {
  const dir = join(process.cwd(), 'fixtures/debug-v7', name);
  const files = await Promise.all((await readdir(dir)).filter((path) => path.endsWith('.java')).map(async (path) => ({ path, content: await readFile(join(dir, path), 'utf8') })));
  const response = await api.post('/api/projects/import', { data: { name: `M7 visual QA · ${name}`, files } });
  if (!response.ok()) throw new Error(await response.text());
  const { id } = await response.json();
  await page.goto(`${base}/ide`);
  await page.evaluate(({ id, breakpoints }) => { localStorage.setItem('ggjavaez:project', id); localStorage.setItem(`ggjavaez:breakpoints:${id}`, JSON.stringify(breakpoints)); }, { id, breakpoints });
  await page.reload();
  await page.locator('.monaco-editor').waitFor();
  return id;
}
async function shot(name, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  // Allow the finite camera transition and text synchronization to settle.
  await page.waitForTimeout(950);
  const path = join(output, `${name}-${width}x${height}.png`);
  await page.screenshot({ path });
  captures.push({ name, width, height, path: path.slice(process.cwd().length + 1) });
}
async function pause(expected, after = -1) {
  let snapshot;
  await expect.poll(async () => {
    snapshot = await (await api.get('/api/debug/current')).json();
    return snapshot?.status === 'paused' && snapshot.pause.rawEventCount > after && Object.entries(expected).every(([key, value]) => snapshot.pause[key] === value);
  }, { timeout: 15000 }).toBe(true);
  await expect(page.locator('.debug-live-state')).toContainText(`JVM PAUSED · ${snapshot.pause.reason.toUpperCase()}`);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveAttribute('value', await page.getByRole('slider', { name: 'Scrub execution' }).getAttribute('max'));
  return snapshot;
}
async function visualize(name) {
  await fixture(name);
  await page.getByRole('button', { name: 'Visualize', exact: true }).click();
  await page.getByRole('region', { name: 'Error Explorer', exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
}
try {
  await fixture('stepping', [{ fileId: 'Main.java', line: 5 }]);
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  const entry = await pause({ reason: 'entry', className: 'Main' });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const breakpoint = await pause({ reason: 'breakpoint', className: 'Main', line: 5 }, entry.pause.rawEventCount);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  for (const [w, h] of [[1440, 900], [1728, 1117], [1280, 800], [760, 900]]) await shot('breakpoint', w, h);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Step Into', exact: true }).click();
  const worker = await pause({ className: 'Worker', methodName: 'update' }, breakpoint.pause.rawEventCount);
  await page.getByRole('button', { name: 'Step Into', exact: true }).click();
  await pause({ className: 'Person', methodName: 'setAge' }, worker.pause.rawEventCount);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await shot('nested-pause');
  await page.getByRole('button', { name: 'Expand runtime', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await shot('nested-spatial-expanded');
  await page.getByRole('button', { name: 'Restore IDE layout', exact: true }).click();
  await page.getByRole('button', { name: 'Stop Debug', exact: true }).click();

  await visualize('null');
  for (const [w, h] of [[1440, 900], [1728, 1117], [1280, 800], [760, 900]]) await shot('null-error', w, h);
  await page.getByRole('button', { name: 'Expand runtime', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await shot('null-spatial-expanded', 760, 900);
  await page.getByRole('button', { name: 'Restore IDE layout', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('region', { name: 'Error Explorer', exact: true }).getByRole('button', { name: 'name String null', exact: true }).click();
  await page.getByRole('button', { name: 'Trace Cause', exact: true }).click();
  await page.locator('.cause-list button').first().click();
  await shot('causal-history');
  await page.getByRole('button', { name: 'Return to failure', exact: true }).click();
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await shot('null-classic');
  await page.getByRole('button', { name: 'Expand runtime', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await shot('null-classic-expanded');
  await page.getByRole('button', { name: 'Spatial', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await shot('null-spatial-expanded');
  await page.getByRole('button', { name: 'Restore IDE layout', exact: true }).click();

  await visualize('nested');
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await page.locator('.exception-path button').filter({ hasText: 'Unwind' }).first().click();
  await shot('propagation-classic');
  await page.getByRole('button', { name: 'Expand runtime', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await shot('propagation-classic-expanded');
  await page.getByRole('button', { name: 'Spatial', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await shot('propagation-spatial-expanded');
  await page.getByRole('button', { name: 'Restore IDE layout', exact: true }).click();

  await visualize('finally');
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await page.locator('.exception-path button').filter({ hasText: 'Catch' }).first().click();
  await shot('catch-classic');
  await page.getByRole('button', { name: 'Expand runtime', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await shot('catch-classic-expanded');
  await page.getByRole('button', { name: 'Restore IDE layout', exact: true }).click();
  await page.locator('.exception-path button').filter({ hasText: /Finally|Cleanup/ }).first().click();
  await page.getByRole('button', { name: 'Spatial', exact: true }).click();
  await shot('finally-spatial');
  await writeFile(join(output, 'capture.json'), JSON.stringify({ capturedAt: new Date().toISOString(), captures, pageErrors: errors }, null, 2));
  if (errors.length) throw new Error(errors.join('; '));
  console.log(`Reviewed capture inputs: ${captures.length} screenshots; ${errors.length} page errors`);
} finally {
  const session = await (await api.get('/api/debug/current')).json().catch(() => null);
  if (session && ['starting', 'running', 'paused'].includes(session.status)) await api.post(`/api/debug/${session.sessionId}/command`, { data: { command: 'stop' } });
  await browser.close(); await api.dispose();
}
