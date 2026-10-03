import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { StringDecoder } from 'node:string_decoder';
import { prepareInstrumented, CaptureReader, fullRecording } from './instrumentation-provider.mjs';
import { launchRequest } from './launch.mjs';
import { OutputArchive } from './output-archive.mjs';
import { rawRange } from './raw-trace-archive.mjs';

const OUTPUT_LIMIT = 32 * 1024 * 1024;
const HARD_DEADLINE = 10 * 60 * 1000;
const CONTROL_LIMIT = 65536;
const COMMANDS = new Set(['continue', 'pause', 'stepInto', 'stepOver', 'stepOut', 'stop']);
const TERMINAL = new Set(['exited', 'stopped', 'failed']);
const clone = (value) => structuredClone(value);
const error = (message, status = 409) => Object.assign(new Error(message), { status });

/** Owns actual JVM control; snapshots contain Recorder facts, never a debugger variable model. */
export class DebugManager {
  constructor({ prepare = prepareInstrumented, spawnProcess = spawn, stopGraceMs = 1200 } = {}) {
    this.prepare = prepare;
    this.spawnProcess = spawnProcess;
    this.stopGraceMs = stopGraceMs;
    this.sessions = new Map();
    this.latest = null;
    this.lifecycle = Promise.resolve();
  }

