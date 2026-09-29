import type * as Monaco from 'monaco-editor'
import type { SourceLocation } from '../ide/contracts'
import { LanguageClient } from './client'
import { documentPath, documentUri, type LspCodeAction, type LspCommand, type LspCompletionItem, type LspDiagnostic, type LspDocumentSymbol, type LspLocation, type LspLocationLink, type LspMarkup, type LspRange, type LspSymbolInformation, type LspWorkspaceEdit, type LspWorkspaceSymbol } from './protocol'
import { monacoRange } from './workspaceEdit'

export interface JavaIntelligenceOptions {
  client: LanguageClient
  onOpen?: (location: SourceLocation) => void | Promise<void>
  applyEdit?: (edit: LspWorkspaceEdit) => void | Promise<unknown>
  onError?: (message: string) => void
}
export interface JavaIntelligenceRegistration extends Monaco.IDisposable {
  workspaceSymbols(query: string, signal?: AbortSignal): Promise<LspWorkspaceSymbol[]>
  organizeImports(model: Monaco.editor.ITextModel): Promise<void>
}
function markup(value?: LspMarkup): Monaco.IMarkdownString | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return { value, isTrusted: false }
  return { value: value.language ? `\`\`\`${value.language}\n${value.value}\n\`\`\`` : value.value, isTrusted: false }
}
function hoverMarkup(value: LspMarkup): Monaco.IMarkdownString | undefined {
  const cleaned = typeof value === 'string'
    ? value.split('\n').filter((line) => !line.includes('[local path unavailable]')).join('\n').trim()
    : { ...value, value: value.value.split('\n').filter((line) => !line.includes('[local path unavailable]')).join('\n').trim() }
  if (!(typeof cleaned === 'string' ? cleaned : cleaned.value)) return undefined
  return markup(cleaned)
}
const positionParams = (model: Monaco.editor.ITextModel, position: Monaco.IPosition) => ({ textDocument: { uri: model.uri.toString() }, position: { line: position.lineNumber - 1, character: position.column - 1 } })
const toLspRange = (range: Monaco.IRange): LspRange => ({ start: { line: range.startLineNumber - 1, character: range.startColumn - 1 }, end: { line: range.endLineNumber - 1, character: range.endColumn - 1 } })

