#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VERSION = '1.61.0'
export const ARCHIVE = 'jdt-language-server-1.61.0-202609031315.tar.gz'
export const SHA256 = '338e7e73d61836651ba2453919a0d34fa763eb4e7c03342092309bffb8934c64'
export const SOURCE_URL = `https://github.com/eclipse-jdtls/eclipse.jdt.ls/tree/v${VERSION}`
export const ARCHIVE_URL = `https://download.eclipse.org/jdtls/milestones/${VERSION}/${ARCHIVE}`
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))

function run(command, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], ...options })
    let output = ''
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      output += chunk.toString('utf8')
      if (output.length > 1024 * 1024) child.kill('SIGKILL')
    })
    child.on('error', fail)
    child.on('close', code => code === 0 ? done(output) : fail(new Error(`${command} failed: ${output.slice(-2000)}`)))
  })
}

export async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function validateArchive(path) {
  if (await digest(path) !== SHA256) throw new Error(`JDT LS archive SHA-256 mismatch; expected ${SHA256}`)
  const listing = await run('tar', ['-tzf', path])
  for (const name of listing.split('\n').filter(Boolean)) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some(part => part === '..')) {
      throw new Error('JDT LS archive contains an unsafe path')
    }
  }
  const verbose = await run('tar', ['-tvzf', path])
  for (const entry of verbose.split('\n').filter(Boolean)) {
    if ('lh'.includes(entry[0])) throw new Error('JDT LS archive links are unsupported by safe setup')
  }
}

export async function findDistribution(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const candidates = [root, ...entries.filter(item => item.isDirectory()).map(item => join(root, item.name))]
  for (const candidate of candidates) {
    const launcher = (await readdir(join(candidate, 'plugins')).catch(() => []))
      .filter(name => /^org\.eclipse\.equinox\.launcher_.*\.jar$/.test(name))
    if (launcher.length !== 1) continue
    if (!(await stat(join(candidate, 'config_linux')).catch(() => null)) &&
        !(await stat(join(candidate, 'config_mac')).catch(() => null))) continue
    return candidate
  }
  throw new Error('Archive does not contain one complete JDT LS distribution')
}

export async function install({ workspaceRoot = join(repo, '.ggjavaez'), archivePath, download = false } = {}) {
  const workspace = resolve(workspaceRoot)
  const toolsDir = join(workspace, 'tools', 'jdtls')
  const destination = join(toolsDir, VERSION)
  await mkdir(toolsDir, { recursive: true })
  let temporaryArchive = null
  if (!archivePath) {
    if (!download) throw new Error(`Pass --archive /path/to/${ARCHIVE} for offline setup, or --download for explicit network setup`)
    temporaryArchive = join(await mkdtemp(join(toolsDir, '.download-')), ARCHIVE)
    const response = await fetch(ARCHIVE_URL, { signal: AbortSignal.timeout(120000) })
    if (!response.ok || !response.body) throw new Error(`JDT LS download failed: HTTP ${response.status}`)
    const { createWriteStream } = await import('node:fs')
    const { pipeline } = await import('node:stream/promises')
    await pipeline(response.body, createWriteStream(temporaryArchive))
    archivePath = temporaryArchive
  }
  let stage
  try {
    await validateArchive(resolve(archivePath))
    stage = await mkdtemp(join(toolsDir, '.extract-'))
    await run('tar', ['-xzf', resolve(archivePath), '-C', stage])
    const distribution = await findDistribution(stage)
    const marker = {
      version: VERSION, archive: ARCHIVE, sha256: SHA256,
      archiveUrl: ARCHIVE_URL, sourceUrl: SOURCE_URL,
      installedAt: new Date().toISOString(),
    }
    await writeFile(join(distribution, 'ggjavaez-install.json'), JSON.stringify(marker, null, 2) + '\n')
    const old = `${destination}.previous`
    await rm(old, { recursive: true, force: true })
    if (await stat(destination).catch(() => null)) await rename(destination, old)
    try { await rename(distribution, destination) } catch (error) {
      if (await stat(old).catch(() => null)) await rename(old, destination)
      throw error
    }
    await rm(old, { recursive: true, force: true })
    return destination
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true })
    if (temporaryArchive) await rm(resolve(temporaryArchive, '..'), { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  let archivePath, workspaceRoot, download = false
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--archive') archivePath = args[++index]
    else if (args[index] === '--workspace') workspaceRoot = args[++index]
    else if (args[index] === '--download') download = true
    else throw new Error(`Unknown setup option: ${args[index]}`)
  }
  install({ archivePath, workspaceRoot, download }).then(path => console.log(`Installed JDT LS ${VERSION} at ${path}`), error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
