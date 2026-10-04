import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { compileProject } from '../../server/compiler.mjs';
import { buildInstrumentationSourceManifest } from '../../server/instrumentation-sources.mjs';
import { prepareInstrumented } from '../../server/instrumentation-provider.mjs';
import { normalizeTrace } from '../../src/instrumentation/normalize.ts';

/**
 * Default: production preparation, transformer, verification and unchanged budgets, one JVM.
 * manualProbes is an isolated Recorder test: the same helper and recorder, with original
 * compiled application classes calling probes reflectively, for exact payload boundaries.
 * Overrides can lower production budgets. They never increase them.
 */
export async function recordProgram(files, {
  stdin = '', timeoutMs = 60000, rawEventLimit, rawByteLimit, manualProbes = false,
  vmArgs = [], beforeLaunch = async () => {}, interact,
} = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'vj-characterization-'));
  const classesDir = join(projectRoot, '.classes');
  let prepared;
  try {
    for (const [name, source] of Object.entries(files)) {
      await mkdir(join(projectRoot, name, '..'), { recursive: true });
      await writeFile(join(projectRoot, name), source);
    }
    const build = await compileProject(projectRoot, classesDir, null, { debug: true });
    if (!build.success) throw new Error(build.rawOutput);
    const manifest = await buildInstrumentationSourceManifest(projectRoot, classesDir);
    prepared = await prepareInstrumented({ projectId: 'characterization', projectRoot, classesDir, mainClass: 'Main',
      javaPath: build.jdk.javaPath, javacPath: build.jdk.javacPath, timeoutMs: 30000, rawEventLimit, rawByteLimit });
    await beforeLaunch(prepared);
    const args = [...vmArgs, ...prepared.args];
    if (manualProbes) {
      // Only isolated test probes can inspect private observer budget/control fields.
      args.unshift('--add-opens=visualjava.observer/visualjava=ALL-UNNAMED');
      const cp = args.indexOf('-cp') + 1;
      args[cp] = args[cp].split(delimiter).map((path) => path === prepared.transformed ? classesDir : path).join(delimiter);
    }
    const execution = await new Promise((resolve, reject) => {
      const child = spawn(build.jdk.javaPath, args, { cwd: prepared.workingDirectory });
      let stdout = '', stderr = '', timedOut = false, interactionError;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
      child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
      child.stdin.on('error', () => {});
      child.once('error', (failure) => { clearTimeout(timer); reject(failure); });
      const control = interact ? Promise.resolve().then(() => interact({ child, prepared,
        readStatus: async () => JSON.parse(await readFile(`${prepared.trace}.status.json`, 'utf8')),
        readRaw: async () => (await readFile(prepared.trace, 'utf8')).split('\n').filter(Boolean).map(JSON.parse),
        output: () => ({ stdout, stderr }),
      })).catch((failure) => { interactionError = failure; child.kill('SIGKILL'); }) : Promise.resolve();
      child.on('close', async (code, signal) => {
        clearTimeout(timer); await control;
        if (interactionError) { interactionError.message += `; Java exit ${code}; stdout ${stdout.slice(-1000)}; stderr ${stderr.slice(-2000)}`; reject(interactionError); }
        else resolve({ code, signal, stdout, stderr, timedOut });
      });
      if (!interact) child.stdin.end(stdin);
    });
    const text = await readFile(prepared.trace, 'utf8').catch(() => '');
    const rawEvents = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const sidecarText = await readFile(`${prepared.trace}.status.json`, 'utf8').catch(() => null);
    const sidecar = sidecarText === null ? null : JSON.parse(sidecarText);
    const recording = sidecar?.recording ?? rawEvents.find((event) => event.type === 'capture_saturated')?.recording;
    // Exit belongs to the actual program; observer state travels independently.
    const status = execution.code === 0 ? 'complete' : 'program_crashed';
    const normalized = normalizeTrace(rawEvents, manifest, { status, exitCode: execution.code, diagnostic: null, recording }, 'characterization');
    return { ...execution, rawEvents, rawText: text, rawBytes: Buffer.byteLength(text), sidecar, sidecarText,
      recording, status, trace: normalized.trace, capability: normalized.capability,
      limits: { rawEventLimit: prepared.rawEventLimit, rawByteLimit: prepared.rawByteLimit } };
  } finally {
    if (prepared) await prepared.cleanup();
    await rm(projectRoot, { recursive: true, force: true });
  }
}

/** Semantic frames in entry order with their caller's method, from the normalized trace. */
export function invocationTree(trace) {
  const frames = new Map();
  const entries = [];
  for (const event of trace.events) if (event.type === 'ENTER_METHOD') {
    const caller = event.callerFrameId ? frames.get(event.callerFrameId) : null;
    const entry = { id: event.frameId, method: `${event.className}.${event.methodName}`, caller: caller?.method ?? null, seq: event.seq };
    frames.set(event.frameId, entry); entries.push(entry);
  }
  return entries;
}

/** Poll actual recorder/control facts without guessing startup duration. */
export async function waitFor(work, predicate = Boolean, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await work().catch(() => null);
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Recorder condition did not arrive: ${JSON.stringify(last)}`);
}
