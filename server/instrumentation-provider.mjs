import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const javaSources = [join(root, 'instrumentation/java/visualjava/Recorder.java'), join(root, 'instrumentation/java/visualjava/OfflineTransformer.java')];
const jars = ['asm', 'asm-tree', 'asm-util', 'asm-analysis'].map((name) => join(root, `instrumentation/lib/${name}-9.10.1.jar`));
const hashes = {
  'asm-9.10.1.jar': 'ed825d10ab1399c8c0cb669e688cf0c8c82629b4c8399b58352b68e92ca10fcb',
  'asm-tree-9.10.1.jar': '3dfb0d5b6a106cd40b5b250e39935fbf2f927f4477546a5369a3ac609cf0506b',
  'asm-util-9.10.1.jar': '1bb99d091fba2597dc6d51193e9bbcf0d8447e7ed96bd8f0198b18152f09655c',
  'asm-analysis-9.10.1.jar': 'dede75a21306b65974ecd8f87114ff6970f09fb794157a4ca09ab25c888c2bfc',
};
const featureNames = ['methods', 'locals', 'objects', 'fields', 'references', 'intArrays', 'arrayReads', 'arrayWrites', 'sourceMapping', 'branches', 'loops', 'scopes', 'returns', 'exceptions', 'console'];
const EVENT_LIMIT = 20000, BYTE_LIMIT = 8 * 1024 * 1024, DEADLINE = 30000;
const OUTPUT_LIMIT = 8 * 1024 * 1024;

