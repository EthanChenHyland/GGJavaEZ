import { access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, dirname, join, resolve } from 'node:path';
import { platform } from 'node:process';

const executable = (name) => platform === 'win32' ? `${name}.exe` : name;

async function outputOf(command, args) {
  return new Promise((done) => {
    let output = '';
    const child = spawn(command, args, { shell: false, windowsHide: true });
    const cleanup = () => { try { child.kill('SIGKILL'); } catch { /* already exited */ } };
    process.once('exit', cleanup);
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => { clearTimeout(timeout); process.removeListener('exit', cleanup); done({ code: null, output: error.message }); });
    child.on('close', (code) => { clearTimeout(timeout); process.removeListener('exit', cleanup); done({ code, output }); });
  });
}

function versionOf(output) {
  return output.match(/\b(?:javac\s+|(?:openjdk|java)\s+version\s+|(?:openjdk|java)\s+)(?:")?(\d+(?:[._+]\d+)*)/i)?.[1] ?? null;
}

async function validateHome(candidate) {
  const home = await realpath(resolve(candidate));
  const javaPath = join(home, 'bin', executable('java'));
  const javacPath = join(home, 'bin', executable('javac'));
  await Promise.all([access(javaPath, constants.X_OK), access(javacPath, constants.X_OK)]);
  const [realJava, realJavac] = await Promise.all([realpath(javaPath), realpath(javacPath)]);
  if (!realJava.startsWith(`${home}${platform === 'win32' ? '\\' : '/'}`) ||
      !realJavac.startsWith(`${home}${platform === 'win32' ? '\\' : '/'}`) ||
      (platform === 'darwin' && home === '/usr')) {
    throw new Error('java and javac must belong to the same JDK home');
  }
  const [java, javac] = await Promise.all([
    outputOf(javaPath, ['-version']), outputOf(javacPath, ['-version']),
  ]);
  const javaVersion = versionOf(java.output);
  const javacVersion = versionOf(javac.output);
  if (java.code !== 0 || javac.code !== 0 || !javaVersion || javaVersion !== javacVersion) {
    throw new Error(`java and javac in ${home} are unavailable or have different versions`);
  }
  return { available: true, home, javaPath, javacPath, version: javaVersion, error: null };
}

async function commandHome(command) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    try {
      const path = await realpath(join(directory, executable(command)));
      return dirname(dirname(path));
    } catch { /* Search the next PATH entry. */ }
  }
  return null;
}

/** Find a complete JDK. An explicit home is authoritative; autodetection tries coherent homes only. */
export async function detectJdk(home) {
  const candidates = [];
  if (home != null && home !== '') {
    candidates.push(home);
  } else {
    if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
    if (platform === 'darwin') {
      const mac = await outputOf('/usr/libexec/java_home', []);
      if (mac.code === 0) candidates.push(mac.output.trim());
    }
    for (const command of ['javac', 'java']) {
      const pathHome = await commandHome(command);
      if (pathHome) candidates.push(pathHome);
    }
  }
  let error = 'No complete JDK with matching java and javac was found';
  for (const candidate of new Set(candidates.filter(Boolean))) {
    try { return await validateHome(candidate); }
    catch (cause) { error = cause.message; }
  }
  return { available: false, home: null, javaPath: null, javacPath: null, version: null, error };
}
