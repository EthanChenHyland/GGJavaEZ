import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { performance } from 'node:perf_hooks';
import { javaLaunchArgs, launchRequest } from './launch.mjs';
import { RawTraceArchive } from './raw-trace-archive.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const javaSources = ['Recorder', 'OfflineTransformer', 'DebugControl', 'SemanticObservations', 'CollectionObservations', 'StringObservations', 'FileIoObservations', 'JdkAccess'].map((name) => join(root, `instrumentation/java/visualjava/${name}.java`));
javaSources.push(join(root, 'instrumentation/java/module-info.java'));
const jars = ['asm', 'asm-tree', 'asm-util', 'asm-analysis'].map((name) => join(root, `instrumentation/lib/${name}-9.10.1.jar`));
const hashes = {
  'asm-9.10.1.jar': 'ed825d10ab1399c8c0cb669e688cf0c8c82629b4c8399b58352b68e92ca10fcb',
  'asm-tree-9.10.1.jar': '3dfb0d5b6a106cd40b5b250e39935fbf2f927f4477546a5369a3ac609cf0506b',
  'asm-util-9.10.1.jar': '1bb99d091fba2597dc6d51193e9bbcf0d8447e7ed96bd8f0198b18152f09655c',
  'asm-analysis-9.10.1.jar': 'dede75a21306b65974ecd8f87114ff6970f09fb794157a4ca09ab25c888c2bfc',
};
const featureNames = ['methods', 'locals', 'objects', 'fields', 'references', 'intArrays', 'arrayReads', 'arrayWrites', 'sourceMapping', 'branches', 'loops', 'scopes', 'returns', 'exceptions', 'console'];
const EVENT_LIMIT = 20000, BYTE_LIMIT = 8 * 1024 * 1024, DEADLINE = 30000;
// Legacy finite-provider DTO retention only. Unified Run/Debug archives full process bytes separately.
const OUTPUT_LIMIT = 32 * 1024 * 1024;
const HARD_DEADLINE = 10 * 60 * 1000;
const STATUS_LIMIT = 1024;

