import { performance } from 'node:perf_hooks';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DebugManager } from '../../server/debug-manager.mjs';
import { detectJdk } from '../../server/jdk.mjs';
import { buildInstrumentationSourceManifest } from '../../server/instrumentation-sources.mjs';
import { TraceNormalizer } from '../../src/instrumentation/normalize.ts';
import { validateTrace } from '../../src/runtime/trace.ts';
import { seek } from '../../src/runtime/seek.ts';

const execFileAsync = promisify(execFile);

/** One user JVM per recorded fixture. Input is sent only after actual waitingForInput.
 * Preparation uses the production transformer; no recorder restart or cap relaxation.
 * Callers must reserve the lead's serialized JVM slot before invoking this helper.
 */
export async function recordFixture(fixture, mainClass, { stdin = null, programArgs = [], sourceTransform = source => source, jdkHome = process.env.VJ_PHASE3_JDK_HOME ?? null } = {}) {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'vj-provenance-')));
  const projectRoot = join(workspace, 'project');
  const classesDir = join(workspace, 'classes');
  const manager = new DebugManager();
  try {
    await cp(fixture, projectRoot, { recursive: true });
    await mkdir(classesDir);
    const sourcePath = join(projectRoot, `${mainClass}.java`);
    await writeFile(sourcePath, sourceTransform(await readFile(sourcePath, 'utf8')));
    const jdk = await detectJdk(jdkHome);
    if (!jdk.available) throw new Error(`Phase 3 JVM fixture requires an available JDK: ${JSON.stringify(jdk)}`);
    await execFileAsync(jdk.javacPath, ['-encoding', 'UTF-8', '-g:lines,vars,source', '-d', classesDir, sourcePath], { timeout: 30000 });
    const manifest = await buildInstrumentationSourceManifest(projectRoot, classesDir);
    let normalizationMs = 0;
    const normalizer = new TraceNormalizer(manifest, `provenance:${mainClass}`);
    const { sessionId } = await manager.start({
      projectId: 'provenance-fixture', projectRoot, classesDir, mainClass,
      javaPath: jdk.javaPath, javacPath: jdk.javacPath, sourcePaths: [sourcePath], sourceManifest: manifest,
      build: { success: true, diagnostics: [], rawOutput: '', mainClasses: [mainClass] },
      breakpoints: [], programArgs, control: false, rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000,
    });
    let snapshot, sequence = 0, inputSent = stdin === null;
    const deadline = Date.now() + 90000;
    for (;;) {
      snapshot = manager.snapshot(sessionId, { transport: 'delta' });
      while (sequence < snapshot.rawEventCount) {
        const delta = manager.raw(sessionId, sequence);
        if (!delta.events.length) throw new Error('Phase 3 raw delta failed to advance');
        const processingStarted = performance.now();
        normalizer.append(delta.events);
        normalizationMs += performance.now() - processingStarted;
        sequence = delta.toSequence;
      }
      if (['exited', 'failed', 'stopped'].includes(snapshot.status)) break;
      if (!inputSent && snapshot.waitingForInput) {
        await manager.input(sessionId, stdin);
        inputSent = true;
      }
      if (Date.now() > deadline) throw new Error('Phase 3 fixture did not exit within its bounded QA deadline');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const finishStarted = performance.now();
    const result = normalizer.finish({
      status: snapshot.status === 'exited' && snapshot.exitCode === 0 ? 'complete' : snapshot.terminalStatus ?? 'program_crashed',
      exitCode: snapshot.exitCode, diagnostic: snapshot.diagnostic, recording: snapshot.recording,
    });
    normalizationMs += performance.now() - finishStarted;
    const trace = validateTrace(result.trace);
    const state = seek(trace, trace.events.length);
    if (!state.executionGraph) throw new Error('Actual JVM trace did not produce an ExecutionGraph');
    return { trace, state, graph: state.executionGraph, snapshot, jdk, inputSent, rawCount: sequence, metrics: { normalizationMs, semanticEvents: trace.events.length, rawEvents: sequence, history: normalizer.history.stats } };
  } finally {
    await manager.dispose().catch(() => {});
    await rm(workspace, { recursive: true, force: true });
  }
}