function emptyResult() {
  return { status: 'instrumentation_failed', exitCode: null, diagnostic: null, rawEvents: [], stdout: '', stderr: '',
    capability: { status: 'unsupported', features: Object.fromEntries(featureNames.map((name) => [name, { status: 'unsupported', reason: 'No verified execution', observedEvents: 0 }])), coveredClasses: [], diagnostics: [] },
    metrics: { transformMs: 0, jvmStartupMs: 0, executionMs: 0, rawBytes: 0, rawEvents: 0 } };
}
function killGroup(child) {
  try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* exited */ }
}
function run(command, args, { cwd, timeoutMs, monitor, outputLimit = OUTPUT_LIMIT }) {
  return new Promise((resolveRun) => {
    const started = performance.now();
    let child, stdout = '', stderr = '', stopped = null, settled = false;
    try { child = spawn(command, args, { cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32' }); }
    catch (error) { resolveRun({ code: null, error: error.message, stdout, stderr, stopped: 'spawn', duration: performance.now() - started }); return; }
    const terminate = (reason) => { if (!stopped) { stopped = reason; killGroup(child); } };
    const timer = setTimeout(() => terminate('timeout'), timeoutMs);
    const interval = monitor ? setInterval(async () => {
      if (settled) return;
      try { const reason = await monitor(); if (reason) terminate(reason); } catch (error) { terminate(`monitor: ${error.message}`); }
    }, 10) : null;
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        if (name === 'stdout') stdout += chunk; else stderr += chunk;
        if (stdout.length + stderr.length > outputLimit) terminate('output_limit');
      });
    }
    child.on('error', (error) => { if (!stopped) stopped = `spawn: ${error.message}`; });
    child.on('close', (code) => {
      settled = true; clearTimeout(timer); if (interval) clearInterval(interval);
      resolveRun({ code, stdout: stdout.slice(0, outputLimit), stderr: stderr.slice(0, outputLimit), stopped, duration: performance.now() - started });
    });
  });
}
async function checkJars() {
  for (const jar of jars) {
    const bytes = await readFile(jar);
    if (createHash('sha256').update(bytes).digest('hex') !== hashes[jar.split(sep).at(-1)]) throw new Error(`Pinned ASM jar integrity failure: ${jar}`);
  }
}
async function collectClasses(directory) {
  const names = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Compiled class directory contains a symbolic link');
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.class')) names.push(absolute.slice(directory.length + 1, -6).split(sep).join('.'));
    }
  }
  await visit(directory);
  return names.sort();
}
function parseRecords(text, byteLimit, eventLimit) {
  const events = []; let diagnostic = null;
  const bytes = Buffer.byteLength(text);
  if (bytes > byteLimit) diagnostic = `Raw trace exceeded ${byteLimit} bytes`;
  const lines = text.split('\n');
  let consumedBytes = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i === lines.length - 1 && lines[i] === '') break;
    if (events.length >= eventLimit) { diagnostic ??= `Raw trace exceeded ${eventLimit} events`; break; }
    consumedBytes += Buffer.byteLength(lines[i]) + 1;
    if (consumedBytes > byteLimit) break;
    try {
      const event = JSON.parse(lines[i]);
      if (!event || event.v !== 1 || event.seq !== events.length || typeof event.threadId !== 'string' || typeof event.type !== 'string'
        || !Object.hasOwn(event, 'frameId') || !Object.hasOwn(event, 'className') || !Object.hasOwn(event, 'methodName')
        || !Object.hasOwn(event, 'descriptor') || !Object.hasOwn(event, 'line') || !Object.hasOwn(event, 'site')) throw new Error('invalid common fields or sequence');
      if (event.type === 'enter' && (!event.frameId || !Array.isArray(event.parameters))) throw new Error('invalid enter');
      events.push(event);
    } catch (error) { diagnostic = `Malformed raw event at line ${i + 1}: ${error.message}`; break; }
  }
  if (!diagnostic && text && !text.endsWith('\n')) diagnostic = 'Raw trace ended with incomplete record';
  return { events, diagnostic, bytes };
}
function capability(events, coveredClasses, transformInfo, terminalStatus, diagnostic) {
  const counts = Object.create(null); for (const event of events) counts[event.type] = (counts[event.type] ?? 0) + 1;
  const tally = (...types) => types.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
  const set = (status, reason, observedEvents = 0) => ({ status, reason, observedEvents });
  const features = {
    methods: set('supported', 'Observed project method entries and exits', tally('enter', 'exit')),
    locals: set(transformInfo.localsWithoutDebug ? 'partial' : 'supported', transformInfo.localsWithoutDebug ? `${transformInfo.localsWithoutDebug} stores lacked debug local metadata` : 'Debug local stores and parameters observed', tally('local')),
    objects: set('supported', 'Project constructor observations after initialization', tally('object')),
    fields: set('supported', 'Successful instance field stores observed', tally('field')),
    references: set('supported', 'Reference identity observed at locals and fields; non-project/library objects are unsupported values', tally('object', 'array')),
    intArrays: set('supported', 'int[] identity and initial values observed', tally('array')),
    arrayReads: set('supported', 'Successful iaload operations observed', tally('array_read')),
    arrayWrites: set('supported', 'Successful iastore operations observed; operand origin unknown', tally('array_write')),
    sourceMapping: set('partial', tally('line') ? 'JVM line-number sites observed; project-relative source path resolution belongs to the source manifest' : 'No line-number observations', tally('line')),
    branches: set('supported', 'Actual conditional bytecode outcomes observed', tally('branch')),
    loops: set(tally('branch') ? 'partial' : 'supported', 'Branch observations do not establish source-level loop labels or iterations', tally('branch')),
    scopes: set('partial', 'Debug local lifetime ends observed; source lexical scopes are not reconstructed', tally('local_end')),
    returns: set('supported', 'Return operands and normal exits observed', tally('return', 'exit')),
    exceptions: set('partial', 'Explicit throws, handler entry and project-frame unwind observed; implicit throw site is unknown', tally('throw', 'catch', 'unwind')),
    console: set('supported', 'JVM stdout and stderr captured in separate process streams', 0),
  };
  const threads = new Set(events.map((event) => event.threadId));
  const diagnostics = [];
  if (threads.size > 1) { diagnostics.push('Multiple project threads observed; initial normalizer supports one'); features.methods = set('unsupported', diagnostics.at(-1), features.methods.observedEvents); }
  if (diagnostic) diagnostics.push(diagnostic);
  if (terminalStatus !== 'complete') diagnostics.push(`Execution status: ${terminalStatus}`);
  const status = terminalStatus === 'instrumentation_failed' || threads.size > 1 ? 'unsupported' :
    terminalStatus === 'complete' && !transformInfo.localsWithoutDebug && tally('line') ? 'partial' : 'partial';
  return { status, features, coveredClasses, diagnostics };
}