/** Native Monaco interactions, with semantic answers supplied by the generic service. */
export function registerJavaIntelligence(monaco: typeof import('monaco-editor/editor/editor.api.js'), options: JavaIntelligenceOptions): JavaIntelligenceRegistration {
  const { client } = options
  const disposables: Monaco.IDisposable[] = []
  const selector = { language: 'java', scheme: 'inmemory' }
  const actionCommandId = `visualJava.language.action.${++registrationId}`
  const completionCommandId = `${actionCommandId}.completion`
  const ownedPath = (model: Monaco.editor.ITextModel) => client.projectId ? documentPath(model.uri.toString(), client.projectId) : null
  const guarded = async <T>(model: Monaco.editor.ITextModel, method: string, params: unknown, token?: Monaco.CancellationToken): Promise<T | undefined> => {
    const path = ownedPath(model)
    if (!path || !client.hasDocument(path) || ['unavailable', 'failed', 'stopped'].includes(client.getSnapshot().status) || token?.isCancellationRequested) return undefined
    client.changeDocument(path, model.getValue())
    const version = model.getVersionId()
    const controller = new AbortController()
    const cancel = token?.onCancellationRequested(() => controller.abort())
    try {
      const result = await client.request<T>(method, params, { path, signal: controller.signal })
      if (token?.isCancellationRequested || model.isDisposed() || version !== model.getVersionId()) return undefined
      return result
    } catch { return undefined } finally { cancel?.dispose() }
  }
  const locations = (result?: LspLocation | LspLocationLink | (LspLocation | LspLocationLink)[] | null): Monaco.languages.LocationLink[] => {
    const items = result ? Array.isArray(result) ? result : [result] : []
    return items.flatMap((item) => {
      const uri = 'targetUri' in item ? item.targetUri : item.uri
      const path = client.projectId ? documentPath(uri, client.projectId) : null
      if (!path) return []
      return [{ uri: monaco.Uri.parse(documentUri(client.projectId!, path)), range: monacoRange('targetRange' in item ? item.targetRange : item.range), targetSelectionRange: 'targetSelectionRange' in item ? monacoRange(item.targetSelectionRange) : undefined, originSelectionRange: 'originSelectionRange' in item && item.originSelectionRange ? monacoRange(item.originSelectionRange) : undefined }]
    })
  }
  type CompletionList = { items: LspCompletionItem[]; isIncomplete?: boolean; itemDefaults?: { editRange?: LspRange | { insert: LspRange; replace: LspRange }; insertTextFormat?: number; data?: unknown } }
  const completionItems = new WeakMap<Monaco.languages.CompletionItem, { item: LspCompletionItem; model: Monaco.editor.ITextModel; generation: number; version: number }>()
  const kinds: Monaco.languages.CompletionItemKind[] = [monaco.languages.CompletionItemKind.Text, monaco.languages.CompletionItemKind.Method, monaco.languages.CompletionItemKind.Function, monaco.languages.CompletionItemKind.Constructor, monaco.languages.CompletionItemKind.Field, monaco.languages.CompletionItemKind.Variable, monaco.languages.CompletionItemKind.Class, monaco.languages.CompletionItemKind.Interface, monaco.languages.CompletionItemKind.Module, monaco.languages.CompletionItemKind.Property, monaco.languages.CompletionItemKind.Unit, monaco.languages.CompletionItemKind.Value, monaco.languages.CompletionItemKind.Enum, monaco.languages.CompletionItemKind.Keyword, monaco.languages.CompletionItemKind.Snippet, monaco.languages.CompletionItemKind.Color, monaco.languages.CompletionItemKind.File, monaco.languages.CompletionItemKind.Reference, monaco.languages.CompletionItemKind.Folder, monaco.languages.CompletionItemKind.EnumMember, monaco.languages.CompletionItemKind.Constant, monaco.languages.CompletionItemKind.Struct, monaco.languages.CompletionItemKind.Event, monaco.languages.CompletionItemKind.Operator, monaco.languages.CompletionItemKind.TypeParameter]
  const completion = (item: LspCompletionItem, fallback: Monaco.IRange, model: Monaco.editor.ITextModel): Monaco.languages.CompletionItem => {
    const range = item.textEdit ? 'range' in item.textEdit ? monacoRange(item.textEdit.range) : { insert: monacoRange(item.textEdit.insert), replace: monacoRange(item.textEdit.replace) } : fallback
    const result: Monaco.languages.CompletionItem = {
      label: item.label, kind: kinds[(item.kind ?? 1) - 1] ?? monaco.languages.CompletionItemKind.Text,
      detail: item.detail, documentation: markup(item.documentation), insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
      insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
      range, filterText: item.filterText, sortText: item.sortText, preselect: item.preselect,
      additionalTextEdits: item.additionalTextEdits?.map((edit) => ({ range: monacoRange(edit.range), text: edit.newText })),
      command: item.command ? { id: completionCommandId, title: item.command.title, arguments: [item.command, client.generation] } : undefined,
    }
    completionItems.set(result, { item, model, generation: client.generation, version: model.getVersionId() })
    return result
  }
  disposables.push(monaco.languages.registerCompletionItemProvider(selector, {
    triggerCharacters: ['.', '@'],
    provideCompletionItems: async (model, position, context, token) => {
      const result = await guarded<LspCompletionItem[] | CompletionList | null>(model, 'textDocument/completion', { ...positionParams(model, position), context: { triggerKind: context.triggerKind + 1, triggerCharacter: context.triggerCharacter } }, token)
      const word = model.getWordUntilPosition(position)
      const fallback = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
      const list = result && !Array.isArray(result) ? result : undefined
      const items = Array.isArray(result) ? result : list?.items ?? []
      return { suggestions: items.map((raw) => {
        const defaults = list?.itemDefaults
        const item = { ...raw, insertTextFormat: raw.insertTextFormat ?? defaults?.insertTextFormat, data: raw.data ?? defaults?.data }
        if (!item.textEdit && defaults?.editRange) item.textEdit = 'start' in defaults.editRange ? { range: defaults.editRange, newText: item.textEditText ?? item.insertText ?? item.label } : { ...defaults.editRange, newText: item.textEditText ?? item.insertText ?? item.label }
        return completion(item, fallback, model)
      }), incomplete: list?.isIncomplete }
    },
    resolveCompletionItem: async (item, token) => {
      const record = completionItems.get(item)
      if (!record || record.generation !== client.generation || record.model.isDisposed() || record.version !== record.model.getVersionId()) return item
      const resolved = await guarded<LspCompletionItem>(record.model, 'completionItem/resolve', record.item, token)
      return resolved ? completion({ ...record.item, ...resolved }, 'insert' in item.range ? item.range.insert : item.range, record.model) : item
    },
  }))
  disposables.push(monaco.languages.registerHoverProvider(selector, {
    provideHover: async (model, position, token) => {
      const result = await guarded<{ contents: LspMarkup | LspMarkup[]; range?: LspRange } | null>(model, 'textDocument/hover', positionParams(model, position), token)
      if (!result) return null
      return { contents: (Array.isArray(result.contents) ? result.contents : [result.contents]).map(hoverMarkup).filter((item): item is Monaco.IMarkdownString => Boolean(item?.value)), range: result.range ? monacoRange(result.range) : undefined }
    },
  }))
  disposables.push(monaco.languages.registerSignatureHelpProvider(selector, {
    signatureHelpTriggerCharacters: ['(', ','], signatureHelpRetriggerCharacters: [')'],
    provideSignatureHelp: async (model, position, token, context) => {
      type Signature = { label: string; documentation?: LspMarkup; parameters?: { label: string | [number, number]; documentation?: LspMarkup }[]; activeParameter?: number }
      const result = await guarded<{ signatures: Signature[]; activeSignature?: number; activeParameter?: number } | null>(model, 'textDocument/signatureHelp', { ...positionParams(model, position), context: { triggerKind: context.triggerKind + 1, triggerCharacter: context.triggerCharacter, isRetrigger: context.isRetrigger } }, token)
      if (!result) return null
      const index = result.activeSignature ?? 0
      return { value: { signatures: result.signatures.map((signature) => ({ label: signature.label, documentation: markup(signature.documentation), parameters: (signature.parameters ?? []).map((parameter) => ({ label: parameter.label, documentation: markup(parameter.documentation) })) })), activeSignature: index, activeParameter: result.signatures[index]?.activeParameter ?? result.activeParameter ?? 0 }, dispose() {} }
    },
  }))
  const symbolKind = (kind: number) => (kind >= 1 && kind <= 26 ? kind - 1 : monaco.languages.SymbolKind.Variable) as Monaco.languages.SymbolKind
  const documentSymbol = (symbol: LspDocumentSymbol): Monaco.languages.DocumentSymbol => ({
    name: symbol.name, detail: symbol.detail ?? '', kind: symbolKind(symbol.kind),
    tags: (symbol.tags ?? []) as Monaco.languages.SymbolTag[], range: monacoRange(symbol.range),
    selectionRange: monacoRange(symbol.selectionRange), children: symbol.children?.map(documentSymbol),
  })
  disposables.push(monaco.languages.registerDocumentSymbolProvider(selector, {
    displayName: 'Java language service',
    provideDocumentSymbols: async (model, token) => {
      const result = await guarded<(LspDocumentSymbol | LspSymbolInformation)[] | null>(model, 'textDocument/documentSymbol', { textDocument: { uri: model.uri.toString() } }, token)
      return (result ?? []).flatMap((symbol) => 'location' in symbol
        ? client.projectId && documentPath(symbol.location.uri, client.projectId) === ownedPath(model)
          ? [{ name: symbol.name, detail: symbol.containerName ?? '', kind: symbolKind(symbol.kind), tags: (symbol.tags ?? []) as Monaco.languages.SymbolTag[], range: monacoRange(symbol.location.range), selectionRange: monacoRange(symbol.location.range) }]
          : []
        : [documentSymbol(symbol)])
    },
  }))
  disposables.push(monaco.languages.registerDefinitionProvider(selector, {
    provideDefinition: async (model, position, token) => locations(await guarded(model, 'textDocument/definition', positionParams(model, position), token)),
  }))
  disposables.push(monaco.languages.registerReferenceProvider(selector, {
    provideReferences: async (model, position, context, token) => locations(await guarded(model, 'textDocument/references', { ...positionParams(model, position), context }, token)),
  }))
  disposables.push(monaco.languages.registerRenameProvider(selector, {
    resolveRenameLocation: async (model, position, token) => {
      const result = await guarded<LspRange | { range: LspRange; placeholder: string } | { defaultBehavior: boolean } | null>(model, 'textDocument/prepareRename', positionParams(model, position), token)
      if (!result || 'defaultBehavior' in result) return { range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: '', rejectReason: 'The Java language service could not prepare this rename.' }
      const range = monacoRange('range' in result ? result.range : result)
      return { range, text: 'placeholder' in result ? result.placeholder : model.getValueInRange(range) }
    },
    provideRenameEdits: async (model, position, newName, token) => {
      if (!options.applyEdit) return { edits: [], rejectReason: 'Workspace draft edits are unavailable.' }
      const result = await guarded<LspWorkspaceEdit | null>(model, 'textDocument/rename', { ...positionParams(model, position), newName }, token)
      if (!result) return { edits: [], rejectReason: 'Rename unavailable or source changed; retry when Java is ready.' }
      try {
        await options.applyEdit(result)
        // The host has applied the entire prevalidated transaction with model undo.
        return { edits: [] }
      } catch (error) { return { edits: [], rejectReason: error instanceof Error ? error.message : String(error) } }
    },
  }))
  const execute = async (command: LspCommand, generation: number) => {
    if (generation !== client.generation) throw new Error('This Java action belongs to an older project')
    const result = await client.request<unknown>('workspace/executeCommand', { command: command.command, arguments: command.arguments ?? [] })
    if (result && typeof result === 'object' && ('changes' in result || 'documentChanges' in result)) {
      if (!options.applyEdit) throw new Error('Workspace draft edits are unavailable')
      await options.applyEdit(result as LspWorkspaceEdit)
    }
  }
  const runAction = async (action: LspCodeAction, model: Monaco.editor.ITextModel, generation: number, version: number) => {
    if (generation !== client.generation || model.isDisposed() || model.getVersionId() !== version) throw new Error('Source changed since this Java action was prepared')
    const answer = action.data !== undefined && !action.edit && !action.command ? await guarded<LspCodeAction>(model, 'codeAction/resolve', action) : action
    const resolved = answer ? { ...action, ...answer } : null
    if (!resolved) throw new Error('Java code action unavailable')
    if (resolved.disabled) throw new Error(resolved.disabled.reason)
    if (resolved.edit) {
      if (!options.applyEdit) throw new Error('Workspace draft edits are unavailable')
      await options.applyEdit(resolved.edit)
    }
    if (resolved.command) await execute(resolved.command, generation)
  }
  disposables.push(monaco.editor.registerCommand(actionCommandId, (_accessor, action: LspCodeAction, model: Monaco.editor.ITextModel, generation: number, version: number) => runAction(action, model, generation, version).catch((error) => options.onError?.(error instanceof Error ? error.message : String(error)))))
  disposables.push(monaco.editor.registerCommand(completionCommandId, (_accessor, command: LspCommand, generation: number) => execute(command, generation).catch((error) => options.onError?.(error instanceof Error ? error.message : String(error)))))
  const actions = async (model: Monaco.editor.ITextModel, range: Monaco.IRange, only?: string, token?: Monaco.CancellationToken) => {
    const uri = model.uri.toString()
    const diagnostics: LspDiagnostic[] = client.getSnapshot().diagnostics.find((group) => group.uri === uri)?.diagnostics ?? []
    const result = await guarded<(LspCodeAction | LspCommand)[] | null>(model, 'textDocument/codeAction', { textDocument: { uri }, range: toLspRange(range), context: { diagnostics: diagnostics.filter((diagnostic) => diagnostic.range.start.line <= range.endLineNumber - 1 && diagnostic.range.end.line >= range.startLineNumber - 1), only: only ? [only] : undefined } }, token)
    return (result ?? []).map((action): LspCodeAction => typeof action.command === 'string' ? { title: action.title, command: action as LspCommand } : action as LspCodeAction)
  }
  disposables.push(monaco.languages.registerCodeActionProvider(selector, {
    provideCodeActions: async (model, range, context, token) => ({ actions: (await actions(model, range, context.only, token)).map((action) => ({ title: action.title, kind: action.kind, isPreferred: action.isPreferred, disabled: action.disabled?.reason ?? (options.applyEdit ? undefined : 'Workspace draft edits are unavailable'), command: { id: actionCommandId, title: action.title, arguments: [action, model, client.generation, model.getVersionId()] } })), dispose() {} }),
  }, { providedCodeActionKinds: ['quickfix', 'refactor', 'source.organizeImports'] }))
  disposables.push(monaco.editor.registerEditorOpener({
    openCodeEditor: async (_source, resource, selection) => {
      const path = client.projectId ? documentPath(resource.toString(), client.projectId) : null
      if (!path || !options.onOpen) return false
      await options.onOpen({ path, line: selection ? 'startLineNumber' in selection ? selection.startLineNumber : selection.lineNumber : 1, column: selection ? 'startColumn' in selection ? selection.startColumn : selection.column : 1 })
      return true
    },
  }))
  const updateMarkers = () => {
    const snapshot = client.getSnapshot()
    monaco.editor.getModels().forEach((model) => {
      const path = snapshot.projectId ? documentPath(model.uri.toString(), snapshot.projectId) : null
      const group = path ? snapshot.diagnostics.find((item) => documentPath(item.uri, snapshot.projectId!) === path) : undefined
      monaco.editor.setModelMarkers(model, 'language', (group?.diagnostics ?? []).map((diagnostic) => ({ ...monacoRange(diagnostic.range), severity: diagnostic.severity === 1 ? monaco.MarkerSeverity.Error : diagnostic.severity === 2 ? monaco.MarkerSeverity.Warning : diagnostic.severity === 4 ? monaco.MarkerSeverity.Hint : monaco.MarkerSeverity.Info, message: diagnostic.message, source: diagnostic.source ?? 'Java language service', code: diagnostic.code?.toString(), tags: diagnostic.tags })))
    })
  }
  const unsubscribe = client.subscribe(updateMarkers)
  disposables.push({ dispose: unsubscribe }, monaco.editor.onDidCreateModel(updateMarkers))
  return {
    dispose() { disposables.forEach((disposable) => disposable.dispose()); monaco.editor.getModels().forEach((model) => monaco.editor.setModelMarkers(model, 'language', [])) },
    async workspaceSymbols(query, signal) {
      try { return (await client.request<LspWorkspaceSymbol[] | null>('workspace/symbol', { query }, { signal }) ?? []).filter((symbol) => client.projectId && documentPath(symbol.location.uri, client.projectId)) }
      catch { return [] }
    },
    async organizeImports(model) {
      const result = await actions(model, model.getFullModelRange(), 'source.organizeImports')
      if (!result.length) throw new Error('Organize imports is unavailable for this Java document')
      await runAction(result[0], model, client.generation, model.getVersionId())
    },
  }
}
let registrationId = 0
