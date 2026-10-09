import { useCallback, useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor, IDisposable } from 'monaco-editor'
import type { SourceLocation, TraceDocument } from '../../contracts/runtime'
import { typography } from '../../theme/tokens'
import '../../ui/monacoSetup'

interface SourceEditorProps {
  file: TraceDocument['sourceFiles'][number]
  location: SourceLocation | null
  onChooseLine: (line: number) => void
  mark:'history'|'focus'
  viewportHeight:number
}

/** Loaded only when SourcePane renders the full editor. Owns Monaco's lifecycle. */
export default function RecordedSourceEditor({ file, location, onChooseLine, mark,viewportHeight }: SourceEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const listenersRef = useRef<IDisposable[]>([])
  const chooseLineRef = useRef(onChooseLine)
  chooseLineRef.current = onChooseLine
  // Monaco's React wrapper retains its initial onMount callback while loading.
  // Read these refs at mount time so a cursor change during loading is not lost.
  const sourceRef = useRef({ location, file,mark })
  sourceRef.current = { location, file,mark }

  const applyCurrentLine = useCallback(() => {
    const instance = editorRef.current
    const decorations = decorationsRef.current
    if (!instance || !decorations) return
    const { location: current, file: source,mark } = sourceRef.current
    const lineCount = instance.getModel()?.getLineCount() ?? 0
    const line = current && current.fileId === source?.fileId && current.line >= 1 && current.line <= lineCount
      ? current.line : null
    decorations.set(line !== null ? [{
      range: { startLineNumber: line, endLineNumber: line, startColumn: 1, endColumn: 1 },
      options: { isWholeLine: true, className: mark==='history'?'executing-line gg-source-history-line':'executing-line gg-source-focus-line', linesDecorationsClassName: mark==='history'?'gg-source-history-gutter':'executing-gutter' },
    }] : [])
    if (line !== null) instance.revealLineInCenterIfOutsideViewport(line)
  }, [])

  const clearEditorBindings = useCallback(() => {
    listenersRef.current.forEach((listener) => listener.dispose())
    listenersRef.current = []
    decorationsRef.current?.clear()
    decorationsRef.current = null
    editorRef.current = null
  }, [])

  const onMount: OnMount = (instance) => {
    clearEditorBindings()
    editorRef.current = instance
    decorationsRef.current = instance.createDecorationsCollection()
    listenersRef.current = [
      instance.onMouseDown((event) => {
        const line = event.target.position?.lineNumber
        if (line) chooseLineRef.current(line)
      }),
      instance.onDidChangeModelContent(applyCurrentLine),
      instance.onDidDispose(clearEditorBindings),
    ]
    applyCurrentLine()
  }

  useEffect(() => {
    applyCurrentLine()
  }, [location, file, mark,applyCurrentLine])

  useEffect(() => clearEditorBindings, [clearEditorBindings])

  return (
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
        fontFamily: typography.code,
        fontSize: Math.max(12,viewportHeight*.016),
        lineHeight: Math.max(20,viewportHeight*.029),
        lineNumbersMinChars: 2,
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        automaticLayout: true,
        padding: { top: 20, bottom: 20 },
      }}
    />
  )
}
