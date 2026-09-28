import { createHash } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const posix = (path) => path.split(sep).join('/');

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function walk(root, suffix, excluded) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compare(a.name, b.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (path === excluded) continue;
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link in source manifest input: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(path);
    }
  }
  await visit(root);
  return files;
}

function javaPackage(content) {
  // Mask comments and literals so their text cannot impersonate a package declaration.
  const masked = content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
  // Package annotations may precede the declaration. A valid javac input has at most one.
  const match = /\bpackage\s+([\p{L}_$][\p{L}\p{N}_$]*(?:\s*\.\s*[\p{L}_$][\p{L}\p{N}_$]*)*)\s*;/u.exec(masked);
  return match ? match[1].replace(/\s/g, '') : '';
}

function modifiedUtf8(bytes, start, length) {
  const units = [];
  const end = start + length;
  for (let at = start; at < end;) {
    const first = bytes[at++];
    if (first > 0 && first < 0x80) units.push(first);
    else if ((first & 0xe0) === 0xc0 && at < end) {
      const second = bytes[at++];
      if ((second & 0xc0) !== 0x80) throw new Error('Invalid modified UTF-8');
      units.push(((first & 0x1f) << 6) | (second & 0x3f));
    } else if ((first & 0xf0) === 0xe0 && at + 1 < end) {
      const second = bytes[at++];
      const third = bytes[at++];
      if ((second & 0xc0) !== 0x80 || (third & 0xc0) !== 0x80) throw new Error('Invalid modified UTF-8');
      units.push(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
    } else throw new Error('Invalid modified UTF-8');
  }
  return String.fromCharCode(...units);
}

function classMetadata(bytes) {
  let at = 0;
  const need = (length) => {
    if (at + length > bytes.length) throw new Error('Truncated class file');
  };
  const u1 = () => { need(1); return bytes[at++]; };
  const u2 = () => { need(2); const value = bytes.readUInt16BE(at); at += 2; return value; };
  const u4 = () => { need(4); const value = bytes.readUInt32BE(at); at += 4; return value; };
  const skip = (length) => { need(length); at += length; };
  if (u4() !== 0xcafebabe) throw new Error('Invalid class file magic');
  skip(4); // versions
  const pool = new Array(u2());
  for (let i = 1; i < pool.length; i++) {
    const tag = u1();
    if (tag === 1) { const length = u2(); need(length); pool[i] = modifiedUtf8(bytes, at, length); skip(length); }
    else if (tag === 7) pool[i] = { name: u2() };
    else if ([3, 4, 9, 10, 11, 12, 17, 18].includes(tag)) skip(4);
    else if (tag === 5 || tag === 6) { skip(8); i++; }
    else if ([8, 16, 19, 20].includes(tag)) skip(2);
    else if (tag === 15) skip(3);
    else throw new Error(`Unsupported class constant tag ${tag}`);
  }
  skip(2); // access flags
  const self = pool[u2()];
  const internalName = self && pool[self.name];
  if (typeof internalName !== 'string' || !internalName) throw new Error('Class name is missing');
  skip(2); // super class
  const interfaces = u2(); skip(2 * interfaces);
  function skipMembers() {
    const count = u2();
    for (let i = 0; i < count; i++) {
      skip(6); // flags, name and descriptor
      const attributes = u2();
      for (let j = 0; j < attributes; j++) { skip(2); skip(u4()); }
    }
  }
  skipMembers(); // fields
  skipMembers(); // methods
  let sourceFile = null;
  const attributes = u2();
  for (let i = 0; i < attributes; i++) {
    const name = pool[u2()];
    const length = u4();
    if (name === 'SourceFile') {
      if (length !== 2 || sourceFile !== null) throw new Error('Invalid SourceFile attribute');
      sourceFile = pool[u2()];
      if (typeof sourceFile !== 'string') throw new Error('Invalid SourceFile index');
    } else skip(length);
  }
  if (at !== bytes.length) throw new Error('Trailing class-file data');
  return { className: internalName.replaceAll('/', '.'), sourceFile };
}

/**
 * Build a deterministic manifest for a freshly compiled project. `sourcePaths`, when supplied,
 * are project-relative POSIX Java paths from the compile input; otherwise the project is scanned.
 * `sources` are `{fileId,name,content,sha256}`; project `fileId,name,content` into TraceDocument
 * sourceFiles (`fileId` is the actual relative path). `classes` records
 * `{className,sourceFile,fileId,sourceSha256,status,candidates}`.
 * Only a unique package + SourceFile match is resolved; callers must report every other status.
 */
export async function buildInstrumentationSourceManifest(projectRoot, classesDir, sourcePaths) {
  const root = await realpath(projectRoot);
  const classesRoot = await realpath(classesDir);
  if (root === classesRoot) throw new Error('Classes directory cannot be the project root');
  const paths = sourcePaths === undefined
    ? await walk(root, '.java', inside(root, classesRoot) ? classesRoot : null)
    : await Promise.all(sourcePaths.map(async (fileId) => {
      if (typeof fileId !== 'string' || !fileId.endsWith('.java') || fileId.includes('\\') || fileId.startsWith('/') || fileId.split('/').some((part) => !part || part === '.' || part === '..')) {
        throw new Error(`Invalid project-relative Java path: ${fileId}`);
      }
      const path = resolve(root, fileId);
      if (!inside(root, path)) throw new Error(`Java path escapes project: ${fileId}`);
      const actual = await realpath(path);
      if (!inside(root, actual)) throw new Error(`Java path resolves outside project: ${fileId}`);
      if (actual !== path) throw new Error(`Symbolic link in source manifest input: ${fileId}`);
      return path;
    }));
  const sources = [];
  const sourcePackages = new Map();
  const seenPaths = new Set();
  for (const path of paths.sort((a, b) => compare(posix(relative(root, a)), posix(relative(root, b))))) {
    const fileId = posix(relative(root, path));
    if (seenPaths.has(fileId)) throw new Error(`Duplicate source path: ${fileId}`);
    seenPaths.add(fileId);
    const bytes = await readFile(path);
    const content = bytes.toString('utf8');
    sources.push({ fileId, name: fileId.split('/').at(-1), content, sha256: createHash('sha256').update(bytes).digest('hex') });
    sourcePackages.set(fileId, javaPackage(content));
  }

  const classes = [];
  const seenClasses = new Set();
  for (const path of await walk(classesRoot, '.class')) {
    let metadata;
    try { metadata = classMetadata(await readFile(path)); }
    catch (error) { throw new Error(`Cannot read compiled class ${posix(relative(classesRoot, path))}: ${error.message}`, { cause: error }); }
    const { className, sourceFile } = metadata;
    if (posix(relative(classesRoot, path)) !== `${className.replaceAll('.', '/')}.class`) {
      throw new Error(`Compiled class path disagrees with metadata: ${posix(relative(classesRoot, path))}`);
    }
    if (seenClasses.has(className)) throw new Error(`Duplicate compiled class: ${className}`);
    seenClasses.add(className);
    const packageName = className.includes('.') ? className.slice(0, className.lastIndexOf('.')) : '';
    const candidates = sourceFile === null ? [] : sources
      .filter((source) => source.name === sourceFile && sourcePackages.get(source.fileId) === packageName)
      .map((source) => source.fileId);
    const status = sourceFile === null ? 'missing_source_file' : candidates.length === 1 ? 'resolved' : candidates.length ? 'ambiguous' : 'not_found';
    const source = status === 'resolved' ? sources.find((item) => item.fileId === candidates[0]) : null;
    classes.push({ className, sourceFile, fileId: source?.fileId ?? null, sourceSha256: source?.sha256 ?? null, status, candidates });
  }
  classes.sort((a, b) => compare(a.className, b.className));
  return { sources, classes };
}

/** Lookup by binary class name, including `Outer$Inner`; null means the class is not in this project manifest. */
export function resolveInstrumentationSource(manifest, className) {
  return manifest.classes.find((entry) => entry.className === className) ?? null;
}
