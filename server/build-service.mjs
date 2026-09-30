import { createHash } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseJavacDiagnostics, scanCompiledMainClasses } from './compiler.mjs';
import { exists, findTool, posix, walkFiles } from './build/files.mjs';
import { BuildFailure } from './build/process.mjs';
import { resolvePlain, buildPlain } from './build/plain.mjs';
import { resolveMaven, buildMaven } from './build/maven.mjs';
import { resolveGradle, buildGradle } from './build/gradle.mjs';

const provider = {
  plain: { resolve: resolvePlain, build: buildPlain },
  maven: { resolve: resolveMaven, build: buildMaven },
  gradle: { resolve: resolveGradle, build: buildGradle },
};
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function failedDiagnostic(error) {
  if (error instanceof BuildFailure) {
    if (error.code === 'tool_unavailable' || error.code === 'wrapper_incomplete') return error.message;
    const messages = {
      dependency_resolution_failed: 'Dependency resolution failed. See build output.',
      offline_cache_miss: 'Required dependencies are not cached for offline use.',
      incompatible_build_jdk: 'The project build is incompatible with the selected JDK.',
      unsupported_project_model: 'This project shape is not supported by the current Java build provider.',
      model_export_invalid: 'The build tool returned an invalid Java project model.',
      output_collision: 'Production outputs contain colliding files.',
      build_tool_failed: 'The build tool failed. See build output.',
      timeout: 'The build tool exceeded its time limit.',
      output_limit: 'The build tool exceeded its output limit.',
    };
    return messages[error.code] ?? error.code;
  }
  return 'Unable to resolve Java project. See build output.';
}

/** Single derived project contract for plain, Maven and Gradle Java projects. */
export class BuildService {
  constructor({ workspaceRoot, projects, getJdk }) {
    if (!workspaceRoot || !projects?.getProjectRoot || typeof getJdk !== 'function') throw new TypeError('BuildService requires workspaceRoot, projects and getJdk');
    this.workspaceRoot = resolve(workspaceRoot);
    this.projects = projects;
    this.getJdk = getJdk;
    this.models = new Map();
    this.pending = new Map();
  }

  async resolve(projectId, { refresh = false } = {}) {
    if (this.pending.has(projectId)) return this.pending.get(projectId);
    const pending = this.#resolve(projectId, refresh);
    this.pending.set(projectId, pending);
    try { return await pending; } finally { if (this.pending.get(projectId) === pending) this.pending.delete(projectId); }
  }

