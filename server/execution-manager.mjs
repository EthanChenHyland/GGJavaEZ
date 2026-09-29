import { randomUUID } from 'node:crypto';

const EMPTY_MANIFEST = { sources: [], classes: [] };
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'STOPPED']);
const DEBUG_TERMINAL = new Set(['exited', 'stopped', 'failed']);
const PUBLIC_INTERVAL_MS = 100;
const clone = (value) => structuredClone(value);
const fault = (message, status = 409) => Object.assign(new Error(message), { status, statusCode: status });

function publicBuildDefault(result) {
  const { project, ...dto } = result;
  return dto;
}

function capabilityFromObserved(snapshot) {
  const counts = Object.create(null);
  for (const event of snapshot.rawEvents) counts[event.type] = (counts[event.type] ?? 0) + 1;
  const tally = (...types) => types.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
  const feature = (status, reason, observedEvents) => ({ status, reason, observedEvents });
  const coveredClasses = snapshot.coverage?.coveredClasses ?? [];
  const localsWithoutDebug = snapshot.coverage?.transformInfo?.localsWithoutDebug ?? 0;
  const observed = (label, ...types) => feature(tally(...types) ? 'supported' : 'partial',
    tally(...types) ? `Observed ${label}` : `No ${label} observed in this execution prefix`, tally(...types));
  return {
    // The recorder cannot claim complete Java coverage: library/native internals and
    // replacement streams remain outside its trace even for a fully transformed project.
    status: 'partial', coveredClasses: [...coveredClasses], diagnostics: snapshot.diagnostic ? [snapshot.diagnostic] : [],
    features: {
      methods: observed('project method entry/exit', 'enter', 'exit'),
      locals: feature(localsWithoutDebug ? 'partial' : 'supported', localsWithoutDebug
        ? `${localsWithoutDebug} stores lacked debug local metadata` : 'Debug local stores and parameters available', tally('local')),
      objects: observed('project constructors', 'object'),
      fields: observed('instance field writes', 'field'),
      references: observed('reference identities', 'object', 'array'),
      intArrays: observed('int[] allocations', 'array'),
      arrayReads: observed('array reads', 'array_read'),
      arrayWrites: observed('array writes', 'array_write'),
      sourceMapping: feature('partial', 'Recorder lines require source-manifest resolution', tally('line')),
      branches: observed('conditional outcomes', 'branch'),
      loops: feature('partial', 'Branch probes do not establish source-level loop labels', tally('branch')),
      scopes: feature('partial', 'Lexical scopes are not completely reconstructed', tally('local_end')),
      returns: observed('return operands and exits', 'return', 'exit'),
      exceptions: feature('partial', 'Library/native exception internals are outside project capture', tally('throw', 'catch', 'finally', 'unwind')),
      console: feature('partial', 'Wrapped writes have recorder order; process pipes do not', tally('console')),
    },
  };
}

function supportFromObserved(snapshot) {
  if (!snapshot.rawEvents.length) return 'RUN_ONLY';
  const covered = new Set(snapshot.coverage?.coveredClasses ?? []);
  const resolved = snapshot.sourceManifest.classes.filter((entry) => entry.status === 'resolved');
  const completeClasses = resolved.length > 0 && resolved.every((entry) => covered.has(entry.className));
  const hasCoreTrace = snapshot.rawEvents.some((event) => event.type === 'enter')
    && snapshot.rawEvents.some((event) => event.type === 'line');
  // A live prefix cannot prove that the remaining JVM execution is covered.
  return snapshot.status === 'exited' && snapshot.terminalStatus === 'complete'
    && completeClasses && hasCoreTrace && !snapshot.coverage?.transformInfo?.localsWithoutDebug ? 'FULL' : 'PARTIAL';
}

