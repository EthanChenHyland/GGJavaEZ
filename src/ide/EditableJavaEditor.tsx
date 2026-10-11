import { useCallback, useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor, IDisposable } from 'monaco-editor'
import * as monacoApi from 'monaco-editor/editor/editor.api.js'
import type { CompileDiagnostic, SourceLocation } from './contracts'
import type { ResolvedBreakpoint } from '../debugger/contracts'
import { typography } from '../theme/tokens'
import { documentUri } from '../language/protocol'
import { isApplyingWorkspaceEdit } from '../language/workspaceEdit'
import { ideShortcuts } from './shortcuts'
import '../ui/monacoSetup'
import { bindMonacoSourceScroll } from '../shell/source/monacoSourceScroll'
import type { SourceMark } from '../shell/source/sourceScrollPolicy'

export function EditableJavaEditor({ projectId, path, value, onChange, diagnostics, navigate, onSave, executingLine = null, pausedLine = null, breakpoints = [], onToggleBreakpoint, sourceMark='running', sourceKey='', pauseId=null, viewportHeight }: {
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
  sourceMark?: SourceMark
  sourceKey?: string
  pauseId?: string | null
  viewportHeight: number
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const breakpointDecorations = useRef<editor.IEditorDecorationsCollection | null>(null)
  const breakpointRef = useRef(breakpoints)
  breakpointRef.current = breakpoints
  const toggleRef = useRef(onToggleBreakpoint)
  toggleRef.current = onToggleBreakpoint
  const listenersRef = useRef<IDisposable[]>([])
  const scrollRef = useRef<ReturnType<typeof bindMonacoSourceScroll> | null>(null)
  const sourceRef = useRef({ line: pausedLine ?? executingLine, mark: sourceMark, key: sourceKey, pauseId })
  sourceRef.current = { line: pausedLine ?? executingLine, mark: sourceMark, key: sourceKey, pauseId }
  const applyCurrentLine = useCallback(() => {
    const instance = editorRef.current
    if(!instance)return
    const source=sourceRef.current,count=instance.getModel()?.getLineCount()??0
    const line=source.line&&source.line>=1&&source.line<=count?source.line:null,mark=source.mark
    const className=mark==='paused'?'debug-paused-line':mark==='history'?'executing-line gg-source-history-line':mark==='focus'?'executing-line gg-source-focus-line':'executing-line'
    const gutter=mark==='paused'?'debug-paused-gutter':mark==='history'?'gg-source-history-gutter':'executing-gutter'
    decorationsRef.current?.set(line?[{range:{startLineNumber:line,endLineNumber:line,startColumn:1,endColumn:1},options:{isWholeLine:true,className,linesDecorationsClassName:gutter}}]:[])
    scrollRef.current?.sync({mark,line,key:`${source.key}:${pathRef.current}:${line}`},source.pauseId)
  }, [])
  const clearEditorBindings = useCallback(() => {
    scrollRef.current?.dispose();scrollRef.current=null
    listenersRef.current.forEach(listener=>listener.dispose());listenersRef.current=[]
    decorationsRef.current?.clear();decorationsRef.current=null
    breakpointDecorations.current?.clear();breakpointDecorations.current=null
    editorRef.current=null
  }, [])
  const showBreakpoints = () => breakpointDecorations.current?.set(breakpointRef.current.filter((point) => point.fileId === pathRef.current).map((point) => ({
    range: { startLineNumber: point.line, endLineNumber: point.line, startColumn: 1, endColumn: 1 },
    options: { glyphMarginClassName: point.status === 'verified' || point.status === 'pending' ? 'debug-breakpoint' : 'debug-breakpoint-unverified', glyphMarginHoverMessage: { value: point.reason ?? `Breakpoint · line ${point.line}` } },
  })))
  const pathRef = useRef(path)
  pathRef.current = path
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const navigationRef = useRef(navigate)
  navigationRef.current = navigate
  const consumedNavigation=useRef<SourceLocation|null>(null)
  const diagnosticsRef = useRef(diagnostics)
  diagnosticsRef.current = diagnostics
  const showLocation = (instance: editor.IStandaloneCodeEditor, location: SourceLocation | null) => {
    if (!location || location.path !== pathRef.current || consumedNavigation.current===location) return
    consumedNavigation.current=location
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
    clearEditorBindings()
    editorRef.current = instance
    decorationsRef.current = instance.createDecorationsCollection()
    breakpointDecorations.current = instance.createDecorationsCollection()
    scrollRef.current = bindMonacoSourceScroll(instance, monaco)
    showBreakpoints()
    listenersRef.current.push(instance.onMouseDown((event) => {
      if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && event.target.position) toggleRef.current?.(event.target.position.lineNumber)
    }),instance.onDidChangeModelContent(applyCurrentLine),instance.onDidDispose(clearEditorBindings))
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode[ideShortcuts.save.code], () => saveRef.current())
    listenersRef.current.push(instance.addAction({
      id: 'visual-java.toggle-breakpoint',
      label: 'Toggle Breakpoint',
      keybindings: [monaco.KeyCode[ideShortcuts.breakpoint.code]],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: (current) => {
        const line = current.getPosition()?.lineNumber
        if (line) toggleRef.current?.(line)
      },
    }))
    showLocation(instance, navigationRef.current)
    showMarkers(instance, monaco, diagnosticsRef.current)
    applyCurrentLine()
  }
  useEffect(() => {
    applyCurrentLine()
  }, [executingLine, pausedLine, path, sourceMark, sourceKey, pauseId, applyCurrentLine])
  useEffect(() => clearEditorBindings, [clearEditorBindings])
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
      fontSize: Math.max(12, viewportHeight*.016),
      lineHeight: Math.max(20, viewportHeight*.029),
      lineNumbersMinChars: 3,
      glyphMargin: true,
      scrollBeyondLastLine: false,
      padding: { top: 16, bottom: 16 },
      renderLineHighlight: 'line',
      wordWrap: 'off',
    }}
  />
}
