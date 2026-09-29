/* global process, localStorage, window, PerformanceObserver, WebGLRenderingContext, WebGL2RenderingContext, performance, fetch, requestAnimationFrame, document, console */
import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { compileProject } from '../server/compiler.mjs';
import { buildInstrumentationSourceManifest } from '../server/instrumentation-sources.mjs';

// One bounded Person/recursion capture, reused across fresh browser contexts and
// both phases. Never runs the M6 measurement or overwrites its checkpoints.
const phase = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(phase)) throw new Error('Use before or after');
const base = process.env.M7_BASE_URL ?? 'http://127.0.0.1:5173';
const output = join(process.cwd(), 'docs/checkpoints/debug-v7');
await mkdir(output, { recursive: true });
const path = join(output, 'performance.json');
const evidence = await readFile(path, 'utf8').then(JSON.parse).catch(() => ({ version: 1 }));
if (!evidence.fixtures) {
  const ids = JSON.parse(await readFile('docs/checkpoints/jvm-v6/capture.json', 'utf8'));
  evidence.fixtures = {};
  // Pin the recorder to the accepted M6 commit while parallel debugger work is
  // in flight. Only temporary helper/build files are written outside this report.
  const root = await mkdtemp(join(tmpdir(), 'visual-java-m7-measure-'));
  const git = promisify(execFile);
  try {
    await mkdir(join(root, 'server'), { recursive: true });
    await mkdir(join(root, 'instrumentation/java/visualjava'), { recursive: true });
    for (const file of ['server/instrumentation-provider.mjs', 'instrumentation/java/visualjava/Recorder.java', 'instrumentation/java/visualjava/OfflineTransformer.java']) {
      const { stdout } = await git('git', ['show', `34111e4:${file}`]);
      await writeFile(join(root, file), stdout);
    }
    await symlink(join(process.cwd(), 'instrumentation/lib'), join(root, 'instrumentation/lib'));
    const { runInstrumented } = await import(pathToFileURL(join(root, 'server/instrumentation-provider.mjs')).href);
    for (const [name, id] of [['person', ids.projectId], ['recursion', ids.recursionId]]) {
      const projectRoot = join(process.cwd(), '.ggjavaez/projects', id);
      const classesDir = join(root, name);
      const build = await compileProject(projectRoot, classesDir, undefined, { debug: true });
      if (!build.success) throw new Error(build.rawOutput);
      const sourceManifest = await buildInstrumentationSourceManifest(projectRoot, classesDir);
      const capture = await runInstrumented({ ...build.jdk, classesDir, mainClass: 'Main', sourcePaths: sourceManifest.sources.map(s => s.fileId) });
      if (capture.status !== 'complete') throw new Error(`${name}: ${capture.diagnostic}`);
      evidence.fixtures[name] = { id, payload: { build, ...capture, sourceManifest } };
    }
    evidence.recorderCommit = '34111e4';
  } finally { await rm(root, { recursive: true, force: true }); }
  await writeFile(path, JSON.stringify(evidence, null, 2));
}
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
const samples = [];
async function open(name, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  // Compare the same current shell without changing shared working-tree files.
  // Baseline disables only our preload/characters and adaptive label policy.
  if (phase === 'before') {
    for (const file of ['theme/tokens.ts', 'scene/primitives/RuntimeLabel.tsx', 'scene/primitives/FrameSolid.tsx']) {
      await page.route(`**/src/${file}*`, async route => {
        const response = await route.fetch();
        let body = await response.text();
        const previous = body;
        if (file.endsWith('FrameSolid.tsx')) body = body.replace('labelPolicy.current.enabled = readable && !spacious && !scoped;', 'labelPolicy.current.enabled = false;');
        else {
          body = body.replace(/\bpreloadRuntimeText\(\);/g, '');
          body = body.replace(/characters: runtimeCharacters,/g, '');
        }
        if (body === previous) throw new Error(`Baseline override did not match ${file}`);
        await route.fulfill({ response, body });
      });
    }
  }
  const { id, payload } = evidence.fixtures[name];
  await page.route(`**/api/projects/${id}/visualize`, route => route.fulfill({ json: payload }));
  await page.addInitScript(id => {
    localStorage.setItem('ggjavaez:project', id);
    window.__m7 = { calls: [], tasks: [], frames: [], text: [], start: 0 };
    new PerformanceObserver(list => window.__m7.tasks.push(...list.getEntries().map(e => ({ start: e.startTime, ms: e.duration })))).observe({ type: 'longtask', buffered: true });
    for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const method of ['compileShader', 'linkProgram', 'getProgramParameter', 'texImage2D', 'readPixels']) {
        const original = Type.prototype[method];
        Type.prototype[method] = function (...args) {
          const start = performance.now();
          const result = original.apply(this, args);
          window.__m7.calls.push({ method, start, ms: performance.now() - start });
          return result;
        };
      }
    }
  }, id);
  await page.goto(`${base}/ide`);
  await page.locator('.monaco-editor').waitFor();
  // Resolve exactly the Fiber module already used by this Vite app (same URL).
  await page.evaluate(async () => {
    const source = await (await fetch('/src/scene/RuntimeCanvas.tsx')).text();
    const url = source.match(/from "([^"]*@react-three_fiber[^" ]*)"/)[1];
    const { _roots, addAfterEffect } = await import(url);
    window.__m7.roots = _roots;
    addAfterEffect(() => {
      const labels = [];
      for (const { store } of _roots.values()) {
        const state = store.getState();
        state.scene.traverse(mesh => {
          if (typeof mesh.sync === 'function' && typeof mesh.text === 'string') {
            labels.push({ text: mesh.text, ready: !!mesh.textRenderInfo && !mesh._isSyncing && !mesh._needsSync,
              visible: mesh.visible && mesh.parent?.visible !== false, scale: mesh.scale.x, fontSize: mesh.fontSize,
              timings: mesh.textRenderInfo?.timings });
          }
        });
      }
      window.__m7.text = labels;
      if (labels.length) window.__m7.frames.push({ at: performance.now(), ready: labels.every(label => label.ready), texts: labels.map(l => l.text) });
    });
  });
  await page.evaluate(() => { window.__m7.visualizeAt = performance.now(); });
  await page.getByRole('button', { name: 'Visualize', exact: true }).click();
  await page.locator('.app-shell--embedded').waitFor();
  return { page, context };
}
async function seek(page, cursor, expectedText) {
  await page.evaluate(() => { window.__m7.start = performance.now(); window.__m7.frames = []; });
  await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(cursor));
  const legacyMs = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - window.__m7.start)))));
  await page.waitForFunction(text => window.__m7.frames.some(frame => frame.ready && frame.texts.includes(text)), expectedText);
  return page.evaluate(({ legacyMs, expectedText }) => {
    const data = window.__m7;
    const frame = data.frames.find(frame => frame.ready && frame.texts.includes(expectedText));
    const calls = data.calls.filter(call => call.start >= data.start);
    return { cursor: document.querySelector('.vj-timeline__count')?.textContent, twoRafMs: legacyMs,
      labelsReadyRenderMs: frame.at - data.start, labels: data.text,
      startup: { visualizeAt: data.visualizeAt, inputAt: data.start,
        marks: performance.getEntriesByType('mark').filter(mark => mark.name.startsWith('visual-java:text')).map(mark => ({ name: mark.name, at: mark.startTime })) },
      longTasks: data.tasks.filter(task => task.start + task.ms >= data.start),
      webgl: Object.fromEntries([...new Set(calls.map(call => call.method))].map(method => {
        const timings = calls.filter(call => call.method === method).map(call => call.ms);
        return [method, { count: timings.length, totalMs: timings.reduce((a, b) => a + b, 0), maxMs: Math.max(0, ...timings) }];
      })) };
  }, { legacyMs, expectedText });
}
try {
  for (let i = 0; i < 3; i++) {
    const { page, context } = await open('person');
    const trace = await page.evaluate(async payload => {
      const { normalizeTrace } = await import('/src/instrumentation/normalize.ts');
      return normalizeTrace(payload.rawEvents, payload.sourceManifest, payload, 'm7-measure').trace;
    }, evidence.fixtures.person.payload);
    const allocation = trace.events.findIndex(e => e.type === 'ALLOCATE_OBJECT') + 1;
    const mutation = trace.events.findIndex(e => e.type === 'SET_FIELD' && e.label.includes('age')) + 1;
    if (!allocation || !mutation) throw new Error('Expected Person events absent');
    // Two immediate seeks reproduce M6's scheduling. The third isolates
    // allocation after stack labels have fully synchronized and rendered.
    if (i === 2) await seek(page, allocation - 1, 'main()');
    else {
      await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(allocation - 1));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    const cold = await seek(page, allocation, 'HEAP OBJECT');
    await seek(page, allocation - 1, 'main()');
    const warm = await seek(page, allocation, 'HEAP OBJECT');
    const update = await seek(page, mutation, 'HEAP OBJECT');
    if (i === 0) { await page.waitForTimeout(300); await page.screenshot({ path: join(output, `${phase}-person.png`) }); }
    samples.push({ stackSettledFirst: i === 2, allocation, mutation, cold, warm, update });
    await context.close();
  }
  const { page, context } = await open('recursion');
  await page.locator('.vj-timeline__marker[title="factorial entered"]').nth(3).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.waitForTimeout(900);
  const geometry = () => page.evaluate(() => [...window.__m7.roots.values()].flatMap(({ store }) => {
    const nodes = [];
    store.getState().scene.traverse(mesh => {
      if (mesh.castShadow && mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        nodes.push({ matrixWorld: mesh.matrixWorld.toArray(), bounds: [mesh.geometry.boundingBox.min.toArray(), mesh.geometry.boundingBox.max.toArray()] });
      }
    });
    return nodes;
  }));
  const overviewGeometry = await geometry();
  await page.screenshot({ path: join(output, `${phase}-recursion-overview.png`) });
  const overviewLabels = await page.evaluate(() => window.__m7.text);
  await page.getByRole('button', { name: 'Expand runtime' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(output, `${phase}-recursion-expanded.png`) });
  const chooser = page.getByRole('combobox', { name: 'Select runtime entity' });
  const selected = await chooser.locator('option').filter({ hasText: /^factorial\(\)$/ }).last().getAttribute('value');
  await chooser.selectOption(selected);
  await page.getByRole('button', { name: 'Focus selected entity' }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(output, `${phase}-recursion-focus.png`) });
  evidence[phase] = { measuredAt: new Date().toISOString(), environment: 'Chrome headless, Vite dev, balanced, 1440x900, DPR 1',
    baselineMethod: 'Same current frontend; before browser responses disable preload calls, Text characters, and projected label policy; no source rollback',
    metric: 'twoRafMs includes automation; labelsReadyRenderMs ends after a Fiber render with all mounted text synchronized (not physical display presentation)',
    samples, overviewGeometry, overviewLabels, focusedLabels: await page.evaluate(() => window.__m7.text), errors };
  if (evidence.before && evidence.after) {
    const round = value => Math.round(value * 10) / 10;
    evidence.comparison = {
      freshImmediateAllocationMs: Object.fromEntries(['before', 'after'].map(phase => [phase, evidence[phase].samples.filter(s => !s.stackSettledFirst).map(s => round(s.cold.labelsReadyRenderMs))])),
      stackSettledAllocationMs: Object.fromEntries(['before', 'after'].map(phase => [phase, round(evidence[phase].samples.find(s => s.stackSettledFirst).cold.labelsReadyRenderMs)])),
      overviewBodyGeometryIdentical: JSON.stringify(evidence.before.overviewGeometry) === JSON.stringify(evidence.after.overviewGeometry),
      note: 'Two immediate fresh samples and one stack-settled fresh sample per phase; descriptive evidence, not a percentile estimate',
    };
    if (!evidence.comparison.overviewBodyGeometryIdentical) throw new Error('Body bounds/world transforms changed between phases');
  }
  await context.close();
  await writeFile(path, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ phase, samples: samples.map(({ stackSettledFirst, cold, warm, update }) => ({ stackSettledFirst,
    coldMs: cold.labelsReadyRenderMs, warmMs: warm.labelsReadyRenderMs, updateMs: update.labelsReadyRenderMs,
    twoRafMs: cold.twoRafMs, longestTaskMs: Math.max(0, ...cold.longTasks.map(t => t.ms)),
    slowGl: Object.entries(cold.webgl).filter(([, c]) => c.maxMs > 10) })), errors }, null, 2));
  if (errors.length) throw new Error(errors.join('; '));
} finally { await browser.close(); }
