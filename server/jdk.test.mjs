import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectJdk } from './jdk.mjs';

const temporaryHomes = [];
afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

test('explicit JDK home requires both matching executables', async (t) => {
  if (process.platform === 'win32') return t.skip('fixture executables use POSIX shell');
  const home = await mkdtemp(join(tmpdir(), 'visual-java-jdk-'));
  temporaryHomes.push(home);
  await mkdir(join(home, 'bin'));
  const java = join(home, 'bin', 'java');
  const javac = join(home, 'bin', 'javac');
  await writeFile(java, '#!/bin/sh\necho "openjdk version \"21.0.2\"" >&2\n');
  await chmod(java, 0o755);
  assert.equal((await detectJdk(home)).available, false);
  await writeFile(javac, '#!/bin/sh\necho "javac 17.0.9" >&2\n');
  await chmod(javac, 0o755);
  assert.match((await detectJdk(home)).error, /different versions/);
  await writeFile(javac, '#!/bin/sh\necho "javac 21.0.2" >&2\n');
  const found = await detectJdk(home);
  const canonicalHome = await realpath(home);
  assert.deepEqual(found, { available: true, home: canonicalHome,
    javaPath: join(canonicalHome, 'bin', 'java'), javacPath: join(canonicalHome, 'bin', 'javac'),
    version: '21.0.2', error: null });
});

test('automatic discovery finds a real paired JDK when installed', async (t) => {
  const found = await detectJdk();
  if (!found.available) return t.skip(found.error);
  assert.ok(found.javaPath.startsWith(found.home));
  assert.ok(found.javacPath.startsWith(found.home));
  assert.match(found.version, /^\d/);
});
