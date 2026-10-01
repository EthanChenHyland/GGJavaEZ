import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileProject } from '../../server/compiler.mjs';
import { buildInstrumentationSourceManifest } from '../../server/instrumentation-sources.mjs';
import { prepareInstrumented } from '../../server/instrumentation-provider.mjs';
import { normalizeTrace } from '../../src/instrumentation/normalize.ts';

/**
 * Runs a tiny Java program through the *production* instrumentation preparation
 * (prepareInstrumented: pinned ASM, OfflineTransformer, -Xverify:all, default limits)
 * and then launches exactly the prepared JVM command. Nothing here changes limits.
 */
export async function recordProgram(files, { stdin = '', timeoutMs = 60000 } = {}) {
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
      javaPath: build.jdk.javaPath, javacPath: build.jdk.javacPath, timeoutMs: 30000 });
    const execution = await new Promise((resolve) => {
      const child = spawn(build.jdk.javaPath, prepared.args, { cwd: prepared.workingDirectory });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
      child.stdin.end(stdin);
    });
    const text = await readFile(prepared.trace, 'utf8').catch(() => '');
    const rawEvents = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const status = execution.code === 0 ? 'complete'
      : execution.code === 86 && execution.stderr.includes('[VisualJava] trace limit exceeded') ? 'limit_exceeded' : 'program_crashed';
    const normalized = normalizeTrace(rawEvents, manifest, { status, exitCode: execution.code, diagnostic: null }, 'characterization');
    return { ...execution, rawEvents, status, trace: normalized.trace, limits: { rawEventLimit: prepared.rawEventLimit, rawByteLimit: prepared.rawByteLimit } };
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