function emptyResult() {
  return { status: 'instrumentation_failed', exitCode: null, diagnostic: null, rawEvents: [], stdout: '', stderr: '', recording: fullRecording(), outputTruncated: false,
    capability: { status: 'unsupported', features: Object.fromEntries(featureNames.map((name) => [name, { status: 'unsupported', reason: 'No verified execution', observedEvents: 0 }])), coveredClasses: [], diagnostics: [] },
    metrics: { transformMs: 0, jvmStartupMs: 0, executionMs: 0, rawBytes: 0, rawEvents: 0 } };
}
function killGroup(child) {
  try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* exited */ }
}
function run(command, args, { cwd, timeoutMs, hardTimeoutMs = timeoutMs, monitor, outputLimit = OUTPUT_LIMIT, spawnProcess = spawn }) {
  return new Promise((resolveRun) => {
    const started = performance.now();
    let child, stdout = '', stderr = '', stopped = null, settled = false, polling = false;
    let outputBytes = 0, outputTruncated = false, activeMs = 0, lastTick = started;
    try { child = spawnProcess(command, args, { cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32' }); }
    catch (error) { resolveRun({ code: null, error: error.message, stdout, stderr, stopped: 'spawn', duration: performance.now() - started }); return; }
    const terminate = (reason) => { if (!stopped) { stopped = reason; killGroup(child); } };
    const hardTimer = setTimeout(() => terminate('hard_timeout'), hardTimeoutMs);
    const interval = setInterval(async () => {
      if (settled || polling) return;
      polling = true;
      let state;
      try { state = await monitor?.(); }
      catch { state = { activeClockEnabled: false }; /* Unknown input state leaves the independent hard safety timer authoritative. */ }
      const now = performance.now();
      if (state?.activeClockEnabled !== false && !state?.waitingForInput && !state?.paused) activeMs += now - lastTick;
      lastTick = now;
      if (!settled && activeMs > timeoutMs) terminate('timeout');
      polling = false;
    }, 10);
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      const decoder = new StringDecoder('utf8');
      const retain = (text) => {
        const bytes = Buffer.from(text), remaining = Math.max(0, outputLimit - outputBytes);
        const kept = bytes.subarray(0, remaining);
        outputBytes += kept.length;
        if (name === 'stdout') stdout += kept.toString('utf8'); else stderr += kept.toString('utf8');
        outputTruncated ||= bytes.length > remaining;
      };
      stream.on('data', (chunk) => retain(decoder.write(chunk)));
      stream.on('end', () => retain(decoder.end()));
    }
    child.on('error', (error) => { if (!stopped) stopped = `spawn: ${error.message}`; });
    child.on('exit', () => { if (process.platform !== 'win32') killGroup(child); });
    child.on('close', (code) => {
      settled = true; clearTimeout(hardTimer); clearInterval(interval);
      resolveRun({ code, stdout, stderr, outputTruncated, stopped, duration: performance.now() - started });
    });
  });
}

export const fullRecording = () => ({ state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: true });
function checkedRecording(value) {
  if (!value || !['FULL', 'STOPPED_LIMIT', 'STOPPED_UNSUPPORTED', 'STOPPED_ERROR'].includes(value.state)
    || !(value.reason === null || typeof value.reason === 'string' && value.reason.length <= 512)
    || ![null, 'objects', 'events', 'bytes', 'live frames'].includes(value.budget)
    || !(value.lastRecordedSeq === null || Number.isSafeInteger(value.lastRecordedSeq) && value.lastRecordedSeq >= 0)
    || typeof value.executionContinued !== 'boolean'
    || value.state !== 'FULL' && (typeof value.reason !== 'string' || !value.reason.trim())
    || value.state === 'STOPPED_LIMIT' && value.budget === null
    || value.state !== 'STOPPED_LIMIT' && value.budget !== null) throw new Error('Invalid recording status');
  const { state, reason, budget, lastRecordedSeq, executionContinued } = value;
  return { state, reason, budget, lastRecordedSeq, executionContinued };
}

/** Bounded v1 prefix reader shared by live debug and the legacy finite provider.
 * A stopped observer never consumes more trace data; the fixed-size sidecar still reports stdin.
 * Concurrent polls coalesce into one read, rather than building a semantic or promise queue.
 */
export class CaptureReader {
  constructor({ trace, rawByteLimit = BYTE_LIMIT, rawEventLimit = EVENT_LIMIT }) {
    Object.assign(this, { trace, rawByteLimit, rawEventLimit });
    this.archive = new RawTraceArchive(); this.recording = fullRecording(); this.waitingForInput = false; this.inputStatusKnown = false;
    this.offset = 0; this.semanticBytes = 0; this.tail = Buffer.alloc(0);
    this.file = null; this.stopped = false; this.inflight = null; this.firstThread = null;
  }
  get events() { return this.archive.snapshot(); } // Explicit legacy materialization only.
  get count() { return this.archive.count; }
  get counts() { return this.archive.counts; }
  stop(reason, state = 'STOPPED_ERROR', budget = null) {
    if (this.recording.state !== 'FULL') return;
    this.recording = { state, reason, budget, lastRecordedSeq: this.count ? this.count - 1 : null, executionContinued: true };
    this.stopped = true; this.tail = Buffer.alloc(0);
  }
  async readStatus(final = false) {
    let file;
    try {
      file = await open(`${this.trace}.status.json`, 'r');
      const buffer = Buffer.alloc(STATUS_LIMIT + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > STATUS_LIMIT) throw new Error('Recorder status exceeded 1 KiB');
      const status = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
      if (status.v !== 1 || typeof status.waitingForInput !== 'boolean') throw new Error('Invalid Recorder sidecar');
      const recording = checkedRecording(status.recording);
      if (this.recording.state !== 'FULL' && (recording.state !== this.recording.state
        || recording.budget !== this.recording.budget || recording.lastRecordedSeq !== this.recording.lastRecordedSeq)) {
        // Failed atomic replacement can leave a valid but obsolete FULL snapshot.
        // It cannot establish current stdin state after the observer has stopped.
        this.waitingForInput = false; this.inputStatusKnown = false;
        return;
      }
      this.waitingForInput = status.waitingForInput; this.inputStatusKnown = true;
      // A sidecar may be ahead of a concurrently read trace. Preserve all flushed facts first.
      if (this.recording.state === 'FULL' && recording.state !== 'FULL'
        && recording.lastRecordedSeq === this.recording.lastRecordedSeq) {
        this.recording = recording; this.stopped = true; this.tail = Buffer.alloc(0);
      } else if (final && this.recording.state === 'FULL' && recording.state !== 'FULL') {
        this.stop('Recorder status watermark does not match the retained prefix');
      }
    } catch (failure) {
      this.inputStatusKnown = false;
      if (failure.code !== 'ENOENT') this.stop(`Recorder status unavailable: ${failure.message}`);
      // Legacy FULL traces still have actual stdin controls. After stop, stale input state is unknown.
      if (this.recording.state !== 'FULL') this.waitingForInput = false;
    } finally { await file?.close(); }
  }
  refresh(final = false) {
    if (this.inflight) return this.inflight.then(() => final ? this.refresh(true) : undefined);
    this.inflight = this.read(final).finally(() => { this.inflight = null; });
    return this.inflight;
  }
  async read(final) {
    try {
      if (!this.stopped) {
        if (!this.file) this.file = await open(this.trace, 'r');
        const buffer = Buffer.alloc(65536);
        while (!this.stopped) {
          // One reserved control record beyond the semantic byte limit; never read an unbounded file.
          const room = this.rawByteLimit + STATUS_LIMIT - this.offset;
          if (room <= 0) { this.stop('Raw trace exceeded byte limit', 'STOPPED_LIMIT', 'bytes'); break; }
          const { bytesRead } = await this.file.read(buffer, 0, Math.min(buffer.length, room), this.offset);
          if (!bytesRead) break;
          this.offset += bytesRead;
          this.tail = Buffer.concat([this.tail, buffer.subarray(0, bytesRead)]);
          let end;
          while (!this.stopped && (end = this.tail.indexOf(10)) >= 0) {
            const line = this.tail.subarray(0, end), lineBytes = end + 1;
            this.tail = this.tail.subarray(lineBytes);
            let record;
            try { record = JSON.parse(line.toString('utf8')); } catch { throw new Error('Malformed raw Recorder event'); }
            if (!record || record.v !== 1 || record.seq !== this.count || typeof record.threadId !== 'string'
              || typeof record.type !== 'string' || ['frameId', 'className', 'methodName', 'descriptor', 'line', 'site'].some((key) => !Object.hasOwn(record, key))) {
              throw new Error('Raw Recorder sequence or common fields are invalid');
            }
            if (record.type === 'capture_saturated') {
              if (lineBytes > STATUS_LIMIT) throw new Error('Saturation control exceeded 1 KiB');
              const recording = checkedRecording(record.recording);
              if (recording.state === 'FULL' || recording.lastRecordedSeq !== this.recording.lastRecordedSeq) throw new Error('Invalid saturation watermark');
              this.archive.append(record, line); this.recording = recording; this.stopped = true; this.tail = Buffer.alloc(0); break;
            }
            if (this.count >= this.rawEventLimit) { this.stop('Raw trace exceeded event limit', 'STOPPED_LIMIT', 'events'); break; }
            if (this.semanticBytes + lineBytes > this.rawByteLimit) { this.stop('Raw trace exceeded byte limit', 'STOPPED_LIMIT', 'bytes'); break; }
            if (record.type === 'enter' && (!record.frameId || !Array.isArray(record.parameters))) throw new Error('Invalid raw enter');
            if (record.type !== 'console' || record.frameId !== null) {
              this.firstThread ??= record.threadId;
              if (record.threadId !== this.firstThread) { this.stop('Multiple project threads are unsupported for visualization', 'STOPPED_UNSUPPORTED'); break; }
            }
            this.archive.append(record, line); this.semanticBytes += lineBytes;
            this.recording.lastRecordedSeq = record.seq;
            if (record.type === 'stdin_wait') this.waitingForInput = true;
            if (record.type === 'stdin_read') this.waitingForInput = false;
          }
        }
        if (final && this.tail.length && !this.stopped) this.stop('Raw trace ended with incomplete record');
      }
    } catch (failure) { if (failure.code !== 'ENOENT') this.stop(failure.message); }
    await this.readStatus(final);
  }
  async close() { await this.inflight; await this.file?.close(); this.file = null; this.archive.close(); }
  async dispose() {
    try { await this.close(); } catch (error) { this.cleanupError = error; }
    this.archive.dispose();
  }
}
async function checkJars() {
  for (const jar of jars) {
    const bytes = await readFile(jar);
    if (createHash('sha256').update(bytes).digest('hex') !== hashes[jar.split(sep).at(-1)]) throw new Error(`Pinned ASM jar integrity failure: ${jar}`);
  }
}
async function collectClasses(directory) {
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Compiled project directory must be a directory without symbolic links');
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
function capability(events, coveredClasses, transformInfo, terminalStatus, diagnostic, recording) {
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
    exceptions: set('partial', 'First propagation origin instruction captured before catch/finally/unwind; library/native internal origins are outside project capture', tally('throw', 'catch', 'finally', 'unwind')),
    console: set('partial', 'Wrapped stdout/stderr shares the probe sequence; replaced streams, direct file descriptor and native output have unknown ordering', tally('console')),
  };
  const threads = new Set(events.filter((event) => event.type !== 'capture_saturated'
    && (event.type !== 'console' || event.frameId !== null)).map((event) => event.threadId));
  const diagnostics = [];
  if (threads.size > 1) { diagnostics.push('Multiple project threads observed; initial normalizer supports one'); features.methods = set('unsupported', diagnostics.at(-1), features.methods.observedEvents); }
  if (diagnostic) diagnostics.push(diagnostic);
  if (recording?.state !== 'FULL' && recording?.reason)
    features.methods = set('partial', `Recording stopped: ${recording.reason}`, features.methods.observedEvents);
  if (terminalStatus !== 'complete') diagnostics.push(`Execution status: ${terminalStatus}`);
  const status = terminalStatus === 'instrumentation_failed' || threads.size > 1 ? 'unsupported' :
    terminalStatus === 'complete' && !transformInfo.localsWithoutDebug && tally('line') ? 'partial' : 'partial';
  return { status, features, coveredClasses, diagnostics };
}

/** Finite offline ASM run. The caller supplies the configured JDK's java/javac executables. */
export class AsmInstrumentationProvider {
  constructor(options = {}) { this.options = options; }
  async run(request) { return runInstrumented(request, this.options); }
}

/** Prepare one isolated verified capture. The caller owns execution and must call cleanup. */
export async function prepareInstrumented(request, { spawnProcess = spawn } = {}) {
  const rawEventLimit = Math.min(EVENT_LIMIT, Math.max(1, Number(request.rawEventLimit) || EVENT_LIMIT));
  const rawByteLimit = Math.min(BYTE_LIMIT, Math.max(1, Number(request.rawByteLimit) || BYTE_LIMIT));
  const timeoutMs = Math.min(DEADLINE, Math.max(1, Number(request.timeoutMs) || DEADLINE));
  const preparationTimeoutMs = Math.min(120000, Math.max(1, Number(request.preparationTimeoutMs) || DEADLINE));
  const hardTimeoutMs = Math.min(HARD_DEADLINE, Math.max(1, Number(request.hardTimeoutMs) || HARD_DEADLINE));
  let temp;
  try {
    if (!request.javaPath || !request.javacPath || !request.classesDir || !request.mainClass) throw new Error('Configured JDK, compiled classes and main class are required');
    const launch = launchRequest(request);
    await checkJars();
    const classesDir = resolve(request.classesDir);
    const coveredClasses = await collectClasses(classesDir);
    if (!coveredClasses.length) throw new Error('No compiled project classes');
    temp = await mkdtemp(join(tmpdir(), 'visual-java-asm-'));
    const helper = join(temp, 'helper'), transformed = join(temp, 'transformed'), trace = join(temp, 'raw.ndjson');
    await mkdir(helper); await mkdir(transformed);
    const transformStart = performance.now();
    const compiled = await run(request.javacPath, ['-encoding', 'UTF-8', '--add-reads=visualjava.observer=ALL-UNNAMED', '-cp', jars.join(delimiter), '-d', helper, ...javaSources], { timeoutMs: preparationTimeoutMs, spawnProcess });
    if (compiled.code !== 0 || compiled.stopped) throw new Error(`Instrumentation helper compilation failed: ${compiled.stderr || compiled.stopped}`);
    const classpath = [helper, ...jars].join(delimiter);
    const dependencies = launch.classpath.slice(1);
    // Extra entries are loader inputs only. OfflineTransformer walks classesDir alone.
    const stage = await run(request.javaPath, ['-cp', classpath, 'visualjava.OfflineTransformer', classesDir, transformed, ...dependencies], { timeoutMs: preparationTimeoutMs, spawnProcess });
    if (stage.code !== 0 || stage.stopped) throw new Error(`Offline transform failed: ${stage.stderr || stage.stopped}`);
    let transformInfo; try { transformInfo = JSON.parse(stage.stdout.trim()); } catch { throw new Error(`Invalid transform report: ${stage.stdout}`); }
    if (transformInfo.classes !== coveredClasses.length) throw new Error('Transform did not cover every compiled project class');
    const executableLines = transformInfo.executableLines;
    if (!executableLines || typeof executableLines !== 'object' || Array.isArray(executableLines)) throw new Error('Transform did not report safe executable lines');
    for (const [className, lines] of Object.entries(executableLines)) {
      if (!coveredClasses.includes(className) || !Array.isArray(lines) || lines.some((line, index) =>
        !Number.isSafeInteger(line) || line < 1 || index > 0 && line <= lines[index - 1])) throw new Error('Invalid executable line report');
    }
    const executionClasspath = [transformed, ...dependencies];
    const args = javaLaunchArgs({ ...launch, classpath: executionClasspath }, ['-Xverify:all', '--module-path', helper, '--add-modules=visualjava.observer', '--add-opens=java.base/java.util=visualjava.observer', `-Dvisualjava.trace=${trace}`, `-Dvisualjava.classes=${coveredClasses.join(',')}`,
      `-Dvisualjava.eventLimit=${rawEventLimit}`, `-Dvisualjava.byteLimit=${rawByteLimit}`]);
    let cleaned = false;
    return { temp, helper, transformed, trace, args, workingDirectory: launch.workingDirectory, classpath: executionClasspath, coveredClasses, transformInfo, executableLines,
      rawEventLimit, rawByteLimit, timeoutMs, hardTimeoutMs, preparationTimeoutMs, transformMs: Math.round(performance.now() - transformStart),
      cleanup: async () => { if (!cleaned) { cleaned = true; await rm(temp, { recursive: true, force: true }); } } };
  } catch (error) {
    if (temp) await rm(temp, { recursive: true, force: true });
    throw error;
  }
}

export async function runInstrumented(request, { spawnProcess = spawn, prepare = prepareInstrumented } = {}) {
  const result = emptyResult();
  let prepared, reader;
  try {
    prepared = await prepare(request, { spawnProcess });
    const { trace, coveredClasses, transformInfo } = prepared;
    reader = new CaptureReader(prepared);
    result.metrics.transformMs = prepared.transformMs;
    const executionStart = performance.now(); let firstTraceMs = null;
    const execution = await run(request.javaPath, prepared.args, {
      cwd: prepared.workingDirectory, timeoutMs: prepared.timeoutMs, hardTimeoutMs: prepared.hardTimeoutMs ?? HARD_DEADLINE, spawnProcess,
      monitor: async () => {
        try { await reader.refresh(); } catch (failure) { reader.stop(`Recorder observation failed: ${failure.message}`); }
        if (reader.count && firstTraceMs === null) firstTraceMs = performance.now() - executionStart;
        return { waitingForInput: reader.waitingForInput, activeClockEnabled: reader.inputStatusKnown || reader.recording.state === 'FULL' };
      },
    });
    await reader.refresh(true);
    result.metrics.jvmStartupMs = Math.round(firstTraceMs ?? execution.duration);
    result.metrics.executionMs = Math.max(0, Math.round(execution.duration) - result.metrics.jvmStartupMs);
    result.exitCode = execution.code; result.stdout = execution.stdout; result.stderr = execution.stderr;
    result.outputTruncated = execution.outputTruncated;
    result.rawEvents = reader.events; result.recording = reader.recording;
    result.metrics.rawBytes = reader.offset; result.metrics.rawEvents = reader.count;
    if (execution.stopped === 'timeout' || execution.stopped === 'hard_timeout') {
      result.status = 'limit_exceeded'; result.diagnostic = execution.stopped === 'hard_timeout'
        ? 'Hard process safety deadline exceeded (applies in all states)' : 'Active execution deadline exceeded';
    } else if (execution.stopped || execution.code !== 0 && /VerifyError|ClassFormatError|NoClassDefFoundError: visualjava/.test(execution.stderr)) {
      result.status = 'instrumentation_failed'; result.diagnostic = execution.stopped ?? 'Instrumented JVM launch failed verification or could not load its observer';
      reader.stop(result.diagnostic); result.recording = reader.recording;
    } else {
      if (!reader.count && reader.recording.state === 'FULL') reader.stop('Recorder produced no verified events');
      if (/Trace write failed/.test(execution.stderr)) reader.stop('Recorder write failed');
      result.recording = reader.recording;
      result.status = execution.code === 0 ? 'complete' : 'program_crashed';
      result.diagnostic = execution.code === 0 ? null : `JVM exited with code ${execution.code}`;
    }
    result.capability = capability(result.rawEvents, coveredClasses, transformInfo, result.status, result.recording.reason ?? result.diagnostic, result.recording);
  } catch (error) {
    result.status = 'instrumentation_failed'; result.diagnostic = error.message;
    result.capability.diagnostics.push(error.message);
  } finally { await reader?.dispose(); if (prepared) await prepared.cleanup(); }
  return result;
}
