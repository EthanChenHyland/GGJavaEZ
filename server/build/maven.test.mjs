import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
const mock = vi.hoisted(() => ({ calls: [], pom: '', runtime: '', compile: '' }));
vi.mock('./process.mjs', async (original) => ({ ...await original(), checkedTool: async (_command, args) => {
  mock.calls.push(args);
  const { writeFile: write } = await import('node:fs/promises');
  const output = args.find((arg) => arg.startsWith('-Doutput='))?.slice('-Doutput='.length);
  const classpath = args.find((arg) => arg.startsWith('-Dmdep.outputFile='))?.slice('-Dmdep.outputFile='.length);
  if (output) await write(output, mock.pom);
  if (classpath) await write(classpath, args.includes('-DincludeScope=runtime') ? mock.runtime : mock.compile);
  return { code: 0, output: '', elapsedMs: 1 };
} }));
import { parseEffectivePom, resolveMaven } from './maven.mjs';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); mock.calls.length = 0; });

describe('Maven effective model parser', () => {
  it('reads namespace-qualified effective POM values including inherited custom roots', () => {
    const model = parseEffectivePom(`<?xml version="1.0"?><m:project xmlns:m="http://maven.apache.org/POM/4.0.0">
      <m:packaging>jar</m:packaging><m:build><m:sourceDirectory>/project/custom/java</m:sourceDirectory>
      <m:testSourceDirectory>/project/custom/tests</m:testSourceDirectory>
      <m:outputDirectory>/project/out/classes</m:outputDirectory></m:build></m:project>`);
    expect(model.build.sourceDirectory).toBe('/project/custom/java');
    expect(model.build.testSourceDirectory).toBe('/project/custom/tests');
    expect(model.build.outputDirectory).toBe('/project/out/classes');
  });
  it('rejects entity declarations rather than expanding untrusted XML', () => {
    expect(() => parseEffectivePom('<!DOCTYPE project [<!ENTITY x SYSTEM "file:///etc/passwd">]><project/>')).toThrow(/unsafe/);
  });
  it('uses actual runtime and compile scope properties and preserves dependency order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ggjava-maven-model-')); roots.push(root);
    const src = join(root, 'custom/java'); await mkdir(src, { recursive: true });
    await writeFile(join(src, 'Main.java'), 'class Main {}');
    const a = join(root, 'a.jar'), b = join(root, 'b.jar'), provided = join(root, 'provided.jar');
    await Promise.all([a, b, provided].map((path) => writeFile(path, '')));
    mock.pom = `<project xmlns="http://maven.apache.org/POM/4.0.0"><packaging>jar</packaging><build>
      <sourceDirectory>${src}</sourceDirectory><testSourceDirectory>${root}/custom/tests</testSourceDirectory>
      <outputDirectory>${root}/target/classes</outputDirectory></build></project>`;
    mock.runtime = [b, a].join(delimiter);
    mock.compile = [a, provided].join(delimiter);
    const classesDir = join(root, '..', 'managed-classes');
    const model = await resolveMaven({ projectRoot: root, classesDir, jdk: { home: '/mock/jdk' }, findTool: async () => ({ command: 'mvn', prefix: [] }) });
    expect(mock.calls[1]).toContain('-DincludeScope=runtime');
    expect(mock.calls[2]).toContain('-DincludeScope=compile');
    expect(mock.calls.flat()).not.toContain('-Dmdep.includeScope=runtime');
    expect(model.sourceRoots).toEqual(['custom/java']);
    expect(model.sourcePaths).toEqual(['custom/java/Main.java']);
    expect(model.runtimeClasspath).toEqual([classesDir, b, a]);
    expect(model.compileClasspath).toEqual([classesDir, a, provided]);
  });
});
