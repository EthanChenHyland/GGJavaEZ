import { relative, resolve, dirname } from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';
import { compileProject } from '../compiler.mjs';
import { BuildFailure } from './process.mjs';
import { exists, javaSourcePaths, posix, projectPath, readBounded, walkFiles, unique } from './files.mjs';

const excluded = new Set(['.git', '.gradle', '.ggjavaez', 'build', 'target', 'node_modules']);
export async function resolvePlain({ projectRoot, classesDir }) {
  const configFile = `${projectRoot}/visualjava.project.json`;
  if (await exists(configFile)) {
    let config;
    try { config = JSON.parse(await readBounded(configFile, 64 * 1024)); }
    catch { throw new BuildFailure('model_export_invalid', 'visualjava.project.json must contain valid JSON under 64 KiB'); }
    if (!config || Array.isArray(config) || typeof config !== 'object' ||
      Object.keys(config).some((key) => !['sourceRoots', 'testSourceRoots'].includes(key))) {
      throw new BuildFailure('model_export_invalid', 'visualjava.project.json supports sourceRoots and testSourceRoots only');
    }
    const validate = async (values, required) => {
      if (!Array.isArray(values) || required && !values.length || values.some((value) => typeof value !== 'string' ||
        !value || value.startsWith('/') || value.includes('\\') || value.includes('\0') ||
        value.split('/').some((part) => part === '..' || part === '') || /^[A-Za-z]:/.test(value))) {
        throw new BuildFailure('model_export_invalid', 'Configured source roots must be project-relative directories');
      }
      const roots = [];
      for (const value of values) {
        const absolute = await projectPath(projectRoot, value);
        if (!await exists(absolute)) throw new BuildFailure('model_export_invalid', `Configured source root is missing: ${value}`);
        roots.push(posix(relative(projectRoot, absolute)) || '.');
      }
      return unique(roots);
    };
    const sourceRoots = await validate(config.sourceRoots, true);
    const testSourceRoots = await validate(config.testSourceRoots ?? [], false);
    if (sourceRoots.some((root) => testSourceRoots.some((test) => root === test || root === '.' || test === '.' ||
      root.startsWith(`${test}/`) || test.startsWith(`${root}/`)))) {
      throw new BuildFailure('model_export_invalid', 'Production and test source roots must be separate');
    }
    const sourcePaths = await javaSourcePaths(projectRoot, sourceRoots, { skip: excluded });
    return { sourceRoots, testSourceRoots, sourcePaths, outputRoots: [], compileClasspath: [classesDir],
      runtimeClasspath: [classesDir], dependencies: [], rawOutput: '' };
  }
  const files = await walkFiles(projectRoot, { skip: excluded });
  const testSourceRoots = await exists(`${projectRoot}/src/test/java`) ? ['src/test/java'] : [];
  const production = files.filter((file) => !posix(relative(projectRoot, file)).startsWith('src/test/'));
  const sourcePaths = await javaSourcePaths(projectRoot, ['.'], { files: production });
  const sourceRoots = sourcePaths.length && sourcePaths.every((file) => file.startsWith('src/main/java/')) ? ['src/main/java'] :
    sourcePaths.length && sourcePaths.every((file) => file.startsWith('src/')) ? ['src'] : ['.'];
  return { sourceRoots, testSourceRoots, sourcePaths, outputRoots: [], compileClasspath: [classesDir], runtimeClasspath: [classesDir], dependencies: [], rawOutput: '' };
}
export async function buildPlain(context, model, { debug = false } = {}) {
  const result = await compileProject(context.projectRoot, context.classesDir, context.jdk.home, { debug, sourcePaths: model.sourcePaths, jdk: context.jdk });
  if (!result.success) return result;
  const files = await walkFiles(context.projectRoot, { skip: excluded });
  for (const file of files) {
    const path = posix(relative(context.projectRoot, file));
    if (path.startsWith('src/test/') || path.endsWith('.java') || path === '.ggjavaez-project.json') continue;
    const root = model.sourceRoots.find((candidate) => candidate !== '.' && (path === candidate || path.startsWith(`${candidate}/`)));
    if (!root) continue;
    const target = resolve(context.classesDir, path.slice(root.length + 1));
    await mkdir(dirname(target), { recursive: true });
    if (!await exists(target)) await copyFile(file, target);
  }
  return result;
}
