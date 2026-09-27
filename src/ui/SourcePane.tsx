import { lazy, Suspense } from 'react'
import type { SourceLocation, TraceDocument } from '../contracts/runtime'

// Keep Monaco and its worker setup out of the compact source strip's dependency graph.
const SourceEditor = lazy(() => import('./SourceEditor'))

interface SourcePaneProps {
  trace: TraceDocument
  location: SourceLocation | null
  onChooseLine: (line: number) => void
  compact?: boolean
}

export function SourcePane({ trace, location, onChooseLine, compact = false }: SourcePaneProps) {
  const file = trace.sourceFiles.find((source) => source.fileId === location?.fileId) ?? trace.sourceFiles[0]
  if (compact) {
    const line = location?.fileId === file?.fileId ? location?.line : undefined
    const currentLine = line !== undefined ? file?.content.split(/\r?\n/)[line - 1] : undefined
    return (
      <section className="source-pane" aria-label="Current Java source line">
        <header className="pane-heading">
          <span className="pane-title">SOURCE</span>
          <span className="source-filename" style={{ flexShrink: 0 }}>{file?.name ?? 'No source'}</span>
          <code className="source-current-line" title={currentLine}>
            {currentLine !== undefined ? `L${line} · ${currentLine.trim()}` : 'No active source line'}
          </code>
        </header>
      </section>
    )
  }

  if (!file) return <section className="source-pane" aria-label="Java source code">No source available</section>

  return (
    <section className="source-pane" aria-label="Java source code">
      <header className="pane-heading">
        <span className="pane-title">SOURCE</span>
        <span className="source-filename">{file.name}</span>
        <span className="pane-meta">READ ONLY</span>
      </header>
      <div className="source-editor">
        <Suspense fallback={<div role="status">Loading source editor…</div>}>
          <SourceEditor file={file} location={location} onChooseLine={onChooseLine} />
        </Suspense>
      </div>
      <footer className="source-foot">Click a line to find its trace event</footer>
    </section>
  )
}
