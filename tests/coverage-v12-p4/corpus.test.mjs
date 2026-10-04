import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { FACTS } from './facts.mjs';
import { inventory, javaFiles } from './runner.mjs';

const projects = await inventory();

describe('Phase 4 fresh acceptance corpus inventory (no JVM)', () => {
  test('contains exactly one fresh project for every requested category 1 through 24', () => {
    const categories = projects.map(project => project.spec.category).filter(Number.isInteger).sort((a, b) => a - b);
    expect(categories).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
    expect(projects.some(project => project.spec.category === 'cross-feature')).toBe(true);
    expect(projects.some(project => project.spec.category === 'dynamic-loading')).toBe(true);
    expect(projects.some(project => project.spec.category === 'observer-transparency')).toBe(true);
  });

  test.each(projects)('$name has explicit behavior and implemented generic fact assertions', async project => {
    const { spec, projectDir } = project;
    expect(spec.mainClass).toMatch(/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/);
    expect(spec.stdout).toBeTypeOf('string');
    expect(spec.stderr).toBeTypeOf('string');
    expect(spec.exitCode).toBeTypeOf('number');
    expect(spec.facts.length).toBeGreaterThan(0);
    for (const fact of spec.facts) {
      expect(FACTS[fact.kind], `Unimplemented fact ${JSON.stringify(fact)}`).toBeTypeOf('function');
      for (const rendererField of ['xyz', 'camera', 'material', 'glow', 'animation']) expect(fact).not.toHaveProperty(rendererField);
    }
    const paths = await javaFiles(projectDir);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const source = await readFile(path, 'utf8');
      expect(source, path).not.toMatch(/\b(Person|factorial|bubbleSort|setAge|BankAccount|LedgerService|Receipt)\b/);
      expect(source, path).not.toMatch(/visualjava\.(?:Recorder|OfflineTransformer)|System\.loadLibrary/);
    }
  });

  test('realistic project spans packages and composes every requested interaction', async () => {
    const project = projects.find(project => project.spec.category === 'cross-feature');
    const paths = await javaFiles(project.projectDir);
    expect(paths.length).toBeGreaterThanOrEqual(7);
    const source = (await Promise.all(paths.map(path => readFile(path, 'utf8')))).join('\n');
    expect(new Set([...source.matchAll(/package\s+([\w.]+);/g)].map(match => match[1])).size).toBeGreaterThanOrEqual(3);
    for (const marker of ['interface Pricing', 'extends BasePricing', 'static int sent', 'record Shipment', 'enum Phase',
      'Shipment[]', 'int[][]', 'ArrayList', 'HashMap', 'Queue', '->', '::mark', 'catch(', 'System.in',
      'System.out', 'System.err', 'Files.writeString', 'Files.readString', 'org.apache.commons.lang3']) expect(source).toContain(marker);
    expect(project.spec.stdin).toBe('3\n');
    expect(await readFile(join(project.projectDir, 'pom.xml'), 'utf8')).toContain('commons-lang3');
  });

  test('Maven and Gradle resolve a real pinned third-party artifact with debug information', async () => {
    for (const category of [22, 23]) {
      const { projectDir, spec } = projects.find(project => project.spec.category === category);
      const build = await readFile(join(projectDir, category === 22 ? 'pom.xml' : 'build.gradle'), 'utf8');
      expect(build).toContain('commons-lang3');
      expect(build).toContain('3.17.0');
      expect(build).toContain('17');
      expect(build).toContain('lines,vars,source');
      expect(spec.facts.some(fact => fact.kind === 'libraryBoundary')).toBe(true);
    }
  });
});
