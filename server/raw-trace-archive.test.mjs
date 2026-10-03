import { test, expect } from 'vitest';
import { access, mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RawTraceArchive, rawRange } from './raw-trace-archive.mjs';
import { CaptureReader } from './instrumentation-provider.mjs';

const raw = (seq, type = 'line', extra = {}) => ({ v: 1, seq, type, threadId: '1', frameId: 'f1',
  className: 'Main', methodName: 'main', descriptor: '()V', line: 1, site: 0, ...extra });
const lines = (events) => events.map(JSON.stringify).join('\n') + '\n';

test('sparse retained pages are stable, end exclusive and bounded across index blocks', async () => {
  const archive = new RawTraceArchive(), directory = archive.directory;
  const events = Array.from({ length: 1300 }, (_, seq) => raw(seq, seq % 2 ? 'line' : 'local'));
  try {
    for (const event of events) archive.append(event);
    expect(archive.count).toBe(1300); expect(archive.counts).toEqual({ line: 650, local: 650 });
    expect(archive.offsets).toHaveLength(6);
    expect(archive.read(255, 258)).toEqual(events.slice(255, 513));
    const first = archive.read(256, 1024); first[0].line = 999;
    expect(archive.read(256, 1024)).toEqual(events.slice(256, 1280));
    expect(archive.read(0, 999999)).toHaveLength(1024);
    expect(archive.read(1300)).toEqual([]);
    archive.close(); expect(archive.snapshot()).toEqual(events);
    expect(() => archive.append(raw(1300))).toThrow('closed');
  } finally { archive.dispose(); }
  await expect(access(directory)).rejects.toThrow();
});

test('page byte target bounds large batches and retains an indivisible large record', () => {
  const archive = new RawTraceArchive();
  try {
    archive.append(raw(0, 'console', { text: 'x'.repeat(300000) })); archive.append(raw(1));
    expect(archive.read(0, 1024)).toHaveLength(1);
    expect(archive.read(1, 1024)).toEqual([raw(1)]);
    expect(() => archive.append(raw(3))).toThrow('contiguous');
    expect(archive.count).toBe(2);
  } finally { archive.dispose(); }
});

test.each([[-1, 1], [0.1, 1], [0, 0], [0, Infinity], [Number.MAX_SAFE_INTEGER + 1, 1]])('invalid range %s/%s is rejected', (from, limit) => {
  expect(() => rawRange(from, limit)).toThrow();
});

test('file capture appends only verified facts, preserves P1 stopped watermark, and survives source cleanup', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'vj-p2-capture-')), trace = join(temp, 'raw.ndjson');
  const reader = new CaptureReader({ trace, rawEventLimit: 2, rawByteLimit: 4096 });
  try {
    await writeFile(trace, lines([raw(0)])); await reader.refresh();
    const recording = { state: 'STOPPED_LIMIT', reason: 'Event limit', budget: 'events', lastRecordedSeq: 1, executionContinued: true };
    const tail = [raw(1), raw(2, 'capture_saturated', { recording }), raw(3)];
    await appendFile(trace, lines(tail)); await reader.refresh(true);
    expect(reader.count).toBe(3); expect(reader.counts).toEqual({ line: 2, capture_saturated: 1 });
    expect(reader.recording).toEqual(recording); expect(reader.stopped).toBe(true);
    await reader.close(); await rm(temp, { recursive: true, force: true });
    expect(reader.events).toEqual([raw(0), ...tail.slice(0, 2)]);
    expect(reader.archive.read(1, 2)).toEqual(tail.slice(0, 2));
  } finally { await reader.dispose(); await rm(temp, { recursive: true, force: true }); }
});

test('raw archive failure stops observation at last committed fact without escaping to the process', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'vj-p2-capture-error-')), trace = join(temp, 'raw.ndjson');
  const reader = new CaptureReader({ trace });
  try {
    await writeFile(trace, lines([raw(0)])); await reader.refresh(); reader.archive.close();
    await appendFile(trace, lines([raw(1)])); await reader.refresh();
    expect(reader.count).toBe(1);
    expect(reader.recording).toMatchObject({ state: 'STOPPED_ERROR', lastRecordedSeq: 0, executionContinued: true });
    expect(reader.events).toEqual([raw(0)]);
  } finally { await reader.dispose(); await rm(temp, { recursive: true, force: true }); }
});

test('cleanup of a failed/closed descriptor cannot escape into another execution', () => {
  const archive = new RawTraceArchive(), directory = archive.directory;
  archive.close(); archive.fd = -1;
  expect(() => archive.dispose()).not.toThrow();
  expect(archive.cleanupError).toBeInstanceOf(Error);
  expect(archive.directory).toBe(null);
  return expect(access(directory)).rejects.toThrow();
});
