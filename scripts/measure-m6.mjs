import { chromium, request } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const base = 'http://127.0.0.1:5173';
const api = await request.newContext({ baseURL: base });
const fixtures = {
  person: [
    { path: 'Main.java', content: 'public class Main { public static void main(String[] args) { Person p=new Person("Ethan"); p.setAge(18); } }' },
    { path: 'Person.java', content: 'public class Person { String name; int age; Person(String name) { this.name=name; } void setAge(int age) { this.age=age; } }' },
  ],
  recursion: [{ path: 'Main.java', content: 'public class Main { static int factorial(int n) { if(n<=1)return 1; return n*factorial(n-1); } public static void main(String[] args) { System.out.println(factorial(5)); } }' }],
  arrays: [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { int[] a={3,8,1,6,2}; for(int i=0;i<a.length-1;i++) for(int j=0;j<a.length-1-i;j++) if(a[j]>a[j+1]) { int t=a[j]; a[j]=a[j+1]; a[j+1]=t; } } }' }],
  exception: [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { String value=null; System.out.println(value.length()); } }' }],
};
const measurements = {};
let personProjectId = '';
for (const [name, files] of Object.entries(fixtures)) {
  const imported = await api.post('/api/projects/import', { data: { name: `M6 measure ${name}`, files } });
  if (!imported.ok()) throw new Error(`Import failed: ${name}`);
  const { id } = await imported.json();
  if (name === 'person') personProjectId = id;
  const start = performance.now();
  const response = await api.post(`/api/projects/${id}/visualize`, { data: { mainClass: 'Main' } });
  const elapsedMs = Math.round(performance.now() - start);
  if (!response.ok()) throw new Error(`Visualize failed: ${name} (${response.status()})`);
  const result = await response.json();
  measurements[name] = { status: result.status, requestMs: elapsedMs, compileMs: result.build.elapsedMs,
    ...result.metrics, normalizedCapability: result.capability?.status,
    sourceFiles: result.sourceManifest.sources.length, stdoutBytes: Buffer.byteLength(result.stdout),
    stderrBytes: Buffer.byteLength(result.stderr) };
}
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.addInitScript((id) => localStorage.setItem('ggjavaez:project', id), personProjectId);
await page.goto(`${base}/ide`);
await page.locator('.monaco-editor').waitFor();
await page.getByRole('button', { name: 'Visualize' }).click();
await page.locator('.app-shell--embedded').waitFor({ timeout: 30000 });
const slider = page.getByRole('slider', { name: 'Scrub execution' });
const seekPaintMs = [];
for (let cursor = 4; cursor <= 20; cursor++) {
  const start = performance.now();
  await slider.fill(String(cursor));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  seekPaintMs.push({ cursor, ms: performance.now() - start });
}
const sortedSeeks = [...seekPaintMs].sort((a, b) => a.ms - b.ms);
measurements.browser = { viewport: '1440x900', seekToNextPaintMedianMs: Math.round(sortedSeeks[Math.floor(sortedSeeks.length / 2)].ms),
  seekToNextPaintP95Ms: Math.round(sortedSeeks[Math.floor(sortedSeeks.length * 0.95)].ms), seekPaintMs: seekPaintMs.map(({ cursor, ms }) => ({ cursor, ms: Math.round(ms) })),
  canvas: await page.getByRole('region', { name: 'Runtime world' }).locator('canvas').evaluate((el) => ({ width: el.width, height: el.height })) };
await browser.close();
await api.dispose();
await writeFile(join(process.cwd(), 'docs/checkpoints/jvm-v6/performance.json'), JSON.stringify(measurements, null, 2));
console.log(JSON.stringify(measurements, null, 2));
