import type { CompileDiagnostic } from './contracts'

/** Prefer genuine build output when both providers report the same problem. */
export function mergeProblems(compiler: CompileDiagnostic[], language: CompileDiagnostic[]): CompileDiagnostic[] {
  const seen = new Set<string>()
  return [...compiler.map((item) => ({ ...item, provider: 'compiler' as const })), ...language].filter((item) => {
    const key = JSON.stringify([item.location.path, item.location.line, item.location.column, item.severity, item.message.replace(/\s+/g, ' ').trim()])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