  async #resolve(projectId, refresh) {
    const started = performance.now();
    const projectRoot = await this.projects.getProjectRoot(projectId);
    const classesDir = join(this.workspaceRoot, 'build', projectId, 'classes');
    const jdk = await this.getJdk();
    const inputs = await walkFiles(projectRoot, { skip: new Set(['.git', '.gradle', '.ggjavaez', 'build', 'target', 'node_modules']) });
    const fingerprint = hash([jdk?.home, jdk?.version, await Promise.all(inputs.map(async (path) => {
      const info = await stat(path);
      return [posix(relative(projectRoot, path)), info.size, info.mtimeMs];
    }))]);
    // A build is an explicit refresh boundary. This matters after a transient
    // filesystem/tool failure: a cached failed model must not poison later Run
    // or Build attempts for an otherwise valid project.
    if (!refresh && this.models.get(projectId)?.fingerprint === fingerprint) return this.models.get(projectId);
    const maven = await exists(join(projectRoot, 'pom.xml'));
    const gradle = await Promise.all(['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradlew', 'gradlew.bat']
      .map((name) => exists(join(projectRoot, name))));
    const buildSystem = maven ? 'maven' : gradle.some(Boolean) ? 'gradle' : 'plain';
    const context = { projectId, projectRoot, classesDir, workspaceRoot: this.workspaceRoot, jdk,
      findTool: (kind) => findTool(kind, projectRoot, this.workspaceRoot) };
    let project;
    try {
      if (maven && gradle.some(Boolean)) throw new BuildFailure('unsupported_project_model', 'Both Maven and Gradle descriptors are present; choose one build system');
      if (!jdk?.available) throw new BuildFailure('jdk_unavailable', jdk?.error || 'A complete JDK is required');
      const model = await provider[buildSystem].resolve(context);
      project = { projectId, projectRoot, classesDir, fingerprint, revision: hash([fingerprint, buildSystem, model.sourceRoots, model.testSourceRoots,
        model.sourcePaths, model.outputRoots, model.compileClasspath, model.runtimeClasspath]),
      buildSystem, status: 'ready', diagnostic: null, ...model, jdk, runnableTargets: [], elapsedMs: Math.round(performance.now() - started) };
    } catch (error) {
      project = { projectId, projectRoot, classesDir, fingerprint, revision: hash([fingerprint, buildSystem, failedDiagnostic(error)]), buildSystem,
        status: 'failed', diagnostic: failedDiagnostic(error), sourceRoots: [], testSourceRoots: [], sourcePaths: [], outputRoots: [],
        compileClasspath: [], runtimeClasspath: [], dependencies: [], jdk, runnableTargets: [],
        elapsedMs: Math.round(performance.now() - started), rawOutput: error.rawOutput ?? '' };
    }
    this.models.set(projectId, project);
    return project;
  }

  async build(projectId, { debug = false } = {}) {
    const started = performance.now();
    const model = await this.resolve(projectId, { refresh: true });
    const result = (success, rawOutput, diagnostics = [], mainClasses = [], project = model) => ({ success, diagnostics, rawOutput,
      elapsedMs: Math.round(performance.now() - started), jdk: model.jdk, mainClasses, project });
    if (model.status !== 'ready') return result(false, model.rawOutput || model.diagnostic,
      [{ id: 'build-project', location: { path: '', line: 0, column: null }, severity: 'error', message: model.diagnostic, raw: model.rawOutput || model.diagnostic }]);
    const context = { projectId, projectRoot: model.projectRoot, classesDir: model.classesDir,
      workspaceRoot: this.workspaceRoot, jdk: model.jdk,
      findTool: (kind) => findTool(kind, model.projectRoot, this.workspaceRoot) };
    try {
      await mkdir(join(this.workspaceRoot, 'build', projectId), { recursive: true });
      const built = await provider[model.buildSystem].build(context, model, { debug });
      if (model.buildSystem === 'plain' && !built.success) return result(false, built.rawOutput, built.diagnostics);
      const mainClasses = model.buildSystem === 'plain' ? built.mainClasses : await scanCompiledMainClasses(model.classesDir);
      const project = { ...model, runnableTargets: mainClasses, rawOutput: built.rawOutput };
      this.models.set(projectId, project);
      return result(true, built.rawOutput, built.diagnostics ?? parseJavacDiagnostics(built.rawOutput, model.projectRoot), mainClasses, project);
    } catch (error) {
      const message = failedDiagnostic(error);
      const rawOutput = error.rawOutput || message;
      const project = { ...model, status: 'failed', diagnostic: message, runnableTargets: [], rawOutput };
      this.models.set(projectId, project);
      return result(false, rawOutput, parseJavacDiagnostics(rawOutput, model.projectRoot).length
        ? parseJavacDiagnostics(rawOutput, model.projectRoot)
        : [{ id: 'build-tool', location: { path: '', line: 0, column: null }, severity: 'error', message, raw: rawOutput }], [], project);
    }
  }

  toDTO(project) {
    const root = project.projectRoot;
    return { projectId: project.projectId, revision: project.revision, buildSystem: project.buildSystem,
      status: project.status, diagnostic: project.diagnostic, sourceRoots: [...project.sourceRoots],
      testSourceRoots: [...project.testSourceRoots], outputRoots: project.outputRoots
        .filter((path) => inside(root, path)).map((path) => posix(relative(root, path)) || '.'),
      dependencies: project.dependencies.map(({ name }) => ({ name })), runnableTargets: [...project.runnableTargets],
      elapsedMs: project.elapsedMs };
  }
}
