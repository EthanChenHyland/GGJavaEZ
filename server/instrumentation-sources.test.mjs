import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectJdk } from './jdk.mjs';
import { buildInstrumentationSourceManifest, resolveInstrumentationSource } from './instrumentation-sources.mjs';

const temporary = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'visual-java-sources-'));
  temporary.push(root);
  const project = join(root, 'project');
  const classes = join(root, 'classes');
  await mkdir(project);
  await mkdir(classes);
  for (const [path, content] of Object.entries(files)) {
    const full = join(project, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  return { root, project, classes };
}

function compile(javac, { project, classes }, paths, options = []) {
  const result = spawnSync(javac, ['-encoding', 'UTF-8', ...options, '-d', classes, ...paths], { cwd: project, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

test('package and SourceFile metadata resolve actual paths, including nested classes and duplicate basenames', async (t) => {
  const jdk = await detectJdk();
  if (!jdk.available) return t.skip(jdk.error);
  const alpha = 'package alpha; public class Main { static class Inner {} public static void main(String[] args) {} }\n';
  const beta = '// package alpha;\npackage beta; public class Main { class Inner {} }\n';
  const fixtureData = await fixture({ 'odd/place/Main.java': alpha, 'elsewhere/Main.java': beta });
  compile(jdk.javacPath, fixtureData, ['odd/place/Main.java', 'elsewhere/Main.java'], ['-g:lines,vars,source']);
  const manifest = await buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes);
  assert.deepEqual(manifest.sources.map((source) => source.fileId), ['elsewhere/Main.java', 'odd/place/Main.java']);
  assert.equal(resolveInstrumentationSource(manifest, 'alpha.Main').fileId, 'odd/place/Main.java');
  assert.equal(resolveInstrumentationSource(manifest, 'alpha.Main$Inner').fileId, 'odd/place/Main.java');
  assert.equal(resolveInstrumentationSource(manifest, 'beta.Main').fileId, 'elsewhere/Main.java');
  assert.equal(resolveInstrumentationSource(manifest, 'beta.Main$Inner').fileId, 'elsewhere/Main.java');
  assert.equal(resolveInstrumentationSource(manifest, 'java.lang.String'), null);
  assert.equal(resolveInstrumentationSource(manifest, 'alpha.Main').sourceSha256, createHash('sha256').update(alpha).digest('hex'));
  assert.deepEqual(manifest.sources.find((source) => source.fileId === 'odd/place/Main.java'), {
    fileId: 'odd/place/Main.java', name: 'Main.java', content: alpha, sha256: createHash('sha256').update(alpha).digest('hex'),
  });
  assert.deepEqual(await buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes), manifest);
});

test('same package and SourceFile in two real files remains ambiguous', async (t) => {
  const jdk = await detectJdk();
  if (!jdk.available) return t.skip(jdk.error);
  const fixtureData = await fixture({
    'one/Duplicate.java': 'package same; class First { static class Nested {} }\n',
    'two/Duplicate.java': 'package same; class Second {}\n',
  });
  compile(jdk.javacPath, fixtureData, ['one/Duplicate.java', 'two/Duplicate.java']);
  const manifest = await buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes, ['two/Duplicate.java', 'one/Duplicate.java']);
  assert.deepEqual(manifest.sources.map((source) => source.fileId), ['one/Duplicate.java', 'two/Duplicate.java']);
  for (const className of ['same.First', 'same.First$Nested', 'same.Second']) {
    assert.deepEqual(resolveInstrumentationSource(manifest, className), {
      className, sourceFile: 'Duplicate.java', fileId: null, sourceSha256: null,
      status: 'ambiguous', candidates: ['one/Duplicate.java', 'two/Duplicate.java'],
    });
  }
});

test('missing debug SourceFile and absent source are distinct unresolved results', async (t) => {
  const jdk = await detectJdk();
  if (!jdk.available) return t.skip(jdk.error);
  const fixtureData = await fixture({ 'p/One.java': 'package p; public class One {}\n' });
  compile(jdk.javacPath, fixtureData, ['p/One.java'], ['-g:none']);
  const noMetadata = await buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes);
  assert.equal(resolveInstrumentationSource(noMetadata, 'p.One').status, 'missing_source_file');
  assert.equal(resolveInstrumentationSource(noMetadata, 'p.One').fileId, null);
  compile(jdk.javacPath, fixtureData, ['p/One.java'], ['-g:lines,vars,source']);
  const omitted = await buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes, []);
  assert.deepEqual(resolveInstrumentationSource(omitted, 'p.One'), {
    className: 'p.One', sourceFile: 'One.java', fileId: null, sourceSha256: null, status: 'not_found', candidates: [],
  });
});

test('explicit source paths reject traversal and symlink escapes', async () => {
  const fixtureData = await fixture({ 'Main.java': 'class Main {}\n' });
  await assert.rejects(buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes, ['../outside.java']), /Invalid project-relative/);
  await symlink(join(fixtureData.root, 'outside.java'), join(fixtureData.project, 'Escape.java'));
  await assert.rejects(buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes), /Symbolic link/);
});

test('class-file modified UTF-8 preserves supplementary Unicode identifiers', async (t) => {
  const jdk = await detectJdk();
  if (!jdk.available) return t.skip(jdk.error);
  const name = '𐐀';
  const fixtureData = await fixture({ [`unicode/${name}.java`]: `package unicode; public class ${name} {}\n` });
  compile(jdk.javacPath, fixtureData, [`unicode/${name}.java`]);
  const manifest = await buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes);
  assert.equal(resolveInstrumentationSource(manifest, `unicode.${name}`).fileId, `unicode/${name}.java`);
});

test('default and annotated package sources map without directory-name assumptions', async (t) => {
  const jdk = await detectJdk();
  if (!jdk.available) return t.skip(jdk.error);
  const fixtureData = await fixture({
    'src/Loose.java': '/* package fake; */ class Loose {}\n',
    'unusual/Flag.java': 'package marked; import java.lang.annotation.*; @Target(ElementType.PACKAGE) public @interface Flag {}\n',
    'unusual/package-info.java': '@Flag package marked;\n',
  });
  compile(jdk.javacPath, fixtureData, ['src/Loose.java', 'unusual/Flag.java', 'unusual/package-info.java']);
  const manifest = await buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes);
  assert.equal(resolveInstrumentationSource(manifest, 'Loose').fileId, 'src/Loose.java');
  assert.equal(resolveInstrumentationSource(manifest, 'marked.Flag').fileId, 'unusual/Flag.java');
  assert.equal(resolveInstrumentationSource(manifest, 'marked.package-info').fileId, 'unusual/package-info.java');
});

test('invalid compiled class fails manifest creation instead of being silently skipped', async () => {
  const fixtureData = await fixture({ 'Main.java': 'class Main {}\n' });
  await writeFile(join(fixtureData.classes, 'Main.class'), 'not a class');
  await assert.rejects(buildInstrumentationSourceManifest(fixtureData.project, fixtureData.classes), /Cannot read compiled class Main\.class/);
});
