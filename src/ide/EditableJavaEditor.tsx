import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import * as monacoApi from 'monaco-editor/editor/editor.api.js'
import type { CompileDiagnostic, SourceLocation } from './contracts'
import { typography } from '../theme/tokens'
import '../ui/monacoSetup'

export function EditableJavaEditor({ projectId, path, value, onChange, diagnostics, navigate, onSave, executingLine = null }: {
  projectId: string
  path: string
  value: string
  onChange: (value: string) => void
  diagnostics: CompileDiagnostic[]
  navigate: SourceLocation | null
  onSave: () => void
  executingLine?: number | null
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const pathRef = useRef(path)
  pathRef.current = path
  const executionRef = useRef(executingLine)
  executionRef.current = executingLine
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const navigationRef = useRef(navigate)
  navigationRef.current = navigate
  const diagnosticsRef = useRef(diagnostics)
  diagnosticsRef.current = diagnostics
  const showLocation = (instance: editor.IStandaloneCodeEditor, location: SourceLocation | null) => {
    if (!location || location.path !== pathRef.current) return
    instance.setPosition({ lineNumber: location.line, column: location.column ?? 1 })
    instance.revealLineInCenter(location.line)
    instance.focus()
  }
  const showMarkers = (instance: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor/editor/editor.api.js'), items: CompileDiagnostic[]) => {
    const model = instance.getModel()
    if (!model || model.isDisposed()) return
    monaco.editor.setModelMarkers(model, 'javac', items.filter((item) => item.location.path === pathRef.current).map((item) => ({
      startLineNumber: item.location.line,
      endLineNumber: item.location.line,
      startColumn: item.location.column ?? 1,
      endColumn: (item.location.column ?? 1) + 1,
      severity: item.severity === 'error' ? monaco.MarkerSeverity.Error : item.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
      message: item.message,
      source: 'javac',
    })))
  }
  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance
    decorationsRef.current = instance.createDecorationsCollection()
    if (executionRef.current && executionRef.current > 0) decorationsRef.current.set([{ range: { startLineNumber: executionRef.current, endLineNumber: executionRef.current, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: 'executing-line', linesDecorationsClassName: 'executing-gutter' } }])
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    showLocation(instance, navigationRef.current)
    showMarkers(instance, monaco, diagnosticsRef.current)
  }
  useEffect(() => {
    decorationsRef.current?.set(executingLine && executingLine > 0 ? [{ range: { startLineNumber: executingLine, endLineNumber: executingLine, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: 'executing-line', linesDecorationsClassName: 'executing-gutter' } }] : [])
  }, [executingLine, path])
  useEffect(() => {
    const instance = editorRef.current
    if (!instance || !navigate || navigate.path !== path) return
    showLocation(instance, navigate)
  }, [navigate, path])
  useEffect(() => {
    const instance = editorRef.current
    if (!instance) return
    showMarkers(instance, monacoApi, diagnostics)
  }, [diagnostics, path])
  return <Editor
    path={`inmemory://ggjavaez/${projectId}/${path}`}
    language="java"
    theme="visual-java"
    value={value}
    onChange={(next) => onChange(next ?? '')}
    onMount={onMount}
    saveViewState
    keepCurrentModel
    options={{
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: typography.code,
      fontSize: 13,
      lineHeight: 21,
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      padding: { top: 16, bottom: 16 },
      renderLineHighlight: 'line',
      wordWrap: 'off',
    }}
  />
}
