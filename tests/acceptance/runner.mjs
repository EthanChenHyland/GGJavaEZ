import { cp, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { BuildService } from '../../server/build-service.mjs';
import { DebugManager } from '../../server/debug-manager.mjs';
import { buildInstrumentationSourceManifest } from '../../server/instrumentation-sources.mjs';
import { detectJdk } from '../../server/jdk.mjs';
import { resolveLaunch } from '../../server/launch.mjs';
import { TraceNormalizer } from '../../src/instrumentation/normalize.ts';
import { validateTrace } from '../../src/runtime/trace.ts';
import { seek } from '../../src/runtime/seek.ts';
import { attachHistory } from '../../src/runtime/history.ts';
import { projectTrace } from '../../src/testing/projectTrace.ts';

/**
 * Runs one acceptance project through the same production path as IDE Run:
 * BuildService (plain/Maven/Gradle) → resolveLaunch → source manifest → DebugManager
 * recorder session (control: false; production limits 20,000 events / 8 MiB / 30 s) →
 * raw sequence deltas → incremental normalization/history → seek/layout/scene. Limits are unchanged.
 */
export async function runAcceptanceProject(projectDir, { stdin = null, stdinDelayMs = 300, mainClass = null } = {}) {
  // macOS aliases /var to /private/var; build tools emit canonical absolute paths.
  // Match that spelling in this isolated harness without relaxing project boundaries.
  const workspaceRoot = await realpath(await mkdtemp(join(tmpdir(), 'vj-acceptance-')));
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
    let snapshot, rawCursor = 0, processingMs = 0, deltaBytes = 0;
    const normalizer = new TraceNormalizer(sourceManifest, `acceptance:${sessionId}`);
    const history = normalizer.history;

    for (const deadline = Date.now() + 90000; ;) {
      snapshot = debuggerSessions.snapshot(sessionId, { transport: 'delta' });
      while (rawCursor < snapshot.rawEventCount) {
        const delta = debuggerSessions.raw(sessionId, rawCursor);
        if (!delta.events.length) throw new Error('Acceptance delta made no progress');
        deltaBytes += Buffer.byteLength(JSON.stringify(delta));
        const processingStart = performance.now();
        normalizer.append(delta.events);

        processingMs += performance.now() - processingStart;
        rawCursor = delta.toSequence;
      }
      if (['exited', 'failed', 'stopped'].includes(snapshot.status)) break;
      if (!sent && snapshot.waitingForInput) {
        await new Promise((resolve) => setTimeout(resolve, stdinDelayMs));
        await debuggerSessions.input(sessionId, stdin); sent = true;
      }
      if (Date.now() > deadline) { await debuggerSessions.stop(sessionId); snapshot = debuggerSessions.snapshot(sessionId); break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    timings.executionMs = Math.round(performance.now() - started);
    const terminal = snapshot.status === 'exited' && snapshot.exitCode === 0 ? 'complete' : snapshot.terminalStatus ?? 'program_crashed';
    started = performance.now();
    const normalized = normalizer.finish({ status: terminal, exitCode: snapshot.exitCode, diagnostic: snapshot.diagnostic, recording: snapshot.recording });

    attachHistory(normalized.trace, history);
    const trace = validateTrace(normalized.trace);
    trace.capture = { origin: 'jvm', sourceHashes: {}, recordedAt: '1970-01-01T00:00:00.000Z' };
    timings.normalizeMs = Math.round(processingMs + performance.now() - started);
    timings.deltaBytes = deltaBytes; timings.rawBatchesHead = rawCursor;
    started = performance.now();
    const final = seek(trace, trace.events.length);
    const projection = projectTrace(trace, { sessionEnded: ['exited', 'failed', 'stopped'].includes(snapshot.status), recording: snapshot.recording });
    const layout = projection.layout;
    const scene = projection.project(trace.events.length);
    timings.worldMs = Math.round(performance.now() - started);
    snapshot = debuggerSessions.snapshot(sessionId); // One explicit legacy materialization for unchanged fact assertions.
    return { built: true, dependencies: compilation.project.dependencies ?? [], buildSystem: compilation.project.buildSystem, snapshot, trace, capability: normalized.capability, final, layout, scene, timings, mainClass: chosen };
  } finally {
    await debuggerSessions.dispose().catch(() => {});
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

export async function readFacts(projectDir) {
  return JSON.parse(await readFile(join(projectDir, 'expected.facts.json'), 'utf8'));
}
