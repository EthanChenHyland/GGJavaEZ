import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { StringDecoder } from 'node:string_decoder';

export class BuildFailure extends Error {
  constructor(code, message, rawOutput = '') { super(message); this.name = 'BuildFailure'; this.code = code; this.rawOutput = rawOutput; }
}

/** Bounded build process. No interpolated shell command or automatic provisioning. */
export function runBuildTool(command, args, { cwd, env = process.env, timeoutMs = 120000, outputLimit = 8 * 1024 * 1024,
  signal, spawnProcess = spawn } = {}) {
  return new Promise((resolveRun) => {
    const started = performance.now();
    let child, output = '', bytes = 0, stopped = null, settled = false, timer, forceTimer;
    const kill = (kind) => {
      try { if (process.platform !== 'win32' && child?.pid) process.kill(-child.pid, kind); else child?.kill(kind); } catch { /* already reaped */ }
    };
    const stop = (reason) => {
      if (stopped || settled) return;
      stopped = reason; kill('SIGTERM'); forceTimer = setTimeout(() => kill('SIGKILL'), 1200); forceTimer.unref?.();
    };
    const cancel = () => stop('cancelled');
    const finish = (code, error = null) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(forceTimer);
      signal?.removeEventListener('abort', cancel); process.removeListener('exit', exit);
      resolveRun({ code, output, stopped: stopped ?? (error ? 'spawn' : null), error, elapsedMs: Math.round(performance.now() - started) });
    };
    const exit = () => kill('SIGKILL');
    if (signal?.aborted) { stopped = 'cancelled'; finish(null); return; }
    try { child = spawnProcess(command, args, { cwd, env, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { finish(null, error.message); return; }
    process.once('exit', exit);
    timer = setTimeout(() => stop('timeout'), timeoutMs); timer.unref?.();
    signal?.addEventListener('abort', cancel, { once: true });
    const collect = (text) => {
      const buffer = Buffer.from(text), remaining = Math.max(0, outputLimit - bytes);
      if (remaining) output += buffer.subarray(0, remaining).toString('utf8');
      bytes += buffer.length;
      if (bytes > outputLimit) stop('output_limit');
    };
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder('utf8');
      stream?.on('data', (chunk) => collect(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))));
      stream?.on('end', () => collect(decoder.end()));
    }
    child.once('error', (error) => finish(null, error.message));
    child.once('exit', () => { if (process.platform !== 'win32') kill('SIGKILL'); });
    child.once('close', (code) => finish(code));
  });
}

export async function checkedTool(command, args, options) {
  const result = await runBuildTool(command, args, options);
  if (result.stopped || result.code !== 0) {
    const raw = result.output || result.error || '';
    const code = result.stopped === 'spawn' ? 'tool_unavailable' : result.stopped ??
      (/offline|offline mode|not been downloaded|not available in the local repository/i.test(raw) ? 'offline_cache_miss' :
        /Could not resolve|Could not transfer|Could not find artifact|Non-resolvable parent/i.test(raw) ? 'dependency_resolution_failed' :
          /Unsupported class file|Unsupported Java|invalid target release|release version .* not supported/i.test(raw) ? 'incompatible_build_jdk' : 'build_tool_failed');
    throw new BuildFailure(code, `${code}: ${raw.trim() || 'Build tool exited unsuccessfully'}`, raw);
  }
  return result;
}