/** Finite offline ASM run. The caller supplies the configured JDK's java/javac executables. */
export class AsmInstrumentationProvider {
  async run(request) { return runInstrumented(request); }
}
export async function runInstrumented(request) {
  const result = emptyResult();
  const rawEventLimit = Math.min(EVENT_LIMIT, Math.max(1, Number(request.rawEventLimit) || EVENT_LIMIT));
  const rawByteLimit = Math.min(BYTE_LIMIT, Math.max(1, Number(request.rawByteLimit) || BYTE_LIMIT));
  const timeoutMs = Math.min(DEADLINE, Math.max(1, Number(request.timeoutMs) || DEADLINE));
  let temp;
  try {
    if (!request.javaPath || !request.javacPath || !request.classesDir || !request.mainClass) throw new Error('Configured JDK, compiled classes and main class are required');
    await checkJars();
    const classesDir = resolve(request.classesDir);
    const coveredClasses = await collectClasses(classesDir);
    if (!coveredClasses.length) throw new Error('No compiled project classes');
    temp = await mkdtemp(join(tmpdir(), 'visual-java-asm-'));
    const helper = join(temp, 'helper'), transformed = join(temp, 'transformed'), trace = join(temp, 'raw.ndjson');
    await mkdir(helper); await mkdir(transformed);
    const transformStart = performance.now();
    const compiled = await run(request.javacPath, ['-encoding', 'UTF-8', '-cp', jars.join(sep === '\\' ? ';' : ':'), '-d', helper, ...javaSources], { timeoutMs });
    if (compiled.code !== 0 || compiled.stopped) throw new Error(`Instrumentation helper compilation failed: ${compiled.stderr || compiled.stopped}`);
    const classpath = [helper, ...jars].join(sep === '\\' ? ';' : ':');
    const stage = await run(request.javaPath, ['-cp', classpath, 'visualjava.OfflineTransformer', classesDir, transformed], { timeoutMs });
    if (stage.code !== 0 || stage.stopped) throw new Error(`Offline transform failed: ${stage.stderr || stage.stopped}`);
    let transformInfo; try { transformInfo = JSON.parse(stage.stdout.trim()); } catch { throw new Error(`Invalid transform report: ${stage.stdout}`); }
    if (transformInfo.classes !== coveredClasses.length) throw new Error('Transform did not cover every compiled project class');
    result.metrics.transformMs = Math.round(performance.now() - transformStart);
    const jvmClasspath = [transformed, helper].join(sep === '\\' ? ';' : ':');
    const executionStart = performance.now(); let firstTraceMs = null;
    const execution = await run(request.javaPath, ['-Xverify:all', `-Dvisualjava.trace=${trace}`, `-Dvisualjava.classes=${coveredClasses.join(',')}`, `-Dvisualjava.eventLimit=${rawEventLimit}`, `-Dvisualjava.byteLimit=${rawByteLimit}`, '-cp', jvmClasspath, request.mainClass], {
      cwd: request.projectRoot || classesDir, timeoutMs,
      monitor: async () => { const info = await stat(trace).catch(() => null); if (info?.size > 0 && firstTraceMs === null) firstTraceMs = performance.now() - executionStart; return info && info.size > rawByteLimit ? 'raw_byte_limit' : null; },
    });
    result.metrics.jvmStartupMs = Math.round(firstTraceMs ?? execution.duration); // Approximate spawn-to-first-record latency.
    result.metrics.executionMs = Math.max(0, Math.round(execution.duration) - result.metrics.jvmStartupMs);
    result.exitCode = execution.code; result.stdout = execution.stdout; result.stderr = execution.stderr;
    const raw = await readFile(trace, 'utf8').catch(() => '');
    const parsed = parseRecords(raw, rawByteLimit, rawEventLimit);
    result.rawEvents = parsed.events; result.metrics.rawBytes = parsed.bytes; result.metrics.rawEvents = parsed.events.length;
    const likelyProbeFailure = /Trace write failed|visualjava\.Recorder|VerifyError|ClassFormatError|NoClassDefFoundError: visualjava/.test(execution.stderr);
    if (execution.stopped === 'timeout' || execution.stopped === 'raw_byte_limit' || execution.stopped === 'output_limit'
      || execution.code === 86 && execution.stderr.includes('[VisualJava] trace limit exceeded')
      || parsed.bytes > rawByteLimit || parsed.diagnostic?.includes('exceeded')) {
      result.status = 'limit_exceeded';result.diagnostic = execution.stopped || parsed.diagnostic || 'Raw event limit exceeded';
    } else if (parsed.diagnostic || likelyProbeFailure || !parsed.events.length) {
      result.status = 'instrumentation_failed';result.diagnostic = parsed.diagnostic || execution.stderr || 'Recorder produced no verified events';
    } else if (execution.stopped) {
      result.status = 'instrumentation_failed';result.diagnostic = execution.stopped;
    } else if (execution.code === 0) {
      result.status = 'complete';
    } else {
      result.status = 'program_crashed';result.diagnostic = `JVM exited with code ${execution.code}`;
    }
    result.capability = capability(result.rawEvents, coveredClasses, transformInfo, result.status, result.diagnostic);
  } catch (error) {
    result.status = 'instrumentation_failed';result.diagnostic = error.message;
    result.capability.diagnostics.push(error.message);
  } finally { if (temp) await rm(temp, { recursive: true, force: true }); }
  return result;
}
