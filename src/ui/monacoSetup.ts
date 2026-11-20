import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/java/register.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { color } from '../theme/tokens'
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-editor/editor/contrib/parameterHints/browser/parameterHints.js'
import 'monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands.js'
import 'monaco-editor/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js'
import 'monaco-editor/editor/contrib/rename/browser/rename.js'
import 'monaco-editor/editor/contrib/codeAction/browser/codeActionContributions.js'
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess.js'

// Java tokenization runs locally; project language providers attach to Monaco separately.
// Configure the React loader before any Editor mounts so it never requests CDN assets.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

const tokenColor = (color: string) => color.replace('#', '')

monaco.editor.defineTheme('visual-java', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: tokenColor(color.stack.edge) },
    { token: 'string', foreground: tokenColor(color.semantic.stdout) },
    { token: 'number', foreground: tokenColor(color.semantic.mutation) },
    { token: 'type', foreground: tokenColor(color.heap.edge) },
    { token: 'comment', foreground: tokenColor(color.ui.textMuted) },
  ],
  colors: {
    'editor.background': color.background.top,
    'editor.foreground': color.ui.text,
    'editorLineNumber.foreground': color.ui.textMuted,
    'editorLineNumber.activeForeground': color.ui.textSecondary,
    'editor.selectionBackground': `${color.semantic.execution}2E`,
    'editor.lineHighlightBackground': `${color.semantic.execution}18`,
    'editorCursor.foreground': color.semantic.execution,
    'editorIndentGuide.background1': `${color.semantic.execution}2E`,
    'editorIndentGuide.activeBackground1': `${color.semantic.execution}66`,
    'editorWidget.background': color.background.top,
    'editorWidget.border': color.ui.modeActiveBorder,
    'focusBorder': color.semantic.execution,
  },
})
