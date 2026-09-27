import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { SourceLocation, TraceDocument } from '../contracts/runtime'

interface SourcePaneProps {
  trace: TraceDocument
  location: SourceLocation | null
  onChooseLine: (line: number) => void
}

export function SourcePane({ trace, location, onChooseLine }: SourcePaneProps) {
  const file = trace.sourceFiles[0]
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const chooseLineRef = useRef(onChooseLine)
  chooseLineRef.current = onChooseLine

  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance
    monaco.editor.defineTheme('visual-java', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'keyword', foreground: '8CA6FF' },
        { token: 'string', foreground: '83DFC8' },
        { token: 'number', foreground: 'FFC857' },
        { token: 'type', foreground: 'C79CFF' },
      ],
      colors: {
        'editor.background': '#090D14',
        'editor.foreground': '#DCE7F3',
        'editorLineNumber.foreground': '#536476',
        'editorLineNumber.activeForeground': '#B9C9DD',
        'editor.selectionBackground': '#243B58',
        'editor.lineHighlightBackground': '#0E1928',
      },
    })
    monaco.editor.setTheme('visual-java')
    decorationsRef.current = instance.createDecorationsCollection()
    instance.onMouseDown((event) => {
      const line = event.target.position?.lineNumber
      if (line) chooseLineRef.current(line)
    })
  }

  useEffect(() => {
    const editor = editorRef.current
    const decorations = decorationsRef.current
    if (!editor || !decorations) return
    decorations.set(location && location.fileId === file.fileId ? [{
      range: { startLineNumber: location.line, endLineNumber: location.line, startColumn: 1, endColumn: 1 },
      options: { isWholeLine: true, className: 'executing-line', linesDecorationsClassName: 'executing-gutter' },
    }] : [])
    if (location) editor.revealLineInCenterIfOutsideViewport(location.line)
  }, [location, file.fileId])

  return (
    <section className="source-pane" aria-label="Java source code">
      <header className="pane-heading">
        <span className="pane-title">SOURCE</span>
        <span className="source-filename">{file.name}</span>
        <span className="pane-meta">READ ONLY</span>
      </header>
      <div className="source-editor">
        <Editor
          language="java"
          value={file.content}
          theme="visual-java"
          onMount={onMount}
          options={{
            readOnly: true,
            domReadOnly: true,
            minimap: { enabled: false },
            glyphMargin: false,
            folding: false,
            scrollBeyondLastLine: false,
            fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
            fontSize: 13,
            lineHeight: 24,
            lineNumbersMinChars: 2,
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            automaticLayout: true,
            padding: { top: 20, bottom: 20 },
          }}
        />
      </div>
      <footer className="source-foot">Click a line to find its trace event</footer>
    </section>
  )
}
