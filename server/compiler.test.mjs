import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileProject, parseJavacDiagnostics } from './compiler.mjs';
import { detectJdk } from './jdk.mjs';

const temporaryProjects = [];
afterEach(async () => {
  await Promise.all(temporaryProjects.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('diagnostics preserve caret, multi-line explanation, and safe paths', () => {
  const root = '/managed/project';
  const output = './src/Main.java:4: error: cannot find symbol\n    missing();\n    ^\n  symbol:   method missing()\n  location: class Main\n/other/Outside.java:2: warning: external\n  x();\n  ^\n1 error\n1 warning\n';
  const [first, second] = parseJavacDiagnostics(output, root);
  assert.deepEqual(first.location, { path: 'src/Main.java', line: 4, column: 5 });
  assert.equal(first.severity, 'error');
  assert.match(first.message, /cannot find symbol\nsymbol:   method missing\(\)\nlocation: class Main/);
  assert.match(first.raw, /    missing\(\);\n    \^/);
  assert.equal(second.location.path, '');
  assert.equal(second.location.column, 3);
  assert.notEqual(first.id, second.id);
});

test('compiles every Java file, finds runnable classes, and clears stale output', async (t) => {
  const jdk = await detectJdk();
  if (!jdk.available) return t.skip(jdk.error);
  const temp = await mkdtemp(join(tmpdir(), 'visual-java-build-'));
  temporaryProjects.push(temp);
  const project = join(temp, 'project');
  const build = join(temp, 'build', 'classes');
  await mkdir(join(project, 'demo'), { recursive: true });
  await writeFile(join(project, 'demo', 'Main.java'), 'package demo; public class Main { public static void main(String[] args) { System.out.println(Helper.answer()); } }\n');
  await writeFile(join(project, 'demo', 'Helper.java'), 'package demo; class Helper { static int answer() { return 42; } }\n');
  const first = await compileProject(project, build, jdk.home);
  assert.equal(first.success, true, first.rawOutput);
  assert.deepEqual(first.mainClasses, ['demo.Main']);
  assert.ok((await readFile(join(build, 'demo', 'Helper.class'))).length > 0);
  await writeFile(join(build, 'obsolete.class'), 'stale');
  const second = await compileProject(project, build, jdk.home);
  assert.equal(second.success, true, second.rawOutput);
  assert.deepEqual(await readdir(build), ['demo']);
  await writeFile(join(project, 'demo', 'Main.java'), 'package demo; public class Main { public static void main(String[] args) { missing(); } }\n');
  const failed = await compileProject(project, build, jdk.home);
  assert.equal(failed.success, false);
  assert.equal(failed.mainClasses.length, 0);
  assert.equal((await readdir(build)).length, 0);
  assert.equal(failed.diagnostics[0].location.path, 'demo/Main.java');
  assert.equal(failed.diagnostics[0].severity, 'error');
  assert.ok(failed.diagnostics[0].location.column > 0);
  assert.match(failed.rawOutput, /cannot find symbol/);
});
