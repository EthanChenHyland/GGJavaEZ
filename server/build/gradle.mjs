import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { BuildFailure, checkedTool } from './process.mjs';
import { dependenciesFromPaths, javaSourcePaths, posix, projectPath, stageOutputs, unique } from './files.mjs';

const initScript = fileURLToPath(new URL('./gradle-model.init.gradle', import.meta.url));
async function validatePaths(root, paths, output = false) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) throw new BuildFailure('model_export_invalid', 'Gradle exported invalid paths');
  return Promise.all(paths.map((path) => projectPath(root, path, { output })));
}
const relativePaths = (root, values) => unique(values.map((path) => posix(relative(root, path)) || '.'));

export async function resolveGradle(context) {
  const tool = await context.findTool('gradle');
  const temporary = await mkdtemp(join(tmpdir(), 'ggjava-gradle-'));
  try {
    const destination = join(temporary, 'model.json');
    const run = await checkedTool(tool.command, [...tool.prefix, '--no-daemon', '--console=plain', '--init-script', initScript,
      `-PvisualJavaModelFile=${destination}`, 'visualJavaExportModel'], {
      cwd: context.projectRoot, env: { ...process.env, JAVA_HOME: context.jdk.home }, timeoutMs: 120000,
    });
    let exported;
    try { exported = JSON.parse(await readFile(destination, 'utf8')); }
    catch { throw new BuildFailure('model_export_invalid', 'Gradle did not export a valid Java source-set model', run.output); }
    const [source, tests, outputs, compile, runtime] = await Promise.all([
      validatePaths(context.projectRoot, exported.sourceRoots), validatePaths(context.projectRoot, exported.testSourceRoots),
      validatePaths(context.projectRoot, exported.outputRoots, true),
      classpathPaths(exported.compileClasspath), classpathPaths(exported.runtimeClasspath),
    ]);
    if (!source.length || !outputs.length) throw new BuildFailure('unsupported_project_model', 'Gradle main source set has no source or output roots');
    const outputSet = new Set(outputs);
    const dependencies = await dependenciesFromPaths(unique([...compile, ...runtime].filter((path) => !outputSet.has(path))));
    const sourceRoots = relativePaths(context.projectRoot, source);
    return { sourceRoots, testSourceRoots: relativePaths(context.projectRoot, tests),
      sourcePaths: await javaSourcePaths(context.projectRoot, sourceRoots), outputRoots: outputs,
      compileClasspath: [context.classesDir, ...compile.filter((path) => !outputSet.has(path))],
      runtimeClasspath: [context.classesDir, ...runtime.filter((path) => !outputSet.has(path))],
      dependencies, rawOutput: run.output };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

function classpathPaths(paths) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string' || !path.startsWith('/'))) {
    throw new BuildFailure('model_export_invalid', 'Gradle exported an invalid classpath');
  }
  return unique(paths);
}

export async function buildGradle(context, model) {
  const tool = await context.findTool('gradle');
  const run = await checkedTool(tool.command, [...tool.prefix, '--no-daemon', '--console=plain', 'classes'], {
    cwd: context.projectRoot, env: { ...process.env, JAVA_HOME: context.jdk.home }, timeoutMs: 120000,
  });
  await stageOutputs(context.projectRoot, context.classesDir, model.outputRoots);
  return { rawOutput: run.output, elapsedMs: run.elapsedMs };
}
