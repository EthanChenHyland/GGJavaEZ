import { RAW_BATCH_DEFAULT, RAW_BATCH_MAX, rawRange } from './raw-trace-archive.mjs';

export const SSE_INTERVAL_MS = 100;
export const SSE_BATCHES_PER_TICK = 4;
// A metadata DTO may contain the existing 32 MiB inline console. At most one
// such frame plus the stream high-water mark is buffered; no per-client event queue.
export const SSE_BUFFER_LIMIT = 40 * 1024 * 1024;
const META = { transport: 'delta' };
const fault = (message) => Object.assign(new Error(message), { status: 400 });

export function transportOptions(url) {
  const mode = url.searchParams.get('transport');
  if (mode !== null && !['delta', 'legacy'].includes(mode)) throw fault('Unknown execution transport');
  return mode === 'delta' ? META : { transport: 'legacy' };
}
export function queryRawRange(url, headers = {}) {
  const integer = (value, fallback, name) => {
    if (value === null || value === undefined) return fallback;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw fault('Invalid raw ' + name);
    return Number(value);
  };
  // An explicit accepted client cursor takes precedence over native SSE delivery IDs.
  const from = integer(url.searchParams.get('from') ?? headers['last-event-id'], 0, 'from');
  const limit = integer(url.searchParams.get('limit'), RAW_BATCH_DEFAULT, 'limit');
  return rawRange(from, limit);
}

/** One retained cursor and one latest metadata DTO per subscriber. On backpressure,
 * pause until the bounded accepted frame drains; disconnect if it stalls for 1 s.
 * The JVM and recorder never see renderer transport pressure.
 */
export function streamExecution(request, response, executions, id, {
  from = 0, limit = RAW_BATCH_DEFAULT, intervalMs = SSE_INTERVAL_MS,
  batchesPerTick = SSE_BATCHES_PER_TICK, maxBufferedBytes = SSE_BUFFER_LIMIT, legacy = false,
} = {}) {
  ({ from, limit } = rawRange(from, limit));
  const initial = executions.snapshot(id, META);
  if (!initial) throw Object.assign(new Error('Execution session not found'), { status: 404 });
  if (from > initial.rawEventCount) throw fault('Raw from is ahead of retained history');
  let next = from, latest = initial, dirty = true, closed = false, blocked = false, preferRaw = false, unsubscribe, timer, closeTimer, stallTimer;
  const cleanup = () => {
    if (closed) return;
    closed = true; clearInterval(timer); clearTimeout(stallTimer); response.off('drain', drained); unsubscribe?.(); latest = null;
  };
  const disconnect = () => {
    cleanup();
    closeTimer = setTimeout(() => response.destroy(), 1000); closeTimer.unref?.();
    response.end();
  };
  response.on('close', () => { cleanup(); clearTimeout(closeTimer); });
  const send = (event, value, sequence) => {
    if (closed || response.destroyed) return false;
    const frame = (sequence === undefined ? '' : 'id: ' + sequence + '\n')
      + 'event: ' + event + '\ndata: ' + JSON.stringify(value) + '\n\n';
    if ((response.writableLength ?? 0) + Buffer.byteLength(frame) > maxBufferedBytes) {
      disconnect(); return false;
    }
    try {
      if (!response.write(frame)) {
        // write(false) still accepts this frame. Large metadata can exceed the
        // high-water mark even on a fast socket; reconnecting here would resend
        // that metadata forever without ever advancing the raw cursor.
        blocked = true;
        stallTimer = setTimeout(disconnect, 1000); stallTimer.unref?.();
        return false;
      }
      return true;
    } catch { cleanup(); response.destroy(); return false; }
  };
  const flush = () => {
    if (closed) return;
    try {
      if (executions.has && !executions.has(id)) { disconnect(); return; }
      if (blocked) return;
      // A continually growing large Console DTO must not monopolize every tick.
      // After a backpressured metadata frame, give the retained raw suffix a turn.
      if (dirty && (legacy || !preferRaw || next >= latest.rawEventCount)) {
        dirty = false;
        if (!send('session', latest)) { preferRaw = true; return; }
      }
      preferRaw = false;
      if (legacy) return;
      const head = latest.rawEventCount;
      for (let batch = 0; batch < batchesPerTick && next < head; batch++) {
        const delta = executions.raw(id, next, Math.min(limit, head - next, RAW_BATCH_MAX));
        if (delta.fromSequence !== next || delta.toSequence <= next) throw new Error('Raw transport made no progress');
        next = delta.toSequence;
        if (!send('raw', delta, next)) return;
      }
    } catch { disconnect(); }
  };
  const drained = () => {
    if (closed || !blocked) return;
    // Resume on the next scheduled tick. Flushing directly from each drain
    // would bypass the measured per-tick batch budget on a fast socket.
    blocked = false; clearTimeout(stallTimer);
  };
  response.on('drain', drained);
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  // Flush happens below, after subscription so live changes cannot fall between setup and replay.
  unsubscribe = executions.subscribe(id, (session) => { latest = session; dirty = true; },
    legacy ? { transport: 'legacy' } : META);
  timer = setInterval(flush, intervalMs); timer.unref?.();
  flush();
  return () => { cleanup(); clearTimeout(closeTimer); };
}