  #serialize(work) {
    const result = this.lifecycle.then(work, work);
    this.lifecycle = result.catch(() => {});
    return result;
  }

  #snapshot(run, { transport = 'legacy', mode } = {}) {
    const snapshot = clone(run.dto);
    if (transport !== 'delta' && mode !== 'metadata') snapshot.rawEvents = run.reader.events;
    return snapshot;
  }

  #publish(run) {
    run.dto.revision++;
    for (const [listener, options] of run.listeners) {
      try { listener(this.#snapshot(run, options)); } catch { /* Consumers cannot interrupt capture. */ }
    }
  }

  #transition(run, status) {
    const now = performance.now();
    if (['running', 'starting'].includes(run.dto.status) && run.activeClockEnabled && !run.dto.waitingForInput) run.activeMs += now - run.activeSince;
    run.activeSince = now;
    run.dto.status = status;
  }

  #resolveBreakpoints(run, list) {
    if (!Array.isArray(list) || list.length > 512) throw error('Expected at most 512 source breakpoints', 400);
    const sources = new Map(run.dto.sourceManifest.sources.map((source) => [source.fileId, source]));
    const unique = new Map();
    for (const item of list) {
      if (!item || typeof item.fileId !== 'string' || !sources.has(item.fileId) || !Number.isSafeInteger(item.line)
        || item.line < 1 || item.line > sources.get(item.fileId).content.split('\n').length) throw error('Invalid project source breakpoint', 400);
      const classes = run.dto.sourceManifest.classes.filter((entry) => entry.fileId === item.fileId && entry.status === 'resolved');
      const executable = classes.some((entry) => run.prepared.executableLines[entry.className]?.includes(item.line));
      unique.set(`${item.fileId}:${item.line}`, { fileId: item.fileId, line: item.line,
        status: executable ? 'verified' : classes.length ? 'non_executable' : 'unresolved',
        reason: executable ? null : classes.length ? 'No safe executable checkpoint on this source line' : 'Source has no uniquely resolved compiled class' });
    }
    return [...unique.values()];
  }

  #breakpointPayload(run, list) {
    const locations = new Set();
    for (const breakpoint of list.filter((item) => item.status === 'verified')) {
      for (const entry of run.dto.sourceManifest.classes) {
        if (entry.status !== 'resolved' || entry.fileId !== breakpoint.fileId
          || !run.prepared.executableLines[entry.className]?.includes(breakpoint.line)) continue;
        if (!/^[\p{L}\p{N}_$.]+$/u.test(entry.className)) throw error('Class name cannot be encoded in control protocol', 400);
        locations.add(`${entry.className}:${breakpoint.line}`);
      }
    }
    const payload = [...locations].sort().map((location) => `\t${location}`).join('');
    if (Buffer.byteLength(payload) > CONTROL_LIMIT - 100) throw error('Breakpoint control payload is too large', 400);
    return payload;
  }

  start(request, options = {}) {
    return this.#serialize(async () => {
      if (!request?.projectId || !request.sourceManifest || !request.build?.success) throw error('Debug requires a successful build and source manifest', 400);
      const launch = launchRequest(request);
      if (this.latest && !TERMINAL.has(this.latest.dto.status)) await this.#stopRun(this.latest, { transport: 'delta' });
      let prepared;
      try { prepared = await this.prepare(request); }
      catch (failure) { failure.preparationFailed = true; throw failure; }
      const controlled = request.control !== false;
      const dto = { sessionId: randomUUID(), projectId: request.projectId, revision: 0, status: 'starting', pause: null,
        breakpoints: [], rawEvents: [], transportVersion: 1, rawEventCount: 0, rawEventCounts: {}, sourceManifest: clone(request.sourceManifest), build: clone(request.build),
        stdout: '', stderr: '', recording: fullRecording(), waitingForInput: false, outputTruncated: false, exitCode: null, terminalStatus: null, diagnostic: null,
        coverage: { coveredClasses: [...prepared.coveredClasses], transformInfo: clone(prepared.transformInfo) } };
      let run;
      try { run = { dto, prepared, request, child: null, server: null, socket: null, connected: false,
        controlled,
        reader: new CaptureReader(prepared), archive: new OutputArchive(), outputBytes: 0, refreshPromise: null, polling: false,
        messageQueue: Promise.resolve(), commands: Promise.resolve(), activeClockEnabled: true,
        pending: new Map(), listeners: new Map(), activeMs: 0, activeSince: performance.now(),
        finishing: false, closing: false, stopRequested: false, failureStatus: null, timer: null, hardTimer: null,
        token: randomBytes(32).toString('hex'), candidates: new Set(), queuedMessages: 0, processStartedAt: 0 }; }
      catch (failure) {
        // Archive initialization is observer preparation, before any application child.
        // Canonical Run can safely choose its existing plain fallback exactly once.
        failure.preparationFailed = true; failure.executionStarted = false;
        try { await prepared.cleanup(); } catch (cleanupFailure) { failure.cleanupFailure = cleanupFailure.message; }
        throw failure;
      }
      try {
        dto.outputArchiveAvailable = !run.archive.error;
        dto.outputArchiveError = run.archive.error;
        dto.breakpoints = controlled ? this.#resolveBreakpoints(run, request.breakpoints ?? []) : [];
        let args = prepared.args;
        if (controlled) {
          // Validate before creating any process or server.
          this.#breakpointPayload(run, dto.breakpoints);
          run.server = net.createServer((socket) => this.#connect(run, socket));
          await new Promise((resolveListen, reject) => {
            run.server.once('error', reject);
            run.server.listen(0, '127.0.0.1', () => { run.server.off('error', reject); resolveListen(); });
          });
          run.server.on('error', (failure) => this.#fail(run, failure.message));
          const port = run.server.address().port;
          const launchIndex = prepared.args.indexOf('-cp');
          if (launchIndex < 0) throw error('Prepared debugger launch has no classpath', 400);
          args = [...prepared.args.slice(0, launchIndex), `-Dvisualjava.debugPort=${port}`, `-Dvisualjava.debugToken=${run.token}`, ...prepared.args.slice(launchIndex)];
        }
        run.child = this.spawnProcess(request.javaPath, args, {
          cwd: launch.workingDirectory, shell: false, windowsHide: true,
          detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
        });
        run.processStartedAt = performance.now(); run.activeSince = run.processStartedAt;
        run.closed = new Promise((resolveClosed) => { run.resolveClosed = resolveClosed; });
        this.sessions.set(dto.sessionId, run); this.latest = run;
        if (!controlled) this.#transition(run, 'running');
        while (this.sessions.size > 32) {
          const oldest = this.sessions.keys().next().value;
          this.sessions.get(oldest).archive.dispose(); await this.sessions.get(oldest).reader.dispose(); this.sessions.delete(oldest);
        }
        for (const [stream, name] of [[run.child.stdout, 'stdout'], [run.child.stderr, 'stderr']]) {
          const decoder = new StringDecoder('utf8');
          stream.on('data', (bytes) => {
            run.archive.append(name, bytes);
            this.#output(run, name, decoder.write(bytes));
          });
          stream.on('end', () => this.#output(run, name, decoder.end()));
        }
        run.child.stdin.on('error', () => {});
        run.child.once('error', (failure) => this.#fail(run, failure.message));
        // Kill descendants immediately on parent exit so inherited pipes cannot prevent close.
        run.child.once('exit', () => { if (process.platform !== 'win32') this.#signal(run, 'SIGKILL'); });
        run.child.once('close', (code) => {
          run.closing = true;
          run.messageQueue.finally(() => this.#finish(run, code)).catch(() => {});
        });
        run.hardTimer = setTimeout(() => this.#fail(run,
          'Hard process safety deadline exceeded (applies while running, waiting or paused)', 'limit_exceeded'), prepared.hardTimeoutMs ?? HARD_DEADLINE);
        run.timer = setInterval(() => {
          if (run.finishing || run.closing || run.polling) return;
          run.polling = true;
          void this.#refresh(run).then(() => {
            if (run.finishing || run.closing) return;
            const now = performance.now();
            const active = run.activeMs + (['starting', 'running'].includes(dto.status) && run.activeClockEnabled && !dto.waitingForInput ? now - run.activeSince : 0);
            if (active > prepared.timeoutMs) this.#fail(run, 'Active execution exceeded the debug time limit', 'limit_exceeded');
            else if (controlled && !run.connected && now - run.processStartedAt > 5000) this.#fail(run, 'JVM did not connect to debug control');
          }).catch((failure) => this.#stopObservation(run, failure.message)).finally(() => { run.polling = false; });
        }, 20);
        this.#publish(run);
        return this.#snapshot(run, options);
      } catch (failure) {
        failure.executionStarted = Boolean(run.child);
        clearInterval(run.timer); clearTimeout(run.hardTimer);
        for (const socket of run.candidates) socket.destroy();
        run.socket?.destroy(); run.server?.close();
        if (run.child) this.#signal(run, 'SIGKILL');
        run.archive.dispose(); await run.reader.dispose(); await prepared.cleanup();
        throw failure;
      }
    });
  }

  #output(run, name, text) {
    if (!text || run.finishing) return;
    const bytes = Buffer.from(text);
    const remaining = Math.max(0, OUTPUT_LIMIT - run.outputBytes);
    const retained = bytes.subarray(0, remaining);
    run.outputBytes += retained.length;
    const wasTruncated = run.dto.outputTruncated;
    const archiveChanged = run.dto.outputArchiveError !== run.archive.error;
    run.dto.outputArchiveAvailable = !run.archive.error; run.dto.outputArchiveError = run.archive.error;
    if (retained.length) run.dto[name] += retained.toString('utf8');
    run.dto.outputTruncated ||= bytes.length > remaining;
    if (retained.length || wasTruncated !== run.dto.outputTruncated || archiveChanged) this.#publish(run);
  }

  #connect(run, socket) {
    if (run.socket || run.finishing || run.candidates.size >= 4
      || !['127.0.0.1', '::ffff:127.0.0.1'].includes(socket.remoteAddress)) { socket.destroy(); return; }
    run.candidates.add(socket); socket.setNoDelay(true); socket.setEncoding('utf8');
    const authenticationTimer = setTimeout(() => socket.destroy(), 1000);
    let tail = '';
    socket.on('data', (chunk) => {
      tail += chunk;
      if (Buffer.byteLength(tail) > CONTROL_LIMIT) {
        if (run.socket === socket) this.#fail(run, 'Debug control message exceeded size limit');
        socket.destroy(); return;
      }
      let end;
      while ((end = tail.indexOf('\n')) >= 0) {
        const line = tail.slice(0, end); tail = tail.slice(end + 1);
        let message; try { message = JSON.parse(line); } catch {
          if (run.socket === socket) this.#fail(run, 'Malformed debug control record');
          socket.destroy(); return;
        }
        if (run.socket !== socket) {
          const valid = !run.socket && message?.v === 1 && message.type === 'hello'
            && typeof message.token === 'string' && Buffer.byteLength(message.token) === Buffer.byteLength(run.token)
            && timingSafeEqual(Buffer.from(message.token), Buffer.from(run.token));
          if (!valid) { socket.destroy(); return; }
          clearTimeout(authenticationTimer); run.candidates.delete(socket); run.socket = socket;
        }
        if (run.queuedMessages >= 32) { this.#fail(run, 'Debug control queue exceeded size limit'); socket.destroy(); return; }
        run.queuedMessages++;
        run.messageQueue = run.messageQueue.then(async () => {
          if (run.finishing) return;
          await this.#message(run, message);
        }).catch((failure) => this.#fail(run, failure.message)).finally(() => { run.queuedMessages--; });
      }
    });
    socket.on('error', (failure) => { if (run.socket === socket && !run.closing && !run.finishing && !run.stopRequested) this.#fail(run, failure.message); });
    socket.on('close', () => {
      clearTimeout(authenticationTimer); run.candidates.delete(socket);
      // A normal JVM exit also closes the socket. Allow the child close event to establish terminal status.
      if (run.socket === socket && !run.finishing && !run.closing && !run.stopRequested) {
        run.disconnectTimer = setTimeout(() => { if (!run.closing && !run.finishing) this.#fail(run, 'Debug control disconnected'); }, 100);
      }
    });
  }

  async #message(run, message) {
    if (message?.v !== 1) throw new Error('Debug control version mismatch');
    if (message.type === 'hello') {
      if (run.connected) throw new Error('Duplicate debug control handshake');
      run.connected = true;
      run.socket.write(`breakpoints\tinitial${this.#breakpointPayload(run, run.dto.breakpoints)}\nstart\tstart\n`);
      return;
    }
    if (!run.connected) throw new Error('Debug control handshake missing');
    if (message.type === 'ack') {
      const pending = run.pending.get(message.requestId);
      if (!pending) {
        if (message.requestId === 'initial' || message.requestId === 'start') return;
        throw new Error('Unknown debug command acknowledgement');
      }
      if (message.command !== pending.command) throw new Error('Debug command acknowledgement mismatch');
      if (['continue', 'stepInto', 'stepOver', 'stepOut'].includes(message.command)) {
        this.#transition(run, 'running'); run.dto.pause = null; this.#publish(run);
      }
      clearTimeout(pending.timer); run.pending.delete(message.requestId); pending.resolve();
      return;
    }
    if (message.type !== 'paused' || !['entry', 'breakpoint', 'step', 'pause', 'exception'].includes(message.reason)
      || !/^\d+$/.test(message.threadId) || typeof message.frameId !== 'string' || !message.frameId
      || typeof message.className !== 'string' || typeof message.methodName !== 'string'
      || !Number.isSafeInteger(message.line) || message.line < 1
      || !Number.isSafeInteger(message.rawEventCount) || message.rawEventCount < 0) throw new Error('Invalid debugger pause');
    await this.#refresh(run);
    if (run.dto.rawEventCount !== message.rawEventCount) {
      if (run.dto.recording.state === 'FULL') this.#stopObservation(run, 'Pause watermark does not match flushed Recorder prefix');
      // Keep the actual control watermark; an older/malformed observer prefix may be shorter.
      // Pausing still excludes intentional stopped time and does not invent visual facts.
    }
    const { reason, threadId, frameId, className, methodName, line, rawEventCount } = message;
    run.dto.pause = { reason, threadId, frameId, className, methodName, line, rawEventCount };
    this.#transition(run, 'paused');
    this.#publish(run);
  }

  #stopObservation(run, diagnostic) {
    run.reader.stop(diagnostic);
    run.dto.recording = clone(run.reader.recording);
    this.#publish(run);
  }

  #refresh(run, final = false) {
    if (run.refreshPromise) return run.refreshPromise.then(() => final ? this.#refresh(run, true) : undefined);
    run.refreshPromise = (async () => {
      const beforeCount = run.dto.rawEventCount;
      const beforeStatus = JSON.stringify(run.dto.recording);
      await run.reader.refresh(final);
      const activeClockEnabled = run.reader.inputStatusKnown || run.reader.recording.state === 'FULL';
      if (run.dto.waitingForInput !== run.reader.waitingForInput || run.activeClockEnabled !== activeClockEnabled) {
        // Settle the running interval before changing the input-wait exemption.
        const now = performance.now();
        if (['starting', 'running'].includes(run.dto.status) && run.activeClockEnabled && !run.dto.waitingForInput) run.activeMs += now - run.activeSince;
        run.activeSince = now;
        run.dto.waitingForInput = run.reader.waitingForInput; run.activeClockEnabled = activeClockEnabled;
        this.#publish(run);
      }
      run.dto.rawEventCount = run.reader.count;
      run.dto.rawEventCounts = { ...run.reader.counts };
      run.dto.recording = clone(run.reader.recording);
      if (beforeCount !== run.dto.rawEventCount || beforeStatus !== JSON.stringify(run.dto.recording)) this.#publish(run);
    })().finally(() => { run.refreshPromise = null; });
    return run.refreshPromise;
  }

  #signal(run, signal) {
    try {
      if (process.platform !== 'win32' && run.child?.pid) process.kill(-run.child.pid, signal);
      else run.child?.kill(signal);
    } catch { try { run.child?.kill(signal); } catch { /* Already exited. */ } }
  }

  #fail(run, diagnostic, terminalStatus = /exceeded .*limit/.test(diagnostic) ? 'limit_exceeded' : 'instrumentation_failed') {
    if (run.finishing || run.failureStatus || run.stopRequested) return;
    run.failureStatus = terminalStatus; run.dto.diagnostic = diagnostic;
    this.#signal(run, 'SIGKILL');
  }

  async #finish(run, code) {
    if (run.finishing) return;
    run.finishing = true; run.archive.close(); clearInterval(run.timer); clearTimeout(run.hardTimer); clearTimeout(run.disconnectTimer);
    try { await this.#refresh(run, true); }
    catch (failure) { this.#stopObservation(run, failure.message); }
    if (!run.stopRequested && !run.failureStatus && (!run.dto.rawEventCount
      || /Trace write failed/.test(run.dto.stderr))) this.#stopObservation(run, 'No verified instrumented execution prefix');
    if (!run.stopRequested && code !== 0 && /VerifyError|ClassFormatError|NoClassDefFoundError: visualjava/.test(run.dto.stderr)) {
      run.failureStatus = 'instrumentation_failed'; run.dto.diagnostic ??= 'Instrumented JVM launch failed verification or could not load its observer';
      this.#stopObservation(run, run.dto.diagnostic);
    }
    run.dto.exitCode = code;
    run.dto.terminalStatus = run.failureStatus ?? (run.stopRequested ? 'unsupported' : code === 0 ? 'complete' : 'program_crashed');
    if (run.stopRequested) run.dto.diagnostic ??= 'Debug execution stopped by user';
    else if (run.dto.terminalStatus === 'program_crashed') run.dto.diagnostic ??= `JVM exited with code ${code}`;
    this.#transition(run, run.stopRequested ? 'stopped' : run.failureStatus ? 'failed' : 'exited');
    run.dto.pause = null; run.dto.waitingForInput = false;
    for (const pending of run.pending.values()) { clearTimeout(pending.timer); pending.reject(error('Debug session ended')); }
    run.pending.clear();
    for (const socket of run.candidates) socket.destroy();
    run.socket?.destroy(); run.server?.close();
    try { await run.reader.close(); await run.prepared.cleanup(); }
    catch (failure) { run.dto.diagnostic ??= `Debugger cleanup failed: ${failure.message}`; }
    this.#publish(run); run.resolveClosed();
  }

  #get(id) {
    const run = this.sessions.get(id);
    if (!run) throw error('Debug session not found', 404);
    return run;
  }

  #send(run, command, payload = '') {
    if (!run.connected || !run.socket || run.socket.destroyed || run.closing || TERMINAL.has(run.dto.status)) throw error('Debug control is not connected');
    const id = randomUUID();
    return new Promise((resolveCommand, reject) => {
      const timer = setTimeout(() => {
        run.pending.delete(id); reject(error('Debug command acknowledgement timed out'));
        this.#fail(run, 'Debug command acknowledgement timed out');
      }, 5000);
      run.pending.set(id, { command, resolve: resolveCommand, reject, timer });
      run.socket.write(`${command}\t${id}${payload}\n`, (failure) => {
        if (!failure) return;
        clearTimeout(timer); run.pending.delete(id); reject(failure); this.#fail(run, failure.message);
      });
    });
  }

  command(id, command, options = {}) {
    if (!COMMANDS.has(command)) return Promise.reject(error('Unknown debug command', 400));
    if (command === 'stop') return this.stop(id, options);
    const run = this.#get(id);
    if (!run.controlled) return Promise.reject(error('Run does not have debugger control', 400));
    const task = run.commands.then(async () => {
      if (command === 'pause' ? run.dto.status !== 'running' : run.dto.status !== 'paused') throw error(`Cannot ${command} while debugger is ${run.dto.status}`);
      await this.#send(run, command);
      return this.#snapshot(run, options);
    });
    run.commands = task.catch(() => {});
    return task;
  }

  setBreakpoints(id, list, options = {}) {
    const run = this.#get(id);
    if (!run.controlled) return Promise.reject(error('Run does not have debugger control', 400));
    const task = run.commands.then(async () => {
      const resolved = this.#resolveBreakpoints(run, list);
      const payload = this.#breakpointPayload(run, resolved);
      if (!TERMINAL.has(run.dto.status)) await this.#send(run, 'breakpoints', payload);
      run.dto.breakpoints = resolved; this.#publish(run);
      return this.#snapshot(run, options);
    });
    run.commands = task.catch(() => {});
    return task;
  }

  async input(id, text) {
    const run = this.#get(id);
    if (run !== this.latest || !['running', 'paused'].includes(run.dto.status) || run.closing) throw error('Debug session cannot accept input');
    if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) throw error('Input must be text under 64 KiB', 400);
    await new Promise((resolveInput, reject) => run.child.stdin.write(text, (failure) => failure ? reject(failure) : resolveInput()));
    return { ok: true };
  }

  async #stopRun(run, options = {}) {
    if (TERMINAL.has(run.dto.status)) return this.#snapshot(run, options);
    run.stopRequested = true;
    try { run.child.stdin.end(); } catch { /* Process may have exited. */ }
    // Stop must work even if the application is in native code or blocked away from a checkpoint.
    this.#signal(run, 'SIGTERM');
    const timer = setTimeout(() => this.#signal(run, 'SIGKILL'), this.stopGraceMs);
    try { await run.closed; } finally { clearTimeout(timer); }
    return this.#snapshot(run, options);
  }

  stop(id, options = {}) { return this.#serialize(async () => {
    const run = id ? this.#get(id) : this.latest;
    return run ? this.#stopRun(run, options) : null;
  }); }
  output(id, channel) { return this.#get(id).archive.stream(channel); }
  async dispose() {
    await this.stop(undefined, { transport: 'delta' });
    for (const run of this.sessions.values()) { run.archive.dispose(); await run.reader.dispose(); run.listeners.clear(); }
  }
  raw(id, from = 0, limit) {
    const run = this.#get(id);
    ({ from, limit } = rawRange(from, limit));
    const events = run.reader.archive.read(from, limit);
    return { version: 1, sessionId: id, fromSequence: from, toSequence: from + events.length,
      events, recording: clone(run.dto.recording) };
  }
  current(options) { return this.latest ? this.#snapshot(this.latest, options) : null; }
  snapshot(id, options) { const run = this.sessions.get(id); return run ? this.#snapshot(run, options) : null; }
  subscribe(id, listener, options = { transport: 'delta' }) {
    if (typeof listener !== 'function') throw new TypeError('Subscriber must be a function');
    const run = this.#get(id); run.listeners.set(listener, options); listener(this.#snapshot(run, options));
    return () => run.listeners.delete(listener);
  }
}

export { DebugManager as DebugSessionManager };
