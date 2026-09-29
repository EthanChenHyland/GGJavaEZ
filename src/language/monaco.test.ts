import { describe, expect, it, vi } from 'vitest'
import type * as Monaco from 'monaco-editor'
import type { LanguageClient } from './client'
import { registerJavaIntelligence } from './monaco'
import { documentUri } from './protocol'

describe('Monaco Java language providers', () => {
  it('uses semantic service payloads for completion, definitions and outline, and rejects stale model results', async () => {
    const uri = documentUri('p1', 'src/My Main.java')
    const range = { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } }
    const model = { uri: { toString: () => uri }, getValue: () => 'class Main {}', getVersionId: vi.fn(() => 1), isDisposed: () => false, getWordUntilPosition: () => ({ startColumn: 7, endColumn: 11 }) } as unknown as Monaco.editor.ITextModel
    const providers: Record<string, unknown> = {}
    const disposable = () => ({ dispose: vi.fn() })
    const register = (name: string) => (_selector: unknown, provider: unknown) => { providers[name] = provider; return disposable() }
    const kinds = Object.fromEntries('Text Method Function Constructor Field Variable Class Interface Module Property Unit Value Enum Keyword Snippet Color File Reference Folder EnumMember Constant Struct Event Operator TypeParameter'.split(' ').map((name, index) => [name, index]))
    const monaco = {
      Uri: { parse: (value: string) => ({ toString: () => value }) }, Range: class { constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {} },
      MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
      languages: { CompletionItemKind: kinds, SymbolKind: { Variable: 12 }, CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
        registerCompletionItemProvider: register('completion'), registerHoverProvider: register('hover'), registerSignatureHelpProvider: register('signature'),
        registerDefinitionProvider: register('definition'), registerReferenceProvider: register('references'), registerRenameProvider: register('rename'),
        registerDocumentSymbolProvider: register('symbols'), registerCodeActionProvider: register('actions') },
      editor: { registerCommand: () => disposable(), registerEditorOpener: () => disposable(), onDidCreateModel: () => disposable(),
        getModels: () => [model], setModelMarkers: vi.fn() },
    } as unknown as typeof import('monaco-editor/editor/editor.api.js')
    let releaseHover!: (value: unknown) => void
    const delayedHover = new Promise((resolve) => { releaseHover = resolve })
    const request = vi.fn(async (method: string) => {
      if (method === 'textDocument/completion') return [{ label: 'Person', kind: 7, detail: 'class Person', insertText: 'Person', data: { opaque: true } }]
      if (method === 'completionItem/resolve') return { label: 'Person', kind: 7, documentation: { kind: 'markdown', value: 'A person' } }
      if (method === 'textDocument/definition') return [{ uri, range }, { uri: 'file:///etc/passwd', range }]
      if (method === 'textDocument/documentSymbol') return [{ name: 'Main', kind: 5, range, selectionRange: range }]
      if (method === 'textDocument/hover') return delayedHover
      return null
    })
    const client = { projectId: 'p1', generation: 1, getSnapshot: () => ({ projectId: 'p1', generation: 1, status: 'ready', diagnostics: [] }),
      hasDocument: () => true, changeDocument: vi.fn(), request, subscribe: (listener: () => void) => { listener(); return vi.fn() } } as unknown as LanguageClient
    const registration = registerJavaIntelligence(monaco, { client })
    const token = { isCancellationRequested: false, onCancellationRequested: () => disposable() } as unknown as Monaco.CancellationToken
    const position = { lineNumber: 1, column: 9 } as Monaco.Position
    const completion = providers.completion as Monaco.languages.CompletionItemProvider
    const offered = await completion.provideCompletionItems(model, position, { triggerKind: 0 }, token)
    expect(offered?.suggestions[0]).toMatchObject({ label: 'Person', detail: 'class Person' })
    const resolved = await completion.resolveCompletionItem!(offered!.suggestions[0], token)
    expect(resolved).toMatchObject({ documentation: { value: 'A person' } })
    const definition = providers.definition as Monaco.languages.DefinitionProvider
    expect(await definition.provideDefinition(model, position, token)).toHaveLength(1)
    const symbols = providers.symbols as Monaco.languages.DocumentSymbolProvider
    expect(await symbols.provideDocumentSymbols(model, token)).toMatchObject([{ name: 'Main', kind: 4 }])
    const hover = (providers.hover as Monaco.languages.HoverProvider).provideHover(model, position, token)
    await vi.waitFor(() => expect(request.mock.calls.some(([method]) => method === 'textDocument/hover')).toBe(true))
    model.getVersionId = () => 2
    releaseHover({ contents: 'old documentation' })
    expect(await hover).toBeNull()
    registration.dispose()
  })
})
