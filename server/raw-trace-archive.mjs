import { mkdtempSync, openSync, writeSync, readSync, closeSync, rmSync, ftruncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RAW_TRANSPORT_VERSION = 1;
export const RAW_BATCH_DEFAULT = 256;
export const RAW_BATCH_MAX = 1024;
export const RAW_BATCH_BYTES = 256 * 1024;
const INDEX_INTERVAL = 256;
const fault = (message) => Object.assign(new Error(message), { status: 400, statusCode: 400 });

export function rawRange(from = 0, limit = RAW_BATCH_DEFAULT) {
  if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(limit) || limit < 1)
    throw fault('Raw from must be a nonnegative safe integer and limit a positive safe integer');
  return { from, limit: Math.min(limit, RAW_BATCH_MAX) };
}

/** Accepted Recorder facts only. Sparse byte offsets, no retained event-object prefix.
 * Writes are synchronous and bounded by the existing recorder budget, with no promise queue.
 * The independent copy survives instrumentation preparation cleanup at process exit.
 */
export class RawTraceArchive {
  constructor() {
    this.directory = mkdtempSync(join(tmpdir(), 'vj-raw-trace-'));
    this.path = join(this.directory, 'accepted.ndjson');
    try { this.fd = openSync(this.path, 'wx', 0o600); }
    catch (failure) { rmSync(this.directory, { recursive: true, force: true }); throw failure; }
    this.count = 0; this.bytes = 0; this.offsets = []; this.counts = Object.create(null);
  }

  append(event, line = Buffer.from(JSON.stringify(event))) {
    if (event.seq !== this.count) throw new Error('Raw archive sequence must be contiguous');
    if (this.fd === null || !this.directory) throw new Error('Raw archive is closed');
    const bytes = Buffer.concat([line, Buffer.from('\n')]);
    try {
      for (let offset = 0; offset < bytes.length;) {
        const written = writeSync(this.fd, bytes, offset, bytes.length - offset, this.bytes + offset);
        if (!written) throw new Error('Raw archive write made no progress');
        offset += written;
      }
    } catch (failure) {
      try { ftruncateSync(this.fd, this.bytes); } catch { /* Only committed facts are addressable. */ }
      throw failure;
    }
    if (this.count % INDEX_INTERVAL === 0) this.offsets.push(this.bytes);
    this.bytes += bytes.length; this.count++;
    this.counts[event.type] = (this.counts[event.type] ?? 0) + 1;
  }

  read(from = 0, limit = RAW_BATCH_DEFAULT, byteLimit = RAW_BATCH_BYTES) {
    ({ from, limit } = rawRange(from, limit));
    if (from > this.count) throw fault('Raw from is ahead of retained history');
    if (!this.directory) throw Object.assign(new Error('Raw history is no longer retained'), { status: 404 });
    const events = []; let emittedBytes = 0;
    if (from === this.count) return events;
    const fd = openSync(this.path, 'r');
    try {
      let sequence = Math.floor(from / INDEX_INTERVAL) * INDEX_INTERVAL;
      while (sequence < this.count && events.length < limit) {
        const block = Math.floor(sequence / INDEX_INTERVAL);
        const start = this.offsets[block], end = this.offsets[block + 1] ?? this.bytes;
        const bytes = Buffer.allocUnsafe(end - start);
        for (let offset = 0; offset < bytes.length;) {
          const read = readSync(fd, bytes, offset, bytes.length - offset, start + offset);
          if (!read) throw new Error('Retained raw archive ended unexpectedly');
          offset += read;
        }
        let cursor = 0;
        while (cursor < bytes.length && events.length < limit) {
          const next = bytes.indexOf(10, cursor);
          if (next < 0) throw new Error('Retained raw archive has an incomplete record');
          if (sequence >= from) {
            const size = next + 1 - cursor;
            // One recorder record may exceed the target; never split or omit that fact.
            if (events.length && emittedBytes + size > byteLimit) return events;
            const event = JSON.parse(bytes.subarray(cursor, next).toString('utf8'));
            if (event.seq !== sequence) throw new Error('Retained raw archive sequence mismatch');
            events.push(event); emittedBytes += size;
          }
          sequence++; cursor = next + 1;
        }
      }
      return events;
    } finally { closeSync(fd); }
  }

  snapshot() {
    const events = [];
    for (let from = 0; from < this.count;) {
      const page = this.read(from, RAW_BATCH_MAX);
      events.push(...page); from += page.length;
    }
    return events;
  }
  close() {
    if (this.fd !== null) {
      try { closeSync(this.fd); } catch (error) { this.cleanupError = error; }
      this.fd = null;
    }
  }
  dispose() {
    this.close();
    // Retention cleanup must never turn into an execution failure for another JVM.
    try { if (this.directory) rmSync(this.directory, { recursive: true, force: true }); }
    catch (error) { this.cleanupError = error; }
    this.directory = null; this.offsets = []; this.counts = Object.create(null); this.count = 0; this.bytes = 0;
  }
}
