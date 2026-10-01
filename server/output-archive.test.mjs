import { expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { OutputArchive } from './output-archive.mjs';

test('complete process bytes survive beyond inline retention without a queued buffer', async () => {
  const archive = new OutputArchive();
  const directory = archive.directory;
  try {
    const chunk = Buffer.alloc(1024 * 1024, 'a');
    for (let i = 0; i < 33; i++) archive.append('stdout', chunk);
    const final = Buffer.from('FINAL 😃\n');
    archive.append('stdout', final.subarray(0, final.length - 3));
    archive.append('stdout', final.subarray(final.length - 3));
    archive.append('stderr', Buffer.from('REAL ERROR\n'));
    archive.close();
    let bytes = 0;
    let tail = Buffer.alloc(0);
    for await (const part of archive.stream('stdout')) { bytes += part.length; tail = Buffer.concat([tail, part]).subarray(-final.length); }
    expect(bytes).toBe(33 * 1024 * 1024 + final.length);
    expect(tail).toEqual(final);
    let stderr = '';
    for await (const part of archive.stream('stderr')) stderr += part.toString();
    expect(stderr).toBe('REAL ERROR\n');
    expect(() => archive.stream('../stdout')).toThrow('Unknown console channel');
    expect([...archive.files.values()].every((file) => file.fd === null)).toBe(true);
    expect(archive.error).toBeNull();
  } finally { archive.dispose(); }
  expect(existsSync(directory)).toBe(false);
});
