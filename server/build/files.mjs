import { constants } from 'node:fs';
import { access, copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BuildFailure } from './process.mjs';

export const unique = (values) => [...new Set(values)];
export const posix = (value) => value.split(sep).join('/');
export function contained(root, target) {
  const rel = relative(root, target); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}
export async function exists(path) { try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
export async function projectPath(root, value, { output = false } = {}) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new BuildFailure('model_export_invalid', 'Invalid project model path');
  const path = resolve(root, value);
  if (!contained(root, path) || output && path === root) throw new BuildFailure('unsupported_project_model', `Project path is outside the supported project boundary: ${value}`);
  let cursor = root;
  for (const component of relative(root, path).split(sep).filter(Boolean)) {
    cursor = join(cursor, component);
    if (!await exists(cursor)) break;
    if ((await lstat(cursor)).isSymbolicLink()) throw new BuildFailure('unsupported_project_model', `Symbolic link in project model: ${value}`);
  }
  return path;
}
export async function walkFiles(root, { missing = true, skip = new Set() } = {}) {
  const files = [];
  if (missing && !await exists(root)) return files;
  if ((await lstat(root)).isSymbolicLink()) throw new BuildFailure('unsupported_project_model', 'Symbolic link in project inputs');
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true }); entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new BuildFailure('unsupported_project_model', `Symbolic link in project inputs: ${entry.name}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await visit(root); return files;
}
export async function javaSourcePaths(root, roots, { skip, files } = {}) {
  const inputs = files ?? (await Promise.all(roots.map(async (value) => walkFiles(await projectPath(root, value), { skip })))).flat();
  const paths = [];
  for (const file of inputs) {
    const path = await projectPath(root, file);
    if (path.endsWith('module-info.java')) throw new BuildFailure('unsupported_project_model', 'JPMS module-info.java projects are not supported in M9');
    if (path.endsWith('.java')) paths.push(posix(relative(root, path)));
  }
  return unique(paths).sort();
}
export async function readBounded(path, max = 16 * 1024 * 1024) {
  const info = await stat(path);
  if (!info.isFile() || info.size > max) throw new BuildFailure('model_export_invalid', 'Model export exceeded its file limit');
  return readFile(path, 'utf8');
}
export async function dependenciesFromPaths(paths) {
  const values = unique(paths);
  for (const path of values) {
    if (!isAbsolute(path) || !await exists(path)) throw new BuildFailure('dependency_resolution_failed', `Resolved classpath entry is unavailable: ${path}`);
  }
  return values.map((path) => ({ name: basename(path), path }));
}
export function parseClasspath(text) { return unique(text.trim().split(delimiter).filter(Boolean)); }
export async function findTool(kind, root, workspaceRoot) {
  const wrapper = join(root, process.platform === 'win32' ? kind === 'maven' ? 'mvnw.cmd' : 'gradlew.bat' : kind === 'maven' ? 'mvnw' : 'gradlew');
  if (await exists(wrapper)) {
    await projectPath(root, wrapper);
    if (process.platform === 'win32') throw new BuildFailure('unsupported_project_model', 'Windows batch-wrapper execution is not yet supported');
    if (kind === 'gradle' && (!await exists(join(root, 'gradle/wrapper/gradle-wrapper.jar')) || !await exists(join(root, 'gradle/wrapper/gradle-wrapper.properties')))) {
      throw new BuildFailure('wrapper_incomplete', 'Gradle wrapper requires its script, JAR and properties');
    }
    return { command: '/bin/sh', prefix: [wrapper], wrapper: true };
  }
  const override = process.env[kind === 'maven' ? 'GGJAVA_MAVEN_PATH' : 'GGJAVA_GRADLE_PATH'];
  const name = kind === 'maven' ? 'mvn' : 'gradle';
  const candidates = [override, join(workspaceRoot, 'tools', kind, 'bin', name), ...(process.env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, name))].filter(Boolean);
  for (const command of candidates) { try { await access(command, constants.X_OK); return { command, prefix: [], wrapper: false }; } catch { /* next candidate */ } }
  throw new BuildFailure('tool_unavailable', `${kind === 'maven' ? 'Maven' : 'Gradle'} unavailable. Run node scripts/setup-build-tools.mjs or configure ${kind === 'maven' ? 'GGJAVA_MAVEN_PATH' : 'GGJAVA_GRADLE_PATH'}.`);
}

/** Production-only staging. Reject collisions, symlinks, unsafe paths; publish after all copies succeed. */
export async function stageOutputs(projectRoot, classesDir, outputRoots) {
  const staging = `${classesDir}.staging-${randomUUID()}`;
  await mkdir(staging, { recursive: true });
  const seen = new Set();
  try {
    for (const value of unique(outputRoots)) {
      const source = await projectPath(projectRoot, value, { output: true });
      if (contained(source, classesDir) || contained(classesDir, source)) throw new BuildFailure('unsupported_project_model', 'Original build output overlaps managed staging output');
      for (const file of await walkFiles(source)) {
        const rel = relative(source, file);
        if (seen.has(rel)) throw new BuildFailure('output_collision', `Production outputs collide at ${posix(rel)}`);
        seen.add(rel); const target = join(staging, rel); await mkdir(resolve(target, '..'), { recursive: true }); await copyFile(file, target);
      }
    }
    await rm(classesDir, { recursive: true, force: true }); await rename(staging, classesDir);
  } finally { await rm(staging, { recursive: true, force: true }); }
}
