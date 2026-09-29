/** LSP wire values; semantic facts are supplied exclusively by the local server. */
export interface LspPosition { line: number; character: number }
export interface LspRange { start: LspPosition; end: LspPosition }
export interface LspTextEdit { range: LspRange; newText: string; annotationId?: string }
export interface LspDiagnostic { range: LspRange; message: string; severity?: number; source?: string; code?: string | number; tags?: number[]; data?: unknown }
export interface DiagnosticGroup { uri: string; version?: number; diagnostics: LspDiagnostic[] }
export interface LanguageSnapshot {
  projectId: string | null
  generation: number
  status: 'starting' | 'indexing' | 'ready' | 'unavailable' | 'failed' | 'stopped'
  message: string | null
  diagnostics: DiagnosticGroup[]
  metrics: Record<string, number | null>
}
export interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>
  documentChanges?: ({ textDocument: { uri: string; version: number | null }; edits: LspTextEdit[] } | { kind: string })[]
  changeAnnotations?: Record<string, { label: string; needsConfirmation?: boolean }>
}
export interface LspLocation { uri: string; range: LspRange }
export interface LspLocationLink { targetUri: string; targetRange: LspRange; targetSelectionRange: LspRange; originSelectionRange?: LspRange }
export interface LspCommand { title: string; command: string; arguments?: unknown[] }
export type LspMarkup = string | { kind?: string; language?: string; value: string }
export interface LspCompletionItem {
  label: string; kind?: number; detail?: string; documentation?: LspMarkup; insertText?: string; insertTextFormat?: number
  textEdit?: LspTextEdit | { insert: LspRange; replace: LspRange; newText: string }
  textEditText?: string; additionalTextEdits?: LspTextEdit[]; filterText?: string; sortText?: string; preselect?: boolean
  command?: LspCommand; data?: unknown; tags?: number[]
}
export interface LspCodeAction { title: string; kind?: string; isPreferred?: boolean; disabled?: { reason: string }; edit?: LspWorkspaceEdit; command?: LspCommand; data?: unknown }
export interface LspWorkspaceSymbol { name: string; kind: number; containerName?: string; location: { uri: string; range?: LspRange }; data?: unknown }
export interface LspDocumentSymbol { name: string; detail?: string; kind: number; range: LspRange; selectionRange: LspRange; children?: LspDocumentSymbol[]; tags?: number[] }
export interface LspSymbolInformation { name: string; kind: number; location: LspLocation; containerName?: string; tags?: number[] }

export function documentUri(projectId: string, path: string): string {
  if (!projectId || !validPath(path)) throw new Error('Invalid language document path')
  return `inmemory://ggjavaez/${encodeURIComponent(projectId)}/${path.split('/').map(encodeURIComponent).join('/')}`
}
export function documentPath(uri: string, projectId: string): string | null {
  try {
    const parsed = new URL(uri)
    if (parsed.protocol !== 'inmemory:' || parsed.hostname !== 'ggjavaez' || parsed.search || parsed.hash) return null
    const parts = parsed.pathname.slice(1).split('/').map(decodeURIComponent)
    if (parts.shift() !== projectId) return null
    const path = parts.join('/')
    return validPath(path) && documentUri(projectId, path) === uri ? path : null
  } catch { return null }
}
function validPath(path: string) {
  return !!path && !path.includes('\\') && ![...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}
