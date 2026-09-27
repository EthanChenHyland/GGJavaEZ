import { useCallback, useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor, IDisposable } from 'monaco-editor'
import type { SourceLocation, TraceDocument } from '../contracts/runtime'
import { typography } from '../theme/tokens'
import './monacoSetup'

interface SourceEditorProps {
  file: TraceDocument['sourceFiles'][number]
  location: SourceLocation | null
  onChooseLine: (line: number) => void
}

/** Loaded only when SourcePane renders the full editor. Owns Monaco's lifecycle. */
export default function SourceEditor({ file, location, onChooseLine }: SourceEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const listenersRef = useRef<IDisposable[]>([])
  const chooseLineRef = useRef(onChooseLine)
  chooseLineRef.current = onChooseLine
  // Monaco's React wrapper retains its initial onMount callback while loading.
  // Read these refs at mount time so a cursor change during loading is not lost.
  const sourceRef = useRef({ location, file })
  sourceRef.current = { location, file }

  const applyCurrentLine = useCallback(() => {
    const instance = editorRef.current
    const decorations = decorationsRef.current
    if (!instance || !decorations) return
    const { location: current, file: source } = sourceRef.current
    const lineCount = instance.getModel()?.getLineCount() ?? 0
    const line = current && current.fileId === source?.fileId && current.line >= 1 && current.line <= lineCount
      ? current.line : null
    decorations.set(line !== null ? [{
      range: { startLineNumber: line, endLineNumber: line, startColumn: 1, endColumn: 1 },
      options: { isWholeLine: true, className: 'executing-line', linesDecorationsClassName: 'executing-gutter' },
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
  }, [location, file, applyCurrentLine])

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
        fontSize: typography.secondaryUiPx,
        lineHeight: 24,
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
