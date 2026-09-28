import type { BuildResult, CompileDiagnostic } from './contracts'

export function ProblemsPanel({ build, onOpen }: { build: BuildResult | null; onOpen: (item: CompileDiagnostic) => void }) {
  return <div className="ide-problems">
    {build?.diagnostics.length ? build.diagnostics.map((item) => <div key={item.id} className={`ide-problem-entry ide-problem-entry--${item.severity}`}>
      <button className={`ide-problem ide-problem--${item.severity}`} onClick={() => onOpen(item)}>
        <span className="ide-problem-icon">{item.severity === 'error' ? '×' : '!'}</span>
        <span><strong>{item.message.split('\n')[0]}</strong><small>{item.location.path || 'javac'}{item.location.line ? `:${item.location.line}` : ''}{item.location.column ? `:${item.location.column}` : ''}</small></span>
      </button>
      <details><summary>Exact compiler output</summary><pre>{item.raw}</pre></details>
    </div>) : <p className="ide-empty">{build?.success ? 'No compiler problems.' : build?.rawOutput || 'Build the project to see compiler diagnostics.'}</p>}
  </div>
}
