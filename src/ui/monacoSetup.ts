import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/java/register.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { colors } from '../theme/tokens'

// Java uses Monaco's basic tokenizer and core editor worker, with no language server.
// Configure the React loader before any Editor mounts so it never requests CDN assets.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

const tokenColor = (color: string) => color.replace('#', '')

monaco.editor.defineTheme('visual-java', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: tokenColor(colors.stack) },
    { token: 'string', foreground: tokenColor(colors.success) },
    { token: 'number', foreground: tokenColor(colors.mutation) },
    { token: 'type', foreground: tokenColor(colors.heap) },
    { token: 'comment', foreground: tokenColor(colors.textMuted) },
  ],
  colors: {
    'editor.background': colors.canvasRaised,
    'editor.foreground': colors.text,
    'editorLineNumber.foreground': colors.textMuted,
    'editorLineNumber.activeForeground': colors.textSecondary,
    'editor.selectionBackground': colors.borderStrong,
    'editor.lineHighlightBackground': colors.panelRaised,
    'editorCursor.foreground': colors.execution,
    'editorIndentGuide.background1': colors.border,
    'editorIndentGuide.activeBackground1': colors.borderStrong,
    'editorWidget.background': colors.panel,
    'editorWidget.border': colors.border,
    'focusBorder': colors.execution,
  },
})
