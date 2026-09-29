import type * as Monaco from 'monaco-editor'
import type { LanguageClient } from './client'
import { documentPath, documentUri, type LspRange, type LspTextEdit, type LspWorkspaceEdit } from './protocol'

export interface LanguageFileState { content: string; revision: string }
export interface LanguageDraftChange extends LanguageFileState { path: string }
export interface WorkspaceEditHost {
  /** Current draft (including persisted closed-file drafts), not stale disk text. */
  getFileState(path: string): LanguageFileState | undefined
  /** Load without changing drafts/tabs. Must retain original disk revision. */
  loadFile(path: string): Promise<LanguageFileState>
  /** Synchronous, atomic merge of the complete validated batch. Throws before mutation on failure. */
  commitDrafts(changes: LanguageDraftChange[]): void
}
export interface PreparedWorkspaceEdit {
  projectId: string; generation: number
  files: { path: string; original: LanguageFileState; content: string; edits: LspTextEdit[]; model: Monaco.editor.ITextModel | null; modelVersion?: number; languageVersion?: number; hadDraft: boolean }[]
}
let mutationDepth = 0
/** Editor onChange must not persist individual files while a multi-file transaction is in flight. */
export function isApplyingWorkspaceEdit() { return mutationDepth > 0 }
export function monacoRange(range: LspRange): Monaco.IRange {
  return { startLineNumber: range.start.line + 1, startColumn: range.start.character + 1, endLineNumber: range.end.line + 1, endColumn: range.end.character + 1 }
}
function offset(text: string, position: { line: number; character: number }) {
  if (!Number.isInteger(position.line) || !Number.isInteger(position.character) || position.line < 0 || position.character < 0) throw new Error('Invalid language edit range')
  let start = 0
  for (let line = 0; line < position.line; line++) {
    const end = text.indexOf('\n', start)
    if (end < 0) throw new Error('Language edit line is outside the document')
    start = end + 1
  }
  let end = text.indexOf('\n', start)
  if (end < 0) end = text.length
  if (end > start && text[end - 1] === '\r') end--
  if (position.character > end - start) throw new Error('Language edit column is outside the document')
  return start + position.character
}
export function editedText(text: string, edits: LspTextEdit[]) {
  const spans = edits.map((edit, index) => {
    if (typeof edit.newText !== 'string') throw new Error('Language edit text is invalid')
    const start = offset(text, edit.range.start), end = offset(text, edit.range.end)
    if (end < start) throw new Error('Language edit range is reversed')
    return { start, end, text: edit.newText, index }
  }).sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index)
  for (let i = 1; i < spans.length; i++) {
    const previous = spans[i - 1], current = spans[i]
    if (current.start < previous.end || (current.start === previous.start && (current.end !== current.start || previous.end !== previous.start))) throw new Error('Language edit ranges overlap')
  }
  // Reverse application preserves the server's ordering of inserts at a shared offset.
  return spans.reduceRight((result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end), text)
}
function collect(edit: LspWorkspaceEdit, projectId: string) {
  if (Object.values(edit.changeAnnotations ?? {}).some((annotation) => annotation.needsConfirmation)) throw new Error('This language action requires confirmation and is not supported')
  const files = new Map<string, { edits: LspTextEdit[]; version?: number }>()
  const add = (uri: string, edits: LspTextEdit[], version?: number) => {
    const path = documentPath(uri, projectId)
    if (!path) throw new Error('Language edit targets a file outside the current project')
    const existing = files.get(path)
    if (existing && existing.version !== undefined && version !== undefined && existing.version !== version) throw new Error('Conflicting language edit versions')
    files.set(path, { edits: [...(existing?.edits ?? []), ...edits], version: version ?? existing?.version })
  }
  if (edit.changes && edit.documentChanges) throw new Error('Ambiguous workspace edit encodings')
  Object.entries(edit.changes ?? {}).forEach(([uri, edits]) => add(uri, edits))
  for (const change of edit.documentChanges ?? []) {
    if ('kind' in change) throw new Error('Language file create/rename/delete operations are not supported')
    add(change.textDocument.uri, change.edits, change.textDocument.version ?? undefined)
  }
  return files
}
/** Preload every target before validating and before mutating any model or draft. */
export async function preflightWorkspaceEdit(monaco: typeof import('monaco-editor/editor/editor.api.js'), client: LanguageClient, edit: LspWorkspaceEdit, host: WorkspaceEditHost): Promise<PreparedWorkspaceEdit> {
  const projectId = client.projectId, generation = client.generation
  if (!projectId) throw new Error('No active Java project')
  const targets = collect(edit, projectId)
  const loaded = await Promise.all([...targets].map(async ([path, target]) => {
    const draft = host.getFileState(path)
    const model = monaco.editor.getModel(monaco.Uri.parse(documentUri(projectId, path)))
    const modelVersion = model?.getVersionId()
    const languageVersion = client.getDocumentVersion(path)
    const state = draft ?? await host.loadFile(path)
    return { path, target, state: { ...state }, model, modelVersion, languageVersion, hadDraft: !!draft }
  }))
  if (projectId !== client.projectId || generation !== client.generation) throw new Error('Project changed while preparing language edits')
  const files = loaded.map(({ path, target, state, model, modelVersion, languageVersion, hadDraft }) => {
    if (target.version !== undefined && target.version !== languageVersion) throw new Error(`Stale language document version: ${path}`)
    if (languageVersion !== undefined && client.getDocumentText(path) !== state.content) throw new Error(`Language document and draft differ: ${path}`)
    if (model && (model.isDisposed() || model.getVersionId() !== modelVersion || model.getValue() !== state.content)) throw new Error(`Draft and editor differ: ${path}`)
    return { path, original: state, content: editedText(state.content, target.edits), edits: target.edits, model, modelVersion, languageVersion, hadDraft }
  })
  const prepared = { projectId, generation, files }
  validatePrepared(monaco, client, prepared, host)
  return prepared
}
function validatePrepared(monaco: typeof import('monaco-editor/editor/editor.api.js'), client: LanguageClient, prepared: PreparedWorkspaceEdit, host: WorkspaceEditHost) {
  if (prepared.projectId !== client.projectId || prepared.generation !== client.generation) throw new Error('Project changed before applying language edits')
  for (const file of prepared.files) {
    const current = host.getFileState(file.path)
    if ((file.hadDraft && !current) || (current && (current.content !== file.original.content || current.revision !== file.original.revision))) throw new Error(`Draft changed before applying language edits: ${file.path}`)
    const model = monaco.editor.getModel(monaco.Uri.parse(documentUri(prepared.projectId, file.path)))
    if (model !== file.model || (model && (model.isDisposed() || model.getVersionId() !== file.modelVersion || model.getValue() !== file.original.content))) throw new Error(`Editor changed before applying language edits: ${file.path}`)
    if (client.getDocumentVersion(file.path) !== file.languageVersion) throw new Error(`Language document changed: ${file.path}`)
  }
}
/** No await between final validation, model changes and atomic draft commit. No disk writes. */
export function commitWorkspaceEdit(monaco: typeof import('monaco-editor/editor/editor.api.js'), client: LanguageClient, prepared: PreparedWorkspaceEdit, host: WorkspaceEditHost) {
  validatePrepared(monaco, client, prepared, host)
  const applied: { model: Monaco.editor.ITextModel; undo: Monaco.editor.IIdentifiedSingleEditOperation[]; created: boolean }[] = []
  mutationDepth++
  try {
    for (const file of prepared.files) {
      const model = file.model ?? monaco.editor.createModel(file.original.content, file.path.endsWith('.java') ? 'java' : undefined, monaco.Uri.parse(documentUri(prepared.projectId, file.path)))
      model.pushStackElement()
      let undo: Monaco.editor.IIdentifiedSingleEditOperation[] = []
      applied.push({ model, undo, created: !file.model })
      model.pushEditOperations([], file.edits.map((edit) => ({ range: monacoRange(edit.range), text: edit.newText, forceMoveMarkers: true })), (inverse) => { undo = inverse; applied[applied.length - 1].undo = undo; return null })
      if (model.getValue() !== file.content) throw new Error(`Editor could not apply the language edits exactly: ${file.path}`)
      model.pushStackElement()
    }
    host.commitDrafts(prepared.files.map((file) => ({ path: file.path, content: file.content, revision: file.original.revision })))
  } catch (error) {
    for (const item of applied.reverse()) {
      if (item.created) item.model.dispose()
      else { item.model.applyEdits(item.undo); item.model.pushStackElement() }
    }
    throw error
  } finally { mutationDepth-- }
  prepared.files.forEach((file) => { if (client.hasDocument(file.path)) client.changeDocument(file.path, file.content) })
  return prepared.files.map((file) => file.path)
}
export async function applyWorkspaceEdit(monaco: typeof import('monaco-editor/editor/editor.api.js'), client: LanguageClient, edit: LspWorkspaceEdit, host: WorkspaceEditHost) {
  return commitWorkspaceEdit(monaco, client, await preflightWorkspaceEdit(monaco, client, edit, host), host)
}
