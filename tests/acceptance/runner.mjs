import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { BuildService } from '../../server/build-service.mjs';
import { DebugManager } from '../../server/debug-manager.mjs';
import { buildInstrumentationSourceManifest } from '../../server/instrumentation-sources.mjs';
import { detectJdk } from '../../server/jdk.mjs';
import { resolveLaunch } from '../../server/launch.mjs';
import { normalizeTrace } from '../../src/instrumentation/normalize.ts';
import { validateTrace } from '../../src/runtime/trace.ts';
import { seek } from '../../src/runtime/seek.ts';
import { layoutForTrace } from '../../src/app/layoutForTrace.ts';
import { buildSceneModel } from '../../src/world/sceneModel.ts';

/**
 * Runs one acceptance project through the same production path as IDE Run:
 * BuildService (plain/Maven/Gradle) → resolveLaunch → source manifest → DebugManager
 * recorder session (control: false; production limits 20,000 events / 8 MiB / 30 s) →
 * normalizeTrace → validateTrace → seek/layout/scene. It changes no limits and no transport.
 */
export async function runAcceptanceProject(projectDir, { stdin = null, stdinDelayMs = 300, mainClass = null } = {}) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'vj-acceptance-'));
  const projectRoot = join(workspaceRoot, 'project');
  await cp(projectDir, projectRoot, { recursive: true, filter: (path) => !/[\\/](target|build|out|\.gradle)([\\/]|$)/.test(path.slice(projectDir.length)) && !path.endsWith('expected.facts.json') });
  await mkdir(join(workspaceRoot, 'build'), { recursive: true });
  const jdk = await detectJdk(null);
  const builds = new BuildService({ workspaceRoot, projects: { getProjectRoot: async () => projectRoot }, getJdk: async () => jdk });
  const debuggerSessions = new DebugManager();
  const timings = {};
  try {
    let started = performance.now();
    const compilation = await builds.build('acceptance', { debug: true });
    timings.buildMs = Math.round(performance.now() - started);
    if (!compilation.success) return { built: false, buildOutput: compilation.rawOutput, diagnostics: compilation.diagnostics, timings };
    const launch = await resolveLaunch({ ...compilation.project, projectRoot }, mainClass ? { mainClass } : {});
    const chosen = mainClass ?? launch.mainClass ?? compilation.mainClasses[0];
    const base = { projectId: 'acceptance', projectRoot, classesDir: compilation.project.classesDir, ...launch, mainClass: chosen,
      javaPath: jdk.javaPath, javacPath: jdk.javacPath, sourcePaths: compilation.project.sourcePaths };
    const sourceManifest = await buildInstrumentationSourceManifest(projectRoot, base.classesDir, base.sourcePaths);
    started = performance.now();
    const { sessionId } = await debuggerSessions.start({ ...base, sourceManifest, build: { ...compilation, project: undefined },
      breakpoints: [], control: false, rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 });
    let sent = stdin === null;
    let snapshot;
    for (const deadline = Date.now() + 90000; ;) {
      snapshot = debuggerSessions.snapshot(sessionId);
      if (['exited', 'failed', 'stopped'].includes(snapshot.status)) break;
      if (!sent && snapshot.rawEvents.some((event) => event.type === 'stdin_wait')) {
        await new Promise((resolve) => setTimeout(resolve, stdinDelayMs));
        await debuggerSessions.input(sessionId, stdin); sent = true;
      }
      if (Date.now() > deadline) { await debuggerSessions.stop(sessionId); snapshot = debuggerSessions.snapshot(sessionId); break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    timings.executionMs = Math.round(performance.now() - started);
    const terminal = snapshot.status === 'exited' && snapshot.exitCode === 0 ? 'complete' : snapshot.terminalStatus ?? 'program_crashed';
    started = performance.now();
    const normalized = normalizeTrace(snapshot.rawEvents, snapshot.sourceManifest, { status: terminal, exitCode: snapshot.exitCode, diagnostic: snapshot.diagnostic }, `acceptance:${sessionId}`);
    const trace = validateTrace(normalized.trace);
    trace.capture = { origin: 'jvm', sourceHashes: {}, recordedAt: '1970-01-01T00:00:00.000Z' };
    timings.normalizeMs = Math.round(performance.now() - started);
    started = performance.now();
    const final = seek(trace, trace.events.length);
    const layout = layoutForTrace(trace);
    const scene = buildSceneModel(final, layout, 'meso');
    timings.worldMs = Math.round(performance.now() - started);
    return { built: true, dependencies: compilation.project.dependencies ?? [], buildSystem: compilation.project.buildSystem, snapshot, trace, capability: normalized.capability, final, layout, scene, timings, mainClass: chosen };
  } finally {
    await debuggerSessions.stop().catch(() => {});
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

export async function readFacts(projectDir) {
  return JSON.parse(await readFile(join(projectDir, 'expected.facts.json'), 'utf8'));
}