/** Bridge execution routes, isolated for mocked HTTP characterization without builds/JVMs. */
export async function handleExecutionRequest(request, response, url, executions, { body, json }) {
  const parts = url.pathname.split('/').filter(Boolean), method = request.method;
  if (url.pathname === '/api/execution/current' && method === 'GET') {
    json(response, 200, executions.current(transportOptions(url))); return true;
  }
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'projects' && parts[3] === 'execution' && method === 'POST') {
    const configuration = await body(request);
    json(response, 200, executions.start({ projectId: parts[2], kind: configuration.kind, configuration,
      withoutVisualization: configuration.withoutVisualization ?? false, breakpoints: configuration.breakpoints ?? [] }, transportOptions(url)));
    return true;
  }
  if (parts[0] !== 'api' || parts[1] !== 'execution' || !parts[2]) return false;
  const id = parts[2], transport = transportOptions(url);
  if (!executions.has(id)) { json(response, 404, { error: 'Execution session not found' }); return true; }
  if (parts.length === 4 && parts[3] === 'events' && method === 'GET') {
    streamExecution(request, response, executions, id, { ...queryRawRange(url, request.headers),
      legacy: url.searchParams.get('transport') === 'legacy' }); return true;
  }
  if (parts.length === 4 && parts[3] === 'raw' && method === 'GET') {
    const { from, limit } = queryRawRange(url);
    json(response, 200, executions.raw(id, from, limit)); return true;
  }
  if (parts.length === 3 && method === 'GET') { json(response, 200, executions.snapshot(id, transport)); return true; }
  if (parts.length === 4 && parts[3] === 'command' && method === 'POST') {
    json(response, 200, await executions.command(id, (await body(request)).command, transport)); return true;
  }
  if (parts.length === 4 && parts[3] === 'input' && method === 'POST') {
    json(response, 200, await executions.input(id, (await body(request)).text)); return true;
  }
  if (parts.length === 4 && parts[3] === 'stop' && method === 'POST') {
    await body(request); json(response, 200, await executions.stop(id, transport)); return true;
  }
  if (parts.length === 4 && parts[3] === 'breakpoints' && method === 'POST') {
    json(response, 200, await executions.setBreakpoints(id, (await body(request)).breakpoints, transport)); return true;
  }
  if (parts.length === 5 && parts[3] === 'output' && method === 'GET') {
    const stream = executions.output(id, parts[4]);
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8',
      'content-disposition': 'attachment; filename="' + parts[4] + '.txt"',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy());
    stream.pipe(response); return true;
  }
  return false;
}
