import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { open } from 'node:fs/promises';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { StringDecoder } from 'node:string_decoder';
import { prepareInstrumented } from './instrumentation-provider.mjs';
import { launchRequest } from './launch.mjs';

const OUTPUT_LIMIT = 8 * 1024 * 1024;
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

  #publish(run) {
    run.dto.revision++;
    for (const listener of run.listeners) {
      try { listener(clone(run.dto)); } catch { /* Consumers cannot interrupt capture. */ }
    }
  }

  #transition(run, status) {
    const now = performance.now();
    if (run.dto.status === 'running' || run.dto.status === 'starting') run.activeMs += now - run.activeSince;
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

  start(request) {
    return this.#serialize(async () => {
      if (!request?.projectId || !request.sourceManifest || !request.build?.success) throw error('Debug requires a successful build and source manifest', 400);
      const launch = launchRequest(request);
      if (this.latest && !TERMINAL.has(this.latest.dto.status)) await this.#stopRun(this.latest);
      const prepared = await this.prepare(request);
      const dto = { sessionId: randomUUID(), projectId: request.projectId, revision: 0, status: 'starting', pause: null,
        breakpoints: [], rawEvents: [], sourceManifest: clone(request.sourceManifest), build: clone(request.build),
        stdout: '', stderr: '', exitCode: null, terminalStatus: null, diagnostic: null };
      const run = { dto, prepared, request, child: null, server: null, socket: null, connected: false,
        file: null, offset: 0, tail: '', rawDecoder: new StringDecoder('utf8'), outputBytes: 0,
        readQueue: Promise.resolve(), messageQueue: Promise.resolve(), commands: Promise.resolve(),
        pending: new Map(), listeners: new Set(), activeMs: 0, activeSince: performance.now(),
        finishing: false, closing: false, stopRequested: false, failureStatus: null, timer: null,
        token: randomBytes(32).toString('hex'), candidates: new Set(), projectThreads: new Set() };
      try {
        dto.breakpoints = this.#resolveBreakpoints(run, request.breakpoints ?? []);
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
        const args = [...prepared.args.slice(0, launchIndex), `-Dvisualjava.debugPort=${port}`, `-Dvisualjava.debugToken=${run.token}`, ...prepared.args.slice(launchIndex)];
        run.child = this.spawnProcess(request.javaPath, args, {
          cwd: launch.workingDirectory, shell: false, windowsHide: true,
          detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
        });
        run.closed = new Promise((resolveClosed) => { run.resolveClosed = resolveClosed; });
        this.sessions.set(dto.sessionId, run); this.latest = run;
        while (this.sessions.size > 32) this.sessions.delete(this.sessions.keys().next().value);
        for (const [stream, name] of [[run.child.stdout, 'stdout'], [run.child.stderr, 'stderr']]) {
          const decoder = new StringDecoder('utf8');
          stream.on('data', (bytes) => this.#output(run, name, decoder.write(bytes)));
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
        run.timer = setInterval(() => {
          if (run.finishing || run.closing) return;
          const active = run.activeMs + (['starting', 'running'].includes(dto.status) ? performance.now() - run.activeSince : 0);
          if (active > prepared.timeoutMs) this.#fail(run, 'Running execution exceeded the debug time limit', 'limit_exceeded');
          else if (!run.connected && performance.now() - run.activeSince > 5000) this.#fail(run, 'JVM did not connect to debug control');
          void this.#refresh(run).catch((failure) => this.#fail(run, failure.message));
        }, 20);
        this.#publish(run);
        return clone(dto);
      } catch (failure) {
        for (const socket of run.candidates) socket.destroy();
        run.socket?.destroy(); run.server?.close();
        if (run.child) this.#signal(run, 'SIGKILL');
        await prepared.cleanup();
        throw failure;
      }
    });
  }

  #output(run, name, text) {
    if (!text || run.finishing) return;
    const bytes = Buffer.from(text);
    const remaining = Math.max(0, OUTPUT_LIMIT - run.outputBytes);
    run.outputBytes += bytes.length;
    if (remaining > 0) run.dto[name] += bytes.length <= remaining ? text : bytes.subarray(0, remaining).toString('utf8');
    this.#publish(run);
    if (run.outputBytes > OUTPUT_LIMIT) this.#fail(run, 'Program output exceeded 8 MiB', 'limit_exceeded');
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
        run.messageQueue = run.messageQueue.then(async () => {
          if (run.finishing) return;
          await this.#message(run, message);
        }).catch((failure) => this.#fail(run, failure.message));
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
    if (run.dto.rawEvents.length !== message.rawEventCount) throw new Error('Pause watermark does not match flushed Recorder prefix');
    const { reason, threadId, frameId, className, methodName, line, rawEventCount } = message;
    run.dto.pause = { reason, threadId, frameId, className, methodName, line, rawEventCount };
    this.#transition(run, 'paused');
    this.#publish(run);
  }

  #refresh(run, final = false) {
    const work = run.readQueue.then(async () => {
      if (!run.file) {
        try { run.file = await open(run.prepared.trace, 'r'); }
        catch (failure) { if (failure.code === 'ENOENT') return; throw failure; }
      }
      const before = run.dto.rawEvents.length;
      const buffer = Buffer.alloc(65536);
      for (;;) {
        const { bytesRead } = await run.file.read(buffer, 0, buffer.length, run.offset);
        if (!bytesRead) break;
        run.offset += bytesRead;
        if (run.offset > run.prepared.rawByteLimit) throw error('Raw trace exceeded byte limit');
        run.tail += run.rawDecoder.write(buffer.subarray(0, bytesRead));
        let end;
        while ((end = run.tail.indexOf('\n')) >= 0) {
          const line = run.tail.slice(0, end); run.tail = run.tail.slice(end + 1);
          if (run.dto.rawEvents.length >= run.prepared.rawEventLimit) throw error('Raw trace exceeded event limit');
          let record; try { record = JSON.parse(line); } catch { throw error('Malformed raw Recorder event'); }
          if (!record || record.v !== 1 || record.seq !== run.dto.rawEvents.length || typeof record.threadId !== 'string'
            || typeof record.type !== 'string' || ['frameId', 'className', 'methodName', 'descriptor', 'line', 'site'].some((key) => !Object.hasOwn(record, key))) {
            throw error('Raw Recorder sequence or common fields are invalid');
          }
          run.dto.rawEvents.push(record);
          if (record.type !== 'console' || record.frameId !== null) {
            run.projectThreads.add(record.threadId);
            if (run.projectThreads.size > 1) this.#fail(run, 'Multiple project threads are unsupported for visualization', 'unsupported');
          }
        }
      }
      if (final && (run.tail || run.rawDecoder.end())) throw error('Raw trace ended with incomplete record');
      if (before !== run.dto.rawEvents.length) this.#publish(run);
    });
    run.readQueue = work.catch(() => {});
    return work;
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
    run.finishing = true; clearInterval(run.timer); clearTimeout(run.disconnectTimer);
    try { await this.#refresh(run, true); }
    catch (failure) { run.failureStatus ??= /exceeded/.test(failure.message) ? 'limit_exceeded' : 'instrumentation_failed'; run.dto.diagnostic ??= failure.message; }
    if (code === 86 && run.dto.stderr.includes('[VisualJava] trace limit exceeded')) {
      run.failureStatus = 'limit_exceeded'; run.dto.diagnostic ??= 'Recorder capture limit exceeded';
    }
    if (!run.stopRequested && !run.failureStatus && (!run.connected || !run.dto.rawEvents.length
      || /Trace write failed|VerifyError|ClassFormatError|NoClassDefFoundError: visualjava|Debug control failed/.test(run.dto.stderr))) {
      run.failureStatus = 'instrumentation_failed'; run.dto.diagnostic ??= 'No verified debugger execution prefix';
    }
    run.dto.exitCode = code;
    run.dto.terminalStatus = run.failureStatus ?? (run.stopRequested ? 'unsupported' : code === 0 ? 'complete' : 'program_crashed');
    if (run.stopRequested) run.dto.diagnostic ??= 'Debug execution stopped by user';
    else if (run.dto.terminalStatus === 'program_crashed') run.dto.diagnostic ??= `JVM exited with code ${code}`;
    this.#transition(run, run.stopRequested ? 'stopped' : run.failureStatus ? 'failed' : 'exited');
    run.dto.pause = null;
    for (const pending of run.pending.values()) { clearTimeout(pending.timer); pending.reject(error('Debug session ended')); }
    run.pending.clear();
    for (const socket of run.candidates) socket.destroy();
    run.socket?.destroy(); run.server?.close();
    try { await run.file?.close(); await run.prepared.cleanup(); }
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

  command(id, command) {
    if (!COMMANDS.has(command)) return Promise.reject(error('Unknown debug command', 400));
    if (command === 'stop') return this.stop(id);
    const run = this.#get(id);
    const task = run.commands.then(async () => {
      if (command === 'pause' ? run.dto.status !== 'running' : run.dto.status !== 'paused') throw error(`Cannot ${command} while debugger is ${run.dto.status}`);
      await this.#send(run, command);
      return clone(run.dto);
    });
    run.commands = task.catch(() => {});
    return task;
  }

  setBreakpoints(id, list) {
    const run = this.#get(id);
    const task = run.commands.then(async () => {
      const resolved = this.#resolveBreakpoints(run, list);
      const payload = this.#breakpointPayload(run, resolved);
      if (!TERMINAL.has(run.dto.status)) await this.#send(run, 'breakpoints', payload);
      run.dto.breakpoints = resolved; this.#publish(run);
      return clone(run.dto);
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

  async #stopRun(run) {
    if (TERMINAL.has(run.dto.status)) return clone(run.dto);
    run.stopRequested = true;
    try { run.child.stdin.end(); } catch { /* Process may have exited. */ }
    // Stop must work even if the application is in native code or blocked away from a checkpoint.
    this.#signal(run, 'SIGTERM');
    const timer = setTimeout(() => this.#signal(run, 'SIGKILL'), this.stopGraceMs);
    try { await run.closed; } finally { clearTimeout(timer); }
    return clone(run.dto);
  }

  stop(id) { return this.#serialize(async () => {
    const run = id ? this.#get(id) : this.latest;
    return run ? this.#stopRun(run) : null;
  }); }
  current() { return this.latest ? clone(this.latest.dto) : null; }
  snapshot(id) { const run = this.sessions.get(id); return run ? clone(run.dto) : null; }
  subscribe(id, listener) {
    const run = this.#get(id); run.listeners.add(listener); listener(clone(run.dto));
    return () => run.listeners.delete(listener);
  }
}

export { DebugManager as DebugSessionManager };
