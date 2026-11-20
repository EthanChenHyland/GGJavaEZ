import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, extname, isAbsolute } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

// Read built bytes, rather than a size estimate or the development server.
// Requirement 32.7 limits the main entry chunk; dependency closures are reported
// separately and never relabelled as the entry chunk or given a new budget.
const root = resolve(process.argv[2] ?? 'dist');
const output = resolve(process.argv[3] ?? '.ggjavaez/qa/reference-exact/production-build.json');
const inside = path => { const name = relative(root, path); if (name.startsWith('..') || isAbsolute(name)) throw new Error(`Build path escapes output: ${path}`); return path; };
const files = new Map();
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extname(path) === '.js') {
      const bytes = await readFile(path), source = ts.createSourceFile(path, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const imports = new Set(), dynamicImports = new Set();
      const target = specifier => specifier.startsWith('.') ? relative(root, inside(resolve(dirname(path), specifier))).split('\\').join('/') : null;
      function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
          const name = target(node.moduleSpecifier.text); if (name) imports.add(name);
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
          const name = target(node.arguments[0].text); if (name) dynamicImports.add(name);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      files.set(relative(root, path).split('\\').join('/'), { bytes: bytes.length, gzipBytes: gzipSync(bytes).length,
        sha256: createHash('sha256').update(bytes).digest('hex'), imports: [...imports], dynamicImports: [...dynamicImports] });
    }
  }
}
await walk(root);
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const entries = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => relative(root, inside(resolve(root, match[1].replace(/^\//, '')))).split('\\').join('/'));
if (!entries.length || entries.some(entry => !files.has(entry))) throw new Error('Built HTML has no resolvable main module chunk');
function closure(seeds) {
  const pending = [...seeds], seen = new Set();
  while (pending.length) {
    const name = pending.pop(); if (seen.has(name)) continue;
    const file = files.get(name); if (!file) throw new Error(`Missing built JS dependency: ${name}`);
    seen.add(name); pending.push(...file.imports);
  }
  return { files: [...seen].sort(), gzipBytes: [...seen].reduce((sum, name) => sum + files.get(name).gzipBytes, 0),
    boundary: 'Sum of separately gzipped static JS resources; CSS, fonts, workers and dynamic imports excluded; not actual network timing' };
}
const entryClosure = closure(entries);
const shellChunks = [...files.keys()].filter(name => /(?:^|\/)AppRoot-[^/]+\.js$/.test(name));
const monaco = [...files.keys()].filter(name => /(?:monacoSetup|editor\.api)-[^/]+\.js$/.test(name));
const cinematic = [...files.keys()].filter(name => /cinematicPasses-[^/]+\.js$/.test(name));
const checks = {
  mainEntryGzip: { requirement: '32.7', budgetBytes: 500_000, measured: entries.map(file => ({ file, gzipBytes: files.get(file).gzipBytes })),
    pass: entries.every(file => files.get(file).gzipBytes <= 500_000) },
  monacoSeparate: { requirement: '32.7', chunks: monaco, pass: monaco.length > 0 && monaco.every(file => !entryClosure.files.includes(file)) },
  cinematicPassesSeparate: { requirement: '32.7', chunks: cinematic, pass: cinematic.length > 0 && cinematic.every(file => !entryClosure.files.includes(file)) },
};
const report = { recordedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  trackedChanges: execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  method: 'Actual production artifacts; gzipSync default compression; decimal kB; SHA-256 of every JS resource', entries, checks,
  entryStaticClosure: entryClosure, applicationShellStaticClosure: closure([...entries, ...shellChunks]),
  resources: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b))),
  dynamicRequestPolicy: 'Monaco/Interactive/Cinematic network timing is a separate native-browser gate; chunk separation alone does not prove request policy',
  pass: Object.values(checks).every(check => check.pass) };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.info(JSON.stringify({ output: relative(process.cwd(), output), entries, checks, entryStaticClosure: { files: entryClosure.files, gzipBytes: entryClosure.gzipBytes },
  applicationShellStaticClosureGzipBytes: report.applicationShellStaticClosure.gzipBytes, pass: report.pass }));
if (!report.pass) process.exitCode = 1;
