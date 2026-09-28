/** Parse an uncaught JVM exception from stderr without treating arbitrary output as a trace. */

const EXCEPTION_HEADER = /^Exception in thread "[^"]+" ([\w.$]+)(?:: (.*))?$/
const BARE_HEADER = /^([\w.$]+(?:Exception|Error|Throwable))(?:: (.*))?$/
const FRAME = /^\s+at ([\w.$/]+)\.([^\s(]+)\(([^)]*)\)\s*$/
const TRACE_CONTINUATION = /^\s*(?:Caused by:|Suppressed:|\.\.\. \d+ more|at )/

function sourceLocation(className, fileName, line, sourcePaths) {
  if (!fileName || !line || !sourcePaths?.length) return null
  const packagePath = className.includes('.')
    ? `${className.slice(0, className.lastIndexOf('.')).replaceAll('.', '/')}/${fileName}`
    : fileName
  const matches = sourcePaths.filter((path) => path === packagePath || path.endsWith(`/${packagePath}`))
  if (matches.length !== 1) return null
  return { path: matches[0], line, column: null }
}

/**
 * @param {string} stderr Complete captured stderr text.
 * @param {string[]} sourcePaths Project-relative POSIX Java source paths.
 * @returns {import('../src/ide/contracts.ts').RuntimeException | null}
 */
export function parseRuntimeException(stderr, sourcePaths = []) {
  if (typeof stderr !== 'string' || !stderr) return null
  const lines = stderr.split(/\r?\n/)
  const start = lines.findIndex((line) => EXCEPTION_HEADER.test(line) || BARE_HEADER.test(line))
  if (start < 0) return null

  const header = lines[start].match(EXCEPTION_HEADER) ?? lines[start].match(BARE_HEADER)
  const frames = []
  let end = start + 1
  for (; end < lines.length; end += 1) {
    const raw = lines[end]
    const match = raw.match(FRAME)
    if (match) {
      const className = match[1].replaceAll('/', '.')
      const methodName = match[2]
      const fileMatch = match[3].match(/^([^:]+\.java):(\d+)$/)
      const fileName = fileMatch?.[1] ?? null
      const line = fileMatch ? Number(fileMatch[2]) : null
      frames.push({
        className,
        methodName,
        fileName,
        line,
        location: sourceLocation(className, fileName, line, sourcePaths),
        raw,
      })
      continue
    }
    if (raw === '' && end === lines.length - 1) break
    if (TRACE_CONTINUATION.test(raw) || /^\s+/.test(raw)) continue
    break
  }

  return {
    type: header[1],
    message: header[2] ?? '',
    rawStackTrace: lines.slice(start, end).join('\n'),
    frames,
  }
}
