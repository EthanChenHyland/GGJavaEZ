import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import * as monacoApi from 'monaco-editor/editor/editor.api.js'
import type { CompileDiagnostic, SourceLocation } from './contracts'
import type { ResolvedBreakpoint } from '../debugger/contracts'
import { typography } from '../theme/tokens'
import { documentUri } from '../language/protocol'
import { isApplyingWorkspaceEdit } from '../language/workspaceEdit'
import { ideShortcuts } from './shortcuts'
import '../ui/monacoSetup'

export function EditableJavaEditor({ projectId, path, value, onChange, diagnostics, navigate, onSave, executingLine = null, pausedLine = null, breakpoints = [], onToggleBreakpoint }: {
  projectId: string
  path: string
  value: string
  onChange: (value: string) => void
  diagnostics: CompileDiagnostic[]
  navigate: SourceLocation | null
  onSave: () => void
  executingLine?: number | null
  pausedLine?: number | null
  breakpoints?: ResolvedBreakpoint[]
  onToggleBreakpoint?: (line: number) => void
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const breakpointDecorations = useRef<editor.IEditorDecorationsCollection | null>(null)
  const breakpointRef = useRef(breakpoints)
  breakpointRef.current = breakpoints
  const toggleRef = useRef(onToggleBreakpoint)
  toggleRef.current = onToggleBreakpoint
  const pausedRef = useRef(pausedLine)
  pausedRef.current = pausedLine
  const showBreakpoints = () => breakpointDecorations.current?.set(breakpointRef.current.filter((point) => point.fileId === pathRef.current).map((point) => ({
    range: { startLineNumber: point.line, endLineNumber: point.line, startColumn: 1, endColumn: 1 },
    options: { glyphMarginClassName: point.status === 'verified' || point.status === 'pending' ? 'debug-breakpoint' : 'debug-breakpoint-unverified', glyphMarginHoverMessage: { value: point.reason ?? `Breakpoint · line ${point.line}` } },
  })))
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
    breakpointDecorations.current = instance.createDecorationsCollection()
    showBreakpoints()
    instance.onMouseDown((event) => {
      if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && event.target.position) toggleRef.current?.(event.target.position.lineNumber)
    })
    if (executionRef.current && executionRef.current > 0) {
      decorationsRef.current.set([{ range: { startLineNumber: executionRef.current, endLineNumber: executionRef.current, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: pausedRef.current ? 'debug-paused-line' : 'executing-line', linesDecorationsClassName: pausedRef.current ? 'debug-paused-gutter' : 'executing-gutter' } }])
      instance.revealLineInCenter(executionRef.current)
    }
    // The IDE stacks panels at narrow widths. Monaco can keep its old scroll position
    // when that resize leaves only a few source lines visible.
    instance.onDidLayoutChange(() => {
      const line = pausedRef.current ?? executionRef.current
      if (line && line > 0) instance.revealLineInCenterIfOutsideViewport(line)
    })
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode[ideShortcuts.save.code], () => saveRef.current())
    instance.addAction({
      id: 'visual-java.toggle-breakpoint',
      label: 'Toggle Breakpoint',
      keybindings: [monaco.KeyCode[ideShortcuts.breakpoint.code]],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: (current) => {
        const line = current.getPosition()?.lineNumber
        if (line) toggleRef.current?.(line)
      },
    })
    showLocation(instance, navigationRef.current)
    showMarkers(instance, monaco, diagnosticsRef.current)
  }
  useEffect(() => {
    const line = pausedLine ?? executingLine
    decorationsRef.current?.set(line && line > 0 ? [{ range: { startLineNumber: line, endLineNumber: line, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: pausedLine ? 'debug-paused-line' : 'executing-line', linesDecorationsClassName: pausedLine ? 'debug-paused-gutter' : 'executing-gutter' } }] : [])
    if (line && line > 0) editorRef.current?.revealLineInCenter(line)
  }, [executingLine, pausedLine, path])
  useEffect(() => { showBreakpoints() }, [breakpoints, path])
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
    path={documentUri(projectId, path)}
    language={path.endsWith('.java') ? 'java' : 'plaintext'}
    theme="visual-java"
    value={value}
    onChange={(next) => { if (!isApplyingWorkspaceEdit()) onChange(next ?? '') }}
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
      glyphMargin: true,
      scrollBeyondLastLine: false,
      padding: { top: 16, bottom: 16 },
      renderLineHighlight: 'line',
      wordWrap: 'off',
    }}
  />
}
