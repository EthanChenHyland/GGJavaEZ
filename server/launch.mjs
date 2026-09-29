import { lstat } from 'node:fs/promises'
import { delimiter, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'

const fail = (message, status = 400) => Object.assign(new Error(message), { status, statusCode: status })
const binaryName = /^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u
const MAX_ARGUMENT_BYTES = 65536

function argumentsArray(value, name) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 1024 || value.some((arg) => typeof arg !== 'string' || arg.includes('\0'))
    || Buffer.byteLength(value.join('\0')) > MAX_ARGUMENT_BYTES) throw fail(`${name} must be an array of strings under 64 KiB`)
  return [...value]
}

/** Restrained, single-token JVM options; launch controls and recorder properties belong to the server. */
export function validateJvmArgs(value) {
  const args = argumentsArray(value, 'jvmArgs')
  for (const arg of args) {
    if (/^-D/.test(arg)) {
      const property = arg.slice(2).split('=', 1)[0]
      if (!property || /\s/.test(property) || /^(visualjava(?:\.|$)|java\.class\.path$|java\.system\.class\.loader$|sun\.boot\.class\.path$|jdk\.module(?:\.|$))/i.test(property)) {
        throw fail(`JVM property is reserved or invalid: ${property}`)
      }
      continue
    }
    // Options which take a separate operand are intentionally excluded: an operand
    // could become a competing main class, module, classpath or @argument file.
    if (/^-X(?:ms|mx|ss)\d+[kKmMgGtT]?$/.test(arg)
      || /^-(?:ea|da|enableassertions|disableassertions)(?::[\p{L}\p{N}_$.]+)?$/u.test(arg)
      || ['-esa', '-dsa', '-enablesystemassertions', '-disablesystemassertions', '--enable-preview'].includes(arg)
      || /^-XX:(?:[+-][A-Za-z][A-Za-z0-9]*|[A-Za-z][A-Za-z0-9]*=[^\r\n]+)$/.test(arg)
        && !/^-XX:(?:[+-])?(?:BytecodeVerification|SharedArchiveFile|ArchiveClassesAtExit)/.test(arg)) continue
    throw fail(`JVM argument is not a supported user option: ${arg}`)
  }
  return args
}

function relativeDirectory(value) {
  if (value === undefined) return '.'
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\')
    || isAbsolute(value) || win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)
    || value.split('/').some((part) => part === '..')) throw fail('workingDirectory must be a relative directory inside the project')
  return value
}

/** Validate against confirmed compiled targets. No filesystem work or fallback for an explicit invalid main. */
export function validateLaunch(project, configuration = {}) {
  if (!project || project.status !== 'ready') throw fail(project?.diagnostic || 'Java project is not ready for launch', 409)
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw fail('Expected a launch configuration object')
  if (['classpath', 'module', 'modulePath', 'agent', 'javaPath'].some((key) => Object.hasOwn(configuration, key))) {
    throw fail('Classpath, module, agent and executable settings are server-owned')
  }
  const requested = configuration.mainClass
  if (requested !== undefined && (typeof requested !== 'string' || requested && !binaryName.test(requested))) throw fail('mainClass must be a binary Java class name')
  const targets = project.runnableTargets
  if (!Array.isArray(targets) || targets.some((target) => typeof target !== 'string' || !binaryName.test(target))) throw fail('Java project has no confirmed runnable target model', 409)
  if (requested && !targets.includes(requested)) throw fail(`Main class is not a confirmed runnable target: ${requested}`)
  return {
    mainClass: requested || targets[0] || null,
    workingDirectory: relativeDirectory(configuration.workingDirectory),
    programArgs: argumentsArray(configuration.programArgs, 'programArgs'),
    jvmArgs: validateJvmArgs(configuration.jvmArgs),
  }
}

/** Trusted project output first; preserve dependency ordering and never split a caller's strings. */
export function launchClasspath(classesDir, classpath) {
  const entries = classpath === undefined ? [] : argumentsArray(classpath, 'classpath')
  if (typeof classesDir !== 'string' || !isAbsolute(classesDir) || !classesDir || classesDir.includes('\0')) throw fail('classesDir must be absolute')
  const paths = [classesDir, ...entries]
  if (paths.some((entry) => !entry || !isAbsolute(entry) || entry.includes(delimiter) || entry.includes('*'))) {
    throw fail('Classpath entries must be individual absolute paths without wildcards or classpath separators')
  }
  return [classesDir, ...entries.filter((entry) => resolve(entry) !== resolve(classesDir))]
}

function contained(root, path) {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/** Root bridge injects projectRoot into the server JavaProject before resolving. */
export async function resolveLaunch(project, configuration = {}) {
  const validated = validateLaunch(project, configuration)
  if (typeof project.projectRoot !== 'string' || !isAbsolute(project.projectRoot) || project.projectRoot.includes('\0')) throw fail('projectRoot must be absolute')
  const root = resolve(project.projectRoot)
  const workingDirectory = resolve(root, validated.workingDirectory)
  if (!contained(root, workingDirectory)) throw fail('workingDirectory escapes the project')
  const directories = [root]
  let current = root
  for (const component of relative(root, workingDirectory).split(sep).filter(Boolean)) {
    current = join(current, component)
    directories.push(current)
  }
  for (const directory of directories) {
    let info
    try { info = await lstat(directory) } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw fail('workingDirectory must be an existing project directory')
      throw error
    }
    if (info.isSymbolicLink()) throw fail('workingDirectory cannot traverse symbolic links')
    if (!info.isDirectory()) throw fail('workingDirectory must be a directory')
  }
  return { ...validated, workingDirectory, classpath: launchClasspath(project.classesDir, project.runtimeClasspath) }
}

/** Requests already resolved by the bridge; also keeps the pre-M9 direct server defaults. */
export function launchRequest(request) {
  if (typeof request.mainClass !== 'string' || !binaryName.test(request.mainClass)) throw fail('mainClass must be a binary Java class name')
  const workingDirectory = request.workingDirectory ?? request.projectRoot ?? request.classesDir
  if (typeof workingDirectory !== 'string' || !isAbsolute(workingDirectory) || workingDirectory.includes('\0')) throw fail('Resolved workingDirectory must be absolute')
  if (request.projectRoot && !contained(resolve(request.projectRoot), resolve(workingDirectory))) throw fail('workingDirectory escapes the project')
  return { mainClass: request.mainClass, workingDirectory,
    classpath: launchClasspath(request.classesDir, request.classpath),
    programArgs: argumentsArray(request.programArgs, 'programArgs'), jvmArgs: validateJvmArgs(request.jvmArgs) }
}

/** Required JVM controls follow user options and precede the single server-owned launch target. */
export function javaLaunchArgs(launch, internalJvmArgs = []) {
  return [...validateJvmArgs(launch.jvmArgs), ...internalJvmArgs, '-cp', launch.classpath.join(delimiter), launch.mainClass, ...launch.programArgs]
}
