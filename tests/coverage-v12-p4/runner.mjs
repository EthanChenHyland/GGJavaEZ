import { cp, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { BuildService } from '../../server/build-service.mjs';
import { DebugManager } from '../../server/debug-manager.mjs';
import { detectJdk } from '../../server/jdk.mjs';
import { resolveLaunch } from '../../server/launch.mjs';
import { buildInstrumentationSourceManifest } from '../../server/instrumentation-sources.mjs';
import { TraceNormalizer } from '../../src/instrumentation/normalize.ts';
import { attachHistory } from '../../src/runtime/history.ts';
import { validateTrace } from '../../src/runtime/trace.ts';
import { seek } from '../../src/runtime/seek.ts';

export const CORPUS_ROOT = fileURLToPath(new URL('../../fixtures/acceptance-v12-p4/', import.meta.url));
export const JVM_ENABLED = process.env.VJ_PHASE4_JVM === '1';
export const CASE_FILTER = process.env.VJ_PHASE4_CASE ?? '';
const GENERATED = new Set(['target', 'build', 'out', '.gradle', '.git', '.ggjavaez', 'node_modules']);

export async function inventory() {
  const entries = await readdir(CORPUS_ROOT, { withFileTypes: true });
  return Promise.all(entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map(async entry => {
    const projectDir = join(CORPUS_ROOT, entry.name);
    return { name: entry.name, projectDir, spec: JSON.parse(await readFile(join(projectDir, 'expected.facts.json'), 'utf8')) };
  }));
}

export async function javaFiles(root) {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (GENERATED.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await javaFiles(path));
    else if (entry.name.endsWith('.java')) paths.push(path);
  }
  return paths.sort();
}

/** Lead must reserve its serialized workload slot before opting in. No subprocess
 * or project write happens on import. One production build and one recorded JVM
 * per call; observation caps are the production defaults unless lowered by a fixture.
 */
export async function recordProject(projectDir, spec, { transform = null } = {}) {
  if (!JVM_ENABLED) throw new Error('Real JVM coverage is opt-in: set VJ_PHASE4_JVM=1 in the lead-authorized serialized slot');
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'vj-phase4-')));
  const projectRoot = join(workspace, 'project');
  const manager = new DebugManager();
  const timings = {};
  try {
    await cp(projectDir, projectRoot, { recursive: true, filter: path => !relative(projectDir, path).split(sep).some(part => GENERATED.has(part)) });
    if (transform) for (const path of await javaFiles(projectRoot)) {
      await writeFile(path, transform(await readFile(path, 'utf8'), relative(projectRoot, path)));
    }
    const jdk = await detectJdk(process.env.VJ_PHASE4_JDK_HOME ?? null);
    if (!jdk.available) throw new Error(`Phase 4 acceptance requires a real JDK: ${JSON.stringify(jdk)}`);
    const builds = new BuildService({ workspaceRoot: workspace,
      projects: { getProjectRoot: async () => projectRoot }, getJdk: async () => jdk });
    let started = performance.now();
    const build = await builds.build('phase4', { debug: true });
    timings.buildMs = performance.now() - started;
    if (!build.success) throw new Error(`Production BuildService failed (${build.project.buildSystem}):\n${build.rawOutput}`);
    const launch = await resolveLaunch({ ...build.project, projectRoot }, { mainClass: spec.mainClass });
    const sourceManifest = await buildInstrumentationSourceManifest(projectRoot, build.project.classesDir, build.project.sourcePaths);
    const demoId = `phase4:${spec.mainClass}`;
    const normalizer = new TraceNormalizer(sourceManifest, demoId);
    const rawEvents = [], batches = [];
    started = performance.now();
    const { sessionId } = await manager.start({ projectId: 'phase4', projectRoot, classesDir: build.project.classesDir,
      ...launch, sourcePaths: build.project.sourcePaths, sourceManifest, javaPath: jdk.javaPath, javacPath: jdk.javacPath,
      build: { ...build, project: undefined }, breakpoints: [], control: false,
      rawEventLimit: spec.rawEventLimit ?? 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 });
    let snapshot, sequence = 0, normalizationMs = 0, sent = spec.stdin === undefined;
    const deadline = Date.now() + 90000;
    for (;;) {
      snapshot = manager.snapshot(sessionId, { transport: 'delta' });
      while (sequence < snapshot.rawEventCount) {
        const delta = manager.raw(sessionId, sequence);
        if (!delta.events.length || delta.fromSequence !== sequence || delta.toSequence <= sequence)
          throw new Error('Production raw delta failed to advance its contiguous sequence');
        rawEvents.push(...delta.events);
        const start = performance.now();
        normalizer.append(delta.events);
        normalizationMs += performance.now() - start;
        batches.push({ from: sequence, to: delta.toSequence, historyLength: normalizer.history.length,
          deltaBytes: Buffer.byteLength(JSON.stringify(delta)) });
        sequence = delta.toSequence;
      }
      if (['exited', 'failed', 'stopped'].includes(snapshot.status)) break;
      if (!sent && snapshot.waitingForInput) { await manager.input(sessionId, spec.stdin); sent = true; }
      if (Date.now() > deadline) throw new Error('Phase 4 JVM exceeded acceptance deadline; production cleanup will stop it');
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    timings.executionMs = performance.now() - started;
    const terminal = { status: snapshot.status === 'exited' && snapshot.exitCode === 0 ? 'complete' : snapshot.terminalStatus ?? 'program_crashed',
      exitCode: snapshot.exitCode, diagnostic: snapshot.diagnostic, recording: snapshot.recording };
    started = performance.now();
    const normalized = normalizer.finish(terminal);
    attachHistory(normalized.trace, normalizer.history);
    const trace = validateTrace(normalized.trace);
    timings.normalizationMs = normalizationMs + performance.now() - started;
    const state = seek(trace, trace.events.length);
    const files = {};
    for (const path of Object.keys(spec.files ?? {})) {
      const absolute = resolve(projectRoot, path), rel = relative(projectRoot, absolute);
      if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Fixture output path escapes project');
      files[path] = await readFile(absolute, 'utf8');
    }
    return { spec, trace, state, graph: state.executionGraph, rawEvents, batches, sourceManifest, demoId, terminal,
      history: normalizer.history, capability: normalized.capability, snapshot, files, inputSent: sent,
      dependencies: build.project.dependencies, buildSystem: build.project.buildSystem,
      // Version strings identify the actual runtime. Release settings are fixture inputs, not compatibility claims.
      jdk, timings, runtimeClasspathEntries: launch.classpath.length,
      classpaths: { compile: build.project.compileClasspath, runtime: launch.classpath },
      // Evidence writer removes these paths; none belongs in retained JSON.
      redactPaths: [build.project.classesDir, projectRoot, workspace] };
  } finally {
    try { await manager.dispose(); } finally { await rm(workspace, { recursive: true, force: true }); }
  }
}
