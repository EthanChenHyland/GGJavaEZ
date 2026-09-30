import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/java/register.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { colors } from '../theme/tokens'
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
