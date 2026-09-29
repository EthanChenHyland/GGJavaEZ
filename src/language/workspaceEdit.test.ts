import { describe, expect, it, vi } from 'vitest'
import { LanguageClient } from './client'
import { documentPath, documentUri, type LspWorkspaceEdit } from './protocol'
import { editedText, isApplyingWorkspaceEdit, preflightWorkspaceEdit, commitWorkspaceEdit, type WorkspaceEditHost } from './workspaceEdit'

const range = (start: number, end: number) => ({ start: { line: 0, character: start }, end: { line: 0, character: end } })
const editFor = (uri: string): LspWorkspaceEdit => ({ changes: { [uri]: [{ range: range(6, 9), newText: 'User' }] } })
const fakeMonaco = { Uri: { parse: (uri: string) => ({ toString: () => uri }) }, editor: { getModel: () => null } } as unknown as typeof import('monaco-editor/editor/editor.api.js')
const client = () => { const value = new LanguageClient({ pollMs: 0 }); Object.defineProperty(value, 'projectId', { get: () => 'p1' }); return value }

describe('semantic workspace edits', () => {
  it('rejects foreign and noncanonical document URIs', () => {
    expect(documentPath(documentUri('p1', 'src/My Main.java'), 'p1')).toBe('src/My Main.java')
    expect(documentPath('inmemory://ggjavaez/p1/src%2FMain.java', 'p1')).toBeNull()
    expect(documentPath(documentUri('p2', 'Main.java'), 'p1')).toBeNull()
  })

  it('preloads every target and rejects invalid ranges before mutating drafts', async () => {
    const loadFile = vi.fn(async (path: string) => ({ content: path === 'A.java' ? 'class Old {}' : 'class New {}', revision: 'r1' }))
    const commitDrafts = vi.fn()
    const host: WorkspaceEditHost = { getFileState: () => undefined, loadFile, commitDrafts }
    const service = client()
    const edit: LspWorkspaceEdit = { changes: {
      [documentUri('p1', 'A.java')]: [{ range: range(6, 9), newText: 'Good' }],
      [documentUri('p1', 'B.java')]: [{ range: range(100, 101), newText: 'Bad' }],
    } }
    await expect(preflightWorkspaceEdit(fakeMonaco, service, edit, host)).rejects.toThrow('outside the document')
    expect(loadFile).toHaveBeenCalledTimes(2)
    expect(commitDrafts).not.toHaveBeenCalled()
    service.dispose()
  })

  it('rolls back Monaco when the atomic draft commit fails', async () => {
    const uri = documentUri('p1', 'Main.java')
    let text = 'class Old {}'
    const model = {
      uri: { toString: () => uri }, getVersionId: () => 1, getValue: () => text, isDisposed: () => false,
      pushStackElement: vi.fn(),
      pushEditOperations: (_: unknown, edits: { range: { startColumn: number; endColumn: number }; text: string }[], inverse: (edits: unknown[]) => void) => {
        const previous = text
        text = text.slice(0, edits[0].range.startColumn - 1) + edits[0].text + text.slice(edits[0].range.endColumn - 1)
        inverse([{ range: range(0, text.length), text: previous }])
      },
      applyEdits: (edits: { text: string }[]) => { text = edits[0].text },
    }
    const monaco = { Uri: fakeMonaco.Uri, editor: { getModel: () => model } } as unknown as typeof import('monaco-editor/editor/editor.api.js')
    const host: WorkspaceEditHost = { getFileState: () => ({ content: 'class Old {}', revision: 'r1' }), loadFile: vi.fn(), commitDrafts: () => { expect(isApplyingWorkspaceEdit()).toBe(true); throw new Error('storage full') } }
    const service = client()
    const prepared = await preflightWorkspaceEdit(monaco, service, editFor(uri), host)
    expect(() => commitWorkspaceEdit(monaco, service, prepared, host)).toThrow('storage full')
    expect(text).toBe('class Old {}')
    expect(isApplyingWorkspaceEdit()).toBe(false)
    service.dispose()
  })

  it('rejects resource operations and overlapping ranges', () => {
    expect(() => editedText('abcdef', [{ range: range(1, 3), newText: 'x' }, { range: range(2, 4), newText: 'y' }])).toThrow('overlap')
  })
})
