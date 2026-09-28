import { chromium, request } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = 'http://127.0.0.1:5173';
const output = join(process.cwd(), 'docs/checkpoints/jvm-v6');
await mkdir(output, { recursive: true });
const api = await request.newContext({ baseURL: base });
const imported = await api.post('/api/projects/import', { data: { name: 'M6 QA Person', files: [
  { path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    Person p = new Person("Ethan");\n    p.setAge(18);\n  }\n}\n' },
  { path: 'Person.java', content: 'public class Person {\n  String name;\n  int age;\n  Person(String name) { this.name = name; }\n  void setAge(int age) { this.age = age; }\n}\n' },
] } });
if (!imported.ok()) throw new Error(`Project import failed: ${imported.status()}`);
const { id } = await imported.json();
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.addInitScript((projectId) => localStorage.setItem('ggjavaez:project', projectId), id);
await page.goto(`${base}/ide`);
await page.locator('.monaco-editor').waitFor();
await page.getByRole('button', { name: 'Visualize' }).click();
await page.locator('.app-shell--embedded').waitFor({ timeout: 30000 });
await page.locator('.vj-timeline__marker[title="age: 0 → 18"]').click();
await page.locator('.ide-tab.is-active').filter({ hasText: 'Person.java' }).waitFor();
for (const [width, height] of [[1440, 900], [1728, 1117], [1280, 800], [760, 900]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(output, `person-mutation-${width}x${height}.png`) });
}
await page.getByRole('button', { name: 'Expand runtime' }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: join(output, 'person-expanded-760x900.png') });
await page.getByRole('button', { name: 'Restore IDE layout' }).click();
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByRole('button', { name: 'Classic', exact: true }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: join(output, 'person-classic-1440x900.png') });
await page.getByRole('button', { name: 'Spatial', exact: true }).click();
const entity = page.getByRole('combobox', { name: 'Select runtime entity' });
const objectId = await entity.locator('option').filter({ hasText: /Person #/ }).first().getAttribute('value');
if (!objectId) throw new Error('Person identity absent in scene selector');
await entity.selectOption(objectId);
await page.waitForTimeout(300);
await page.screenshot({ path: join(output, 'person-selected-1440x900.png') });
const example = async (name, files, stage, screenshot) => {
  const response = await api.post('/api/projects/import', { data: { name: `M6 QA ${name}`, files } });
  if (!response.ok()) throw new Error(`${name} import failed`);
  const { id: projectId } = await response.json();
  const view = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  view.on('pageerror', (error) => pageErrors.push(`${name}: ${error.message}`));
  await view.addInitScript((chosen) => localStorage.setItem('ggjavaez:project', chosen), projectId);
  await view.goto(`${base}/ide`);
  await view.locator('.monaco-editor').waitFor();
  await view.getByRole('button', { name: 'Visualize' }).click();
  await view.locator('.app-shell--embedded').waitFor({ timeout: 30000 });
  await stage(view);
  await view.waitForTimeout(1000);
  await view.screenshot({ path: join(output, screenshot) });
  await view.close();
  return projectId;
};
const recursionId = await example('recursion', [{ path: 'Main.java', content: 'public class Main {\n  static int factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n  }\n  public static void main(String[] args) { System.out.println(factorial(5)); }\n}\n' }],
  async (view) => { await view.locator('.vj-timeline__marker[title="factorial entered"]').nth(3).click(); await view.getByRole('button', { name: 'Overview' }).click(); await view.waitForTimeout(900); await view.screenshot({ path: join(output, 'recursion-spatial-1440x900.png') }); await view.getByRole('button', { name: 'Expand runtime' }).click(); await view.waitForTimeout(900); await view.screenshot({ path: join(output, 'recursion-expanded-1440x900.png') }); const chooser = view.getByRole('combobox', { name: 'Select runtime entity' }); const deepest = await chooser.locator('option').filter({ hasText: /^factorial\(\)$/ }).last().getAttribute('value'); if (!deepest) throw new Error('factorial frame missing'); await chooser.selectOption(deepest); await view.getByRole('button', { name: 'Focus selected entity' }).click(); }, 'recursion-focused-1440x900.png');
const arrayId = await example('arrays', [{ path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    int[] a={3,8,1,6,2};\n    for(int i=0;i<a.length-1;i++) for(int j=0;j<a.length-1-i;j++) if(a[j]>a[j+1]) { int t=a[j]; a[j]=a[j+1]; a[j+1]=t; }\n  }\n}\n' }],
  async (view) => { await view.locator('.vj-timeline__marker[title^="Write ["]').first().click(); await view.getByRole('button', { name: 'Theater', exact: true }).click(); },
  'arrays-theater-1440x900.png');
const controlId = await example('control', [{ path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    int sum=0;\n    for(int i=0;i<3;i++) { if(i%2==0) sum+=i; }\n    System.out.println(sum);\n  }\n}\n' }],
  async (view) => { await view.locator('.vj-timeline__marker[title="JVM branch evaluated"]').first().click(); },
  'control-branch-1440x900.png');
const exceptionId = await example('exception', [{ path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    String value=null;\n    System.out.println(value.length());\n  }\n}\n' }],
  async (view) => { const scrub = view.getByRole('slider', { name: 'Scrub execution' }); await scrub.fill(await scrub.getAttribute('max')); await view.locator('.event-chip--failure').waitFor(); },
  'exception-1440x900.png');
await writeFile(join(output, 'capture.json'), JSON.stringify({ projectId: id, recursionId, arrayId, controlId, exceptionId, pageErrors,
  eventCount: Number(await page.getByRole('slider', { name: 'Scrub execution' }).getAttribute('max')),
  objectId, capturedAt: new Date().toISOString() }, null, 2));
await browser.close();
await api.dispose();
if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join('; ')}`);
