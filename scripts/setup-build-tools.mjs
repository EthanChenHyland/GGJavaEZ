import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rename, rm, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const execute = promisify(execFile);
const workspace = resolve(process.env.GGJAVA_WORKSPACE || '.ggjavaez');
const tools = {
  maven: { version: '3.9.16', archive: 'apache-maven-3.9.16-bin.tar.gz',
    url: 'https://archive.apache.org/dist/maven/maven-3/3.9.16/binaries/apache-maven-3.9.16-bin.tar.gz',
    algorithm: 'sha512', directory: 'apache-maven-3.9.16' },
  gradle: { version: '9.4.1', archive: 'gradle-9.4.1-bin.zip',
    url: 'https://services.gradle.org/distributions/gradle-9.4.1-bin.zip',
    algorithm: 'sha256', directory: 'gradle-9.4.1' },
};

async function download(url, limit) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const bytes = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error(`Download exceeded ${limit} bytes`);
    bytes.push(chunk);
  }
  return Buffer.concat(bytes);
}

async function install(kind) {
  const tool = tools[kind];
  const destination = join(workspace, 'tools', kind);
  try { await access(join(destination, 'bin', kind === 'maven' ? 'mvn' : 'gradle')); console.log(`${kind} already installed at ${destination}`); return; }
  catch { /* continue */ }
  await mkdir(join(workspace, 'tools'), { recursive: true });
  const temporary = await mkdtemp(join(workspace, 'tools', `.setup-${kind}-`));
  try {
    const archive = await download(tool.url, 220 * 1024 * 1024);
    const checksum = (await download(`${tool.url}.${tool.algorithm}`, 4096)).toString('utf8').trim().split(/\s+/)[0].toLowerCase();
    const actual = createHash(tool.algorithm).update(archive).digest('hex');
    if (actual !== checksum) throw new Error(`${kind} archive checksum mismatch`);
    const archivePath = join(temporary, tool.archive);
    await writeFile(archivePath, archive);
    if (kind === 'maven') await execute('tar', ['-xzf', archivePath, '-C', temporary]);
    else await execute('unzip', ['-q', archivePath, '-d', temporary]);
    await writeFile(join(temporary, tool.directory, '.visualjava-download.json'), JSON.stringify({
      version: tool.version, source: tool.url, archiveBytes: archive.length, checksumAlgorithm: tool.algorithm, checksum: actual,
    }, null, 2));
    await rename(join(temporary, tool.directory), destination);
    console.log(`${kind} ${tool.version} installed at ${destination} (${archive.length} bytes, ${tool.algorithm} ${actual})`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

const selected = process.argv.slice(2);
if (selected.length && selected.some((kind) => !Object.hasOwn(tools, kind))) {
  throw new Error('Usage: node scripts/setup-build-tools.mjs [maven] [gradle]');
}
for (const kind of selected.length ? selected : Object.keys(tools)) await install(kind);
