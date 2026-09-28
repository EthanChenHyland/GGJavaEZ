import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const children = [
  spawn(process.execPath, ['server/bridge.mjs'], { cwd: root, stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env: process.env }),
]
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300).unref()
}
for (const child of children) child.on('exit', (code) => stop(code || 0))
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