/** One bridge-owned session projects either the recorder or the plain-run escape path. */
export class ExecutionManager {
  constructor({ build, resolveLaunch, buildManifest, getProjectRoot, publicBuild = publicBuildDefault, runs, debuggerSessions }) {
    if ([build, resolveLaunch, buildManifest, getProjectRoot, publicBuild].some((dependency) => typeof dependency !== 'function')
      || !runs?.start || !debuggerSessions?.start) throw new TypeError('ExecutionManager requires build, launch, manifest, project root, runner and debugger dependencies');
    Object.assign(this, { build, resolveLaunch, buildManifest, getProjectRoot, publicBuild, runs, debuggerSessions });
    this.sessions = new Map();
    this.latest = null;
    this.startQueue = Promise.resolve();
  }

  #get(id) {
    const record = this.sessions.get(id);
    if (!record) throw fault('Execution session not found', 404);
    return record;
  }

  #flush(record) {
    clearTimeout(record.publishTimer); record.publishTimer = null;
    const snapshot = clone(record.dto);
    for (const listener of record.listeners) {
      try { listener(snapshot); } catch { /* Observers cannot interrupt capture. */ }
    }
    record.lastPublishedAt = Date.now();
  }

  #publish(record, immediate = false) {
    record.dto.revision++;
    if (immediate || Date.now() - record.lastPublishedAt >= PUBLIC_INTERVAL_MS) this.#flush(record);
    else if (!record.publishTimer) record.publishTimer = setTimeout(() => this.#flush(record),
      PUBLIC_INTERVAL_MS - (Date.now() - record.lastPublishedAt));
  }

  #update(record, patch, immediate = false) {
    const prior = record.dto.phase;
    Object.assign(record.dto, patch);
    this.#publish(record, immediate || prior !== record.dto.phase || TERMINAL.has(record.dto.phase));
  }

  #fail(record, failure, kind) {
    if (record.stopped || TERMINAL.has(record.dto.phase)) return;
    this.#update(record, { phase: 'FAILED', diagnostic: failure.message ?? String(failure), failureKind: kind }, true);
  }

  start({ projectId, kind = 'run', configuration = {}, withoutVisualization = false, breakpoints = [] } = {}) {
    if (typeof projectId !== 'string' || !projectId || !['run', 'debug'].includes(kind)
      || typeof configuration !== 'object' || !configuration || Array.isArray(configuration)
      || typeof withoutVisualization !== 'boolean' || !Array.isArray(breakpoints)) throw fault('Invalid execution request', 400);
    if (kind === 'debug' && withoutVisualization) throw fault('Debug requires visualization', 400);
    const dto = { id: randomUUID(), revision: 0, projectId, mainClass: null, kind, phase: 'BUILDING',
      support: 'RUN_ONLY', supportReason: null, build: null, rawEvents: [], sourceManifest: clone(EMPTY_MANIFEST),
      capability: null, stdout: '', stderr: '', runEvents: [], pause: null, breakpoints: [],
      terminalStatus: null, exitCode: null, diagnostic: null, failureKind: null, startedAt: new Date().toISOString() };
    const record = { dto, backend: null, backendId: null, stopped: false, listeners: new Set(), unsubscribe: null,
      publishTimer: null, lastPublishedAt: 0, task: null, observedCount: -1, observedCapability: null,
      observedSupport: 'RUN_ONLY', observedDiagnostic: null, observedTerminal: null };
    this.sessions.set(dto.id, record); this.latest = record;
    while (this.sessions.size > 32) this.sessions.delete(this.sessions.keys().next().value);
    const work = this.startQueue.then(() => this.#launch(record, configuration, withoutVisualization, breakpoints));
    record.task = work.catch((failure) => this.#fail(record, failure, record.dto.phase === 'BUILDING' ? 'build' : 'launch'));
    this.startQueue = record.task;
    return clone(dto);
  }

  async #launch(record, configuration, withoutVisualization, breakpoints) {
    // Legacy managers still own their children. Stop both before starting the new build.
    await this.debuggerSessions.stop();
    await this.runs.stop();
    if (record.stopped) return;
    const { dto } = record;
    const compilation = await this.build(dto.projectId, true);
    if (record.stopped) return;
    this.#update(record, { build: this.publicBuild(compilation) });
    if (!compilation.success) return this.#update(record,
      { phase: 'FAILED', failureKind: 'build', diagnostic: 'Compilation failed. See Problems.' }, true);
    if (!compilation.mainClasses?.length) return this.#update(record,
      { phase: 'FAILED', failureKind: 'build', diagnostic: 'No public static main(String[]) entry point found' }, true);
    let launch;
    try {
      const projectRoot = await this.getProjectRoot(dto.projectId);
      launch = await this.resolveLaunch({ ...compilation.project, projectRoot }, configuration);
      if (!launch.mainClass) throw fault('No runnable main class', 400);
      if (record.stopped) return;
      this.#update(record, { mainClass: launch.mainClass, phase: 'STARTING' }, true);
      const base = { projectId: dto.projectId, projectRoot, classesDir: compilation.project.classesDir,
        ...launch, javaPath: compilation.jdk.javaPath, javacPath: compilation.jdk.javacPath,
        sourcePaths: compilation.project.sourcePaths };
      if (withoutVisualization) return await this.#plain(record, base, 'Visualization was disabled for this run');
      let sourceManifest;
      try { sourceManifest = await this.buildManifest(projectRoot, base.classesDir, base.sourcePaths); }
      catch (failure) {
        if (dto.kind === 'debug') throw failure;
        return await this.#plain(record, base, `Instrumentation preparation failed: ${failure.message}`);
      }
      if (record.stopped) return;
      this.#update(record, { sourceManifest });
      try {
        const session = await this.debuggerSessions.start({ ...base, sourceManifest, build: dto.build,
          breakpoints: dto.kind === 'debug' ? breakpoints : [], control: dto.kind === 'debug',
          rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 });
        record.backend = 'recorder'; record.backendId = session.sessionId;
        record.unsubscribe = this.debuggerSessions.subscribe(session.sessionId, (next) => this.#recorderSnapshot(record, next));
        if (record.stopped) await this.debuggerSessions.stop(session.sessionId);
      } catch (failure) {
        // Only preparation failed before child creation is a safe fallback. A
        // launched JVM is never replayed to recover its output or trace.
        if (dto.kind === 'run' && failure.preparationFailed && !record.stopped)
          return await this.#plain(record, base, `Instrumentation preparation failed: ${failure.message}`);
        throw failure;
      }
    } catch (failure) {
      this.#fail(record, failure, 'launch');
    }
  }

  async #plain(record, base, reason) {
    if (record.stopped) return;
    this.#update(record, { support: 'RUN_ONLY', supportReason: reason });
    const run = await this.runs.start(base);
    record.backend = 'plain'; record.backendId = run.runId;
    this.#plainSnapshot(record, run);
    record.unsubscribe = this.runs.subscribe(run.runId, () => this.#plainSnapshot(record, this.runs.snapshot(run.runId)));
    if (record.stopped) await this.runs.stop(run.runId);
  }

  #plainSnapshot(record, run) {
    if (!run) return;
    const stdout = run.events.filter((event) => event.kind === 'stdout').map((event) => event.text).join('');
    const stderr = run.events.filter((event) => event.kind === 'stderr').map((event) => event.text).join('');
    const ended = run.status === 'exited';
    const failed = ended && run.exitCode !== 0 && !record.stopped;
    this.#update(record, { phase: record.stopped ? 'STOPPED' : ended ? failed ? 'FAILED' : 'COMPLETED' : 'RUNNING',
      runEvents: run.events, stdout, stderr, exitCode: run.exitCode,
      failureKind: failed ? 'runtime' : null,
      diagnostic: failed ? run.exception?.message ?? `JVM exited with code ${run.exitCode}` : record.dto.diagnostic }, ended);
  }

  #recorderSnapshot(record, session) {
    const terminal = DEBUG_TERMINAL.has(session.status);
    const captureOnlyFailure = record.dto.kind === 'run' && terminal && session.exitCode === 0
      && session.terminalStatus === 'instrumentation_failed';
    const failed = !captureOnlyFailure && (session.status === 'failed'
      || session.terminalStatus && !['complete', 'unsupported'].includes(session.terminalStatus));
    const waitingForInput = session.rawEvents.at(-1)?.type === 'stdin_wait';
    const phase = record.stopped || session.status === 'stopped' ? 'STOPPED'
      : terminal ? failed ? 'FAILED' : 'COMPLETED'
        : session.status === 'paused' ? 'PAUSED' : session.status === 'starting' ? 'STARTING'
          : waitingForInput ? 'WAITING_FOR_INPUT' : 'RUNNING';
    if (record.observedCount !== session.rawEvents.length || record.observedDiagnostic !== session.diagnostic
      || record.observedTerminal !== session.terminalStatus) {
      record.observedCount = session.rawEvents.length;
      record.observedDiagnostic = session.diagnostic;
      record.observedTerminal = session.terminalStatus;
      record.observedSupport = supportFromObserved(session);
      record.observedCapability = session.rawEvents.length ? capabilityFromObserved(session) : null;
    }
    const support = record.observedSupport;
    this.#update(record, { phase, support, supportReason: captureOnlyFailure ? session.diagnostic ?? 'Runtime capture unavailable; program completed'
      : support === 'RUN_ONLY' ? session.rawEvents.length ? null : 'No verified runtime events yet'
        : support === 'PARTIAL' ? 'Some runtime facts are outside verified project coverage' : null,
    rawEvents: session.rawEvents, sourceManifest: session.sourceManifest, capability: record.observedCapability,
    stdout: session.stdout, stderr: session.stderr, pause: session.pause, breakpoints: session.breakpoints,
    terminalStatus: session.terminalStatus, exitCode: session.exitCode, diagnostic: session.diagnostic,
    failureKind: failed ? session.terminalStatus === 'program_crashed' ? 'runtime' : 'capture' : null },
    terminal || session.status === 'paused' || record.dto.phase === 'PAUSED');
  }

  current() { return this.latest ? clone(this.latest.dto) : null; }
  snapshot(id) { const record = this.sessions.get(id); return record ? clone(record.dto) : null; }
  subscribe(id, listener) {
    if (typeof listener !== 'function') throw new TypeError('Subscriber must be a function');
    const record = this.#get(id); record.listeners.add(listener); listener(clone(record.dto));
    return () => record.listeners.delete(listener);
  }

  async command(id, command) {
    const record = this.#get(id);
    if (command === 'stop') return this.stop(id);
    if (record.dto.kind !== 'debug' || record.backend !== 'recorder' || !record.backendId)
      throw fault('This execution has no debugger control', 400);
    await this.debuggerSessions.command(record.backendId, command);
    return this.snapshot(id);
  }

  async input(id, text) {
    const record = this.#get(id);
    if (!record.backendId || !['RUNNING', 'PAUSED', 'WAITING_FOR_INPUT'].includes(record.dto.phase)) throw fault('Execution is not accepting input');
    const result = record.backend === 'recorder'
      ? await this.debuggerSessions.input(record.backendId, text)
      : await this.runs.input(record.backendId, text);
    if (record.backend === 'plain') this.#plainSnapshot(record, this.runs.snapshot(record.backendId));
    return result;
  }

  async setBreakpoints(id, list) {
    const record = this.#get(id);
    if (record.dto.kind !== 'debug' || record.backend !== 'recorder' || !record.backendId)
      throw fault('This execution has no debugger control', 400);
    await this.debuggerSessions.setBreakpoints(record.backendId, list);
    return this.snapshot(id);
  }

  async stop(id) {
    const record = id ? this.#get(id) : this.latest;
    if (!record) return null;
    if (TERMINAL.has(record.dto.phase)) return clone(record.dto);
    record.stopped = true;
    this.#update(record, { phase: 'STOPPED', diagnostic: 'Execution stopped by user' }, true);
    if (record.backendId) {
      if (record.backend === 'recorder') await this.debuggerSessions.stop(record.backendId);
      else await this.runs.stop(record.backendId);
    }
    return clone(record.dto);
  }
}
