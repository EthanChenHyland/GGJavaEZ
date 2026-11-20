import type { BuildResult, CompileDiagnostic } from '../../ide/contracts'
import { mergeProblems } from '../../ide/problems'

export function ProblemsDrawer({ build, language = [], onOpen }: { build: BuildResult | null; language?: CompileDiagnostic[]; onOpen: (item: CompileDiagnostic) => void }) {
  const items = mergeProblems(build?.diagnostics ?? [], language)
  return <div className="ide-problems">
    {items.length ? items.map((item) => <div key={`${item.provider}:${item.id}`} className={`ide-problem-entry ide-problem-entry--${item.severity}`}>
      <button className={`ide-problem ide-problem--${item.severity}`} onClick={() => onOpen(item)}>
        <span className="ide-problem-icon" aria-label={item.severity}>{item.severity === 'error' ? '×' : '!'}</span>
        <span><strong>{item.message}</strong><small>{item.severity} · {item.location.path || 'build'}{item.location.line ? `:${item.location.line}` : ''}{item.location.column ? `:${item.location.column}` : ''} · {item.provider === 'language' ? 'Java language service' : 'Compiler'}</small></span>
      </button>
      <details><summary>{item.provider === 'language' ? 'Language diagnostic' : 'Exact compiler output'}</summary><pre>{item.raw}</pre></details>
    </div>) : <p className="ide-empty">{build?.success ? 'No compiler problems.' : build?.rawOutput || 'Build the project to see compiler diagnostics.'}</p>}
  </div>
}
