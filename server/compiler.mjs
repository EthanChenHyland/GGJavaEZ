import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { delimiter, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { performance } from 'node:perf_hooks';
import { detectJdk } from './jdk.mjs';

const diagnosticHeader = /^(.*\.java):(\d+):(?:(\d+):)?\s*(error|warning|note):\s*(.*)$/i;

function projectPath(path, projectRoot) {
  const absolute = resolve(projectRoot, path);
  const rel = relative(resolve(projectRoot), absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) ||
      win32.isAbsolute(path) && !isAbsolute(path) && process.platform !== 'win32') return '';
  return rel.split(sep).join('/');
}

/** Parse human-readable javac output, retaining complete raw diagnostic blocks. */
export function parseJavacDiagnostics(output, projectRoot) {
  const lines = output.replace(/\r\n?/g, '\n').split('\n');
  const diagnostics = [];
  let current = null;
  const finish = () => {
    if (!current) return;
    while (current.lines.at(-1) === '') current.lines.pop();
    const caret = current.lines.find((line) => /^\s*\^/.test(line));
    const location = { path: current.path, line: current.line, column: current.column ?? (caret ? caret.indexOf('^') + 1 : null) };
    const caretIndex = current.lines.findIndex((line) => /^\s*\^/.test(line));
    const details = current.lines.slice(caretIndex < 0 ? 1 : caretIndex + 1).filter((line) => line.trim());
    diagnostics.push({ id: `javac-${diagnostics.length + 1}`, location, severity: current.severity,
      message: [current.message, ...details.map((line) => line.trim())].join('\n'), raw: current.lines.join('\n') });
    current = null;
  };
  for (const line of lines) {
    const match = line.match(diagnosticHeader);
    const general = !match && /^(error|warning|note):\s*(.*)$/i.exec(line);
    if (match || general) {
      finish();
      current = match
        ? { path: projectPath(match[1], projectRoot), line: Number(match[2]), column: match[3] ? Number(match[3]) : null,
          severity: match[4].toLowerCase(), message: match[5], lines: [line] }
        : { path: '', line: 0, column: null, severity: general[1].toLowerCase(), message: general[2], lines: [line] };
    } else if (current && !/^\d+ (?:error|warning|errors|warnings)$/.test(line)) {
      current.lines.push(line);
    }
  }
  finish();
  return diagnostics;
}

async function javaFiles(root, buildDir) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      // A managed build directory can live beneath the project in tests or imports.
      if (path === buildDir) continue;
      if (entry.isSymbolicLink()) throw new Error('Project contains a symbolic link');
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.java')) files.push(relative(root, path).split(sep).join('/'));
    }
  }
  await visit(root);
  return files;
}

function runJavac(command, args, cwd) {
  return new Promise((done) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32' });
    const cleanup = () => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* already exited */ }
    };
    process.once('exit', cleanup);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; cleanup(); }, 30000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('exit', cleanup);
    child.on('error', (error) => { clearTimeout(timeout); process.removeListener('exit', cleanup); done({ code: null, output: error.message }); });
    child.on('close', (code) => { clearTimeout(timeout); process.removeListener('exit', cleanup); done({ code, output: [stdout, stderr, timedOut ? '[Bridge] javac exceeded the 30-second compilation limit.' : ''].filter(Boolean).join('\n') }); });
  });
}

function hasMainMethod(bytes) {
  let offset = 8;
  const count = bytes.readUInt16BE(offset); offset += 2;
  const pool = Array(count);
  for (let i = 1; i < count; i++) {
    const tag = bytes[offset++];
    if (tag === 1) { const length = bytes.readUInt16BE(offset); offset += 2; pool[i] = bytes.toString('utf8', offset, offset + length); offset += length; }
    else if (tag === 3 || tag === 4 || tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 17 || tag === 18) offset += 4;
    else if (tag === 5 || tag === 6) { offset += 8; i++; }
    else if (tag === 7 || tag === 8 || tag === 16 || tag === 19 || tag === 20) offset += 2;
    else if (tag === 15) offset += 3;
    else return false;
  }
  offset += 6; // access flags, this class, super class
  const interfaces = bytes.readUInt16BE(offset); offset += 2 + interfaces * 2;
  const skipMember = () => {
    offset += 6;
    const attributes = bytes.readUInt16BE(offset); offset += 2;
    for (let i = 0; i < attributes; i++) { const length = bytes.readUInt32BE(offset + 2); offset += 6 + length; }
  };
  const fields = bytes.readUInt16BE(offset); offset += 2;
  for (let i = 0; i < fields; i++) skipMember();
  const methods = bytes.readUInt16BE(offset); offset += 2;
  for (let i = 0; i < methods; i++) {
    const flags = bytes.readUInt16BE(offset);
    const name = pool[bytes.readUInt16BE(offset + 2)];
    const descriptor = pool[bytes.readUInt16BE(offset + 4)];
    if ((flags & 0x0009) === 0x0009 && name === 'main' && descriptor === '([Ljava/lang/String;)V') return true;
    skipMember();
  }
  return false;
}

export async function scanCompiledMainClasses(buildDir) {
  const classes = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Compiled output contains a symbolic link');
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.class')) {
        const bytes = await readFile(path);
        if (bytes.length >= 10 && bytes.readUInt32BE(0) === 0xcafebabe && hasMainMethod(bytes)) {
          classes.push(relative(buildDir, path).slice(0, -6).split(sep).join('.'));
        }
      }
    }
  }
  await visit(buildDir);
  return classes.sort();
}

/** Compile every project Java source into a freshly recreated classes directory. */
export async function compileProject(projectRoot, buildDir, jdkHome, { debug = false, sourcePaths, classpath = [], jdk: suppliedJdk } = {}) {
  const start = performance.now();
  const root = await realpath(projectRoot);
  const target = resolve(buildDir);
  if (root === target || root.startsWith(`${target}${sep}`)) throw new Error('Build directory must not contain the project');
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const jdk = suppliedJdk ?? await detectJdk(jdkHome);
  const result = (success, rawOutput, diagnostics = [], classes = []) => ({ success, diagnostics, rawOutput,
    elapsedMs: Math.round(performance.now() - start), jdk, mainClasses: classes });
  if (!jdk.available) return result(false, jdk.error);
  const files = sourcePaths === undefined ? await javaFiles(root, target) : await Promise.all(sourcePaths.map(async (file) => {
    if (typeof file !== 'string' || !file.endsWith('.java') || !projectPath(file, root)) throw new Error('Invalid compile source path');
    const actual = await realpath(resolve(root, file));
    if (actual !== resolve(root, file) || !projectPath(actual, root)) throw new Error('Compile source resolves outside project or through a symbolic link');
    return file;
  }));
  if (!files.length) return result(false, 'No Java source files found.');
  const { code, output } = await runJavac(jdk.javacPath, ['-encoding', 'UTF-8', ...(debug ? ['-g:lines,vars,source'] : []), ...(classpath.length ? ['-cp', classpath.join(delimiter)] : []), '-d', target, ...files.map((file) => `.${sep}${file}`)], root);
  if (code !== 0) {
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
  }
  return result(code === 0, output, parseJavacDiagnostics(output, root), code === 0 ? await scanCompiledMainClasses(target) : []);
}
