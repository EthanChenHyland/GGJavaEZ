import { mkdtempSync, openSync, writeSync, closeSync, rmSync, createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Process bytes, independent of semantic capture. No asynchronous write queue. */
export class OutputArchive {
  constructor() {
    this.directory = null;
    this.files = new Map();
    this.error = null;
    try {
      this.directory = mkdtempSync(join(tmpdir(), 'vj-process-output-'));
      for (const name of ['stdout', 'stderr']) {
        const path = join(this.directory, `${name}.txt`);
        this.files.set(name, { path, fd: openSync(path, 'wx', 0o600) });
      }
    } catch (failure) { this.error = failure.message; this.dispose(); }
  }

  append(name, bytes) {
    if (this.error) return;
    try {
      const file = this.files.get(name);
      if (!file || file.fd === null) throw new Error('Process output archive is closed');
      // writeSync may write fewer bytes. Retain the original pipe bytes exactly.
      for (let offset = 0; offset < bytes.length;) {
        const written = writeSync(file.fd, bytes, offset, bytes.length - offset);
        if (!written) throw new Error('Process output archive write made no progress');
        offset += written;
      }
    } catch (failure) { this.error = failure.message; this.close(); }
  }

  close() {
    for (const file of this.files.values()) {
      if (file.fd !== null) { try { closeSync(file.fd); } catch { /* Already closed. */ } file.fd = null; }
    }
  }

  stream(name) {
    if (!['stdout', 'stderr'].includes(name)) throw Object.assign(new Error('Unknown console channel'), { status: 400 });
    if (this.error || !this.directory) throw Object.assign(new Error('Complete output archive is unavailable'), { status: 409 });
    return createReadStream(this.files.get(name).path);
  }

  dispose() {
    this.close();
    try {
      if (this.directory) rmSync(this.directory, { recursive: true, force: true });
      this.directory = null;
    } catch (failure) {
      // Archive cleanup cannot become authority over a newly launched JVM.
      this.error = failure.message;
    }
  }
}
