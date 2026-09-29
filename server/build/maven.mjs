import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { BuildFailure, checkedTool } from './process.mjs';
import { dependenciesFromPaths, javaSourcePaths, parseClasspath, posix, projectPath, stageOutputs, unique } from './files.mjs';

// Maven produces the effective model; XML parsing only selects its resolved paths.
export function parseEffectivePom(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new BuildFailure('model_export_invalid', 'Maven produced invalid or unsafe effective POM XML');
  }
  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, trimValues: true, processEntities: false }).parse(xml);
  if (!parsed.project || typeof parsed.project !== 'object') throw new BuildFailure('model_export_invalid', 'Maven effective POM has no project');
  return parsed.project;
}
const scalar = (value) => typeof value === 'string' ? value : value == null ? '' : String(value);
async function roots(projectRoot, values) {
  const result = [];
  for (const value of values) {
    const path = await projectPath(projectRoot, value);
    result.push(posix(relative(projectRoot, path)) || '.');
  }
  return unique(result);
}

export async function resolveMaven(context) {
  const tool = await context.findTool('maven');
  const temporary = await mkdtemp(join(tmpdir(), 'ggjava-maven-'));
  const run = (args) => checkedTool(tool.command, [...tool.prefix, '-B', '-ntp', ...args], {
    cwd: context.projectRoot, env: { ...process.env, JAVA_HOME: context.jdk.home }, timeoutMs: 120000,
  });
  try {
    const effective = join(temporary, 'effective.xml');
    const classpathFile = join(temporary, 'classpath.txt');
    const modelRun = await run(['org.apache.maven.plugins:maven-help-plugin:3.5.1:effective-pom', `-Doutput=${effective}`]);
    const pom = parseEffectivePom(await readFile(effective, 'utf8'));
    if (pom.modules?.module && (Array.isArray(pom.modules.module) ? pom.modules.module.length : 1)) {
      throw new BuildFailure('unsupported_project_model', 'Maven multi-module reactors are not supported in M9', modelRun.output);
    }
    const packaging = scalar(pom.packaging) || 'jar';
    if (!['jar', 'war'].includes(packaging)) throw new BuildFailure('unsupported_project_model', `Maven packaging ${packaging} is not supported in M9`);
    const build = pom.build ?? {};
    const sourceRoots = await roots(context.projectRoot, [scalar(build.sourceDirectory) || join(context.projectRoot, 'src/main/java')]);
    const testSourceRoots = await roots(context.projectRoot, [scalar(build.testSourceDirectory) || join(context.projectRoot, 'src/test/java')]);
    const outputRoots = [await projectPath(context.projectRoot, scalar(build.outputDirectory) || 'target/classes', { output: true })];
    const dependencyRun = await run(['org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath', '-DincludeScope=runtime', `-Dmdep.outputFile=${classpathFile}`]);
    const runtimePaths = parseClasspath(await readFile(classpathFile, 'utf8'));
    const compileRun = await run(['org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath', '-DincludeScope=compile', `-Dmdep.outputFile=${classpathFile}`]);
    const compilePaths = parseClasspath(await readFile(classpathFile, 'utf8'));
    const dependencies = await dependenciesFromPaths(unique([...compilePaths, ...runtimePaths]));
    const sourcePaths = await javaSourcePaths(context.projectRoot, sourceRoots);
    return { sourceRoots, testSourceRoots, sourcePaths, outputRoots: unique(outputRoots),
      compileClasspath: [context.classesDir, ...compilePaths], runtimeClasspath: [context.classesDir, ...runtimePaths], dependencies,
      rawOutput: `${modelRun.output}\n${dependencyRun.output}\n${compileRun.output}`.trim() };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function buildMaven(context, model) {
  const tool = await context.findTool('maven');
  const run = await checkedTool(tool.command, [...tool.prefix, '-B', '-ntp', '-Dmaven.test.skip=true', 'compile'], {
    cwd: context.projectRoot, env: { ...process.env, JAVA_HOME: context.jdk.home }, timeoutMs: 120000,
  });
  await stageOutputs(context.projectRoot, context.classesDir, model.outputRoots);
  return { rawOutput: run.output, elapsedMs: run.elapsedMs };
}
