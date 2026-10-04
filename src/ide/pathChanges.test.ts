import { describe, expect, it } from 'vitest'
import { assertWorkspacePath, pathIsWithin, renamedPath, transitionWorkspacePaths } from './pathChanges'

function workspace() {
  return {
    tabs: [
      { path: 'src/a/Active.java', content: 'saved', draft: 'unsaved', revision: 'r1' },
      { path: 'src/ab/Other.java', content: 'other', draft: 'other', revision: 'r2' },
    ],
    drafts: {
      'src/a/Active.java': { draft: 'unsaved', revision: 'r1' },
      'src/a/nested/Closed.java': { draft: 'closed unsaved', revision: 'old-disk-revision' },
      'src/ab/Other.java': { draft: 'other', revision: 'r2' },
    },
    activePath: 'src/a/Active.java',
    breakpoints: [{ fileId: 'src/a/nested/Closed.java', line: 9 }, { fileId: 'src/ab/Other.java', line: 2 }],
    workingDirectory: 'src/a/nested',
    navigation: { path: 'src/a/Active.java', line: 4, column: 2 },
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

describe('workspace path syntax and ancestry', () => {
  it('uses segment boundaries without conflating sibling prefixes or case', () => {
    expect(pathIsWithin('src/a', 'src/a')).toBe(true)
    expect(pathIsWithin('src/a/nested/File.java', 'src/a')).toBe(true)
    expect(pathIsWithin('src/ab/File.java', 'src/a')).toBe(false)
    expect(pathIsWithin('src/A/File.java', 'src/a')).toBe(false)
    expect(renamedPath('src/a/nested/File.java', 'src/a', 'lib/new')).toBe('lib/new/nested/File.java')
    expect(renamedPath('src/ab/File.java', 'src/a', 'lib/new')).toBe('src/ab/File.java')
  })
  it.each(['', '/absolute', 'C:/host', 'src\\File.java', '../escape', 'src/../escape', './File.java', 'src//File.java', 'src/', 'src/\0File.java'])('rejects noncanonical path %j', (path) => {
    expect(() => assertWorkspacePath(path)).toThrow('Invalid project-relative path')
  })
  it('preserves Unicode and spaces exactly; native name rules belong to the server', () => {
    expect(() => assertWorkspacePath('src/Δ/Å File.java')).not.toThrow()
    expect(renamedPath('src/Δ/Å File.java', 'src/Δ', 'src/δ')).toBe('src/δ/Å File.java')
  })
})

describe('immutable workspace rename', () => {
  it('moves every tracked descendant including a closed draft, retaining exact content and original revision', () => {
    const original = freeze(workspace())
    const result = transitionWorkspacePaths(original, { kind: 'rename', from: 'src/a', to: 'lib/new' })
    expect(result.state.tabs[0]).toEqual({ ...original.tabs[0], path: 'lib/new/Active.java' })
    expect(result.state.tabs[1]).toBe(original.tabs[1])
    expect(result.state.drafts['lib/new/nested/Closed.java']).toBe(original.drafts['src/a/nested/Closed.java'])
    expect(result.state.drafts).not.toHaveProperty('src/a/Active.java')
    expect(result.state.activePath).toBe('lib/new/Active.java')
    expect(result.state.breakpoints).toEqual([{ fileId: 'lib/new/nested/Closed.java', line: 9 }, original.breakpoints[1]])
    expect(result.state.navigation).toEqual({ path: 'lib/new/Active.java', line: 4, column: 2 })
    expect(result.state.workingDirectory).toBe('lib/new/nested')
    expect(result.removedTabs).toEqual([])
    expect(result.removedDrafts).toEqual({})
    expect(result.workingDirectoryDeleted).toBe(false)
    expect(result.affectedPaths).toContain('src/a/nested/Closed.java')
    expect(original).toEqual(workspace())
  })
  it('renames an inactive file without changing active selection or sibling state', () => {
    const original = freeze(workspace())
    const result = transitionWorkspacePaths(original, { kind: 'rename', from: 'src/ab/Other.java', to: 'src/ab/Renamed.java' })
    expect(result.state.tabs.map((tab) => tab.path)).toEqual(['src/a/Active.java', 'src/ab/Renamed.java'])
    expect(result.state.activePath).toBe(original.activePath)
    expect(result.state.navigation).toBe(original.navigation)
    expect(result.state.workingDirectory).toBe(original.workingDirectory)
  })
  it('rejects an open-tab/closed-draft destination collision before changing anything', () => {
    const original = freeze(workspace())
    expect(() => transitionWorkspacePaths(original, { kind: 'rename', from: 'src/a/Active.java', to: 'src/a/nested/Closed.java' })).toThrow('Workspace path collision')
    expect(original).toEqual(workspace())
  })
  it('rejects collisions involving folder descendants', () => {
    const original = freeze({ ...workspace(), drafts: { ...workspace().drafts,
      'lib/new/nested/Closed.java': { draft: 'destination draft', revision: 'r3' },
    } })
    expect(() => transitionWorkspacePaths(original, { kind: 'rename', from: 'src/a', to: 'lib/new' })).toThrow('Workspace path collision: lib/new/nested/Closed.java')
    expect(original.drafts['src/a/nested/Closed.java'].draft).toBe('closed unsaved')
  })
  it('rejects a move into itself and accepts a no-op or case-only path change', () => {
    const original = freeze(workspace())
    expect(() => transitionWorkspacePaths(original, { kind: 'rename', from: 'src/a', to: 'src/a/child' })).toThrow('into itself')
    expect(transitionWorkspacePaths(original, { kind: 'rename', from: 'src/a', to: 'src/a' }).state).toEqual(original)
    expect(transitionWorkspacePaths(original, { kind: 'rename', from: 'src/a', to: 'src/A' }).state.tabs[0].path).toBe('src/A/Active.java')
  })
  it('does not rewrite recorded source snapshots attached by a host', () => {
    const recorded = freeze({ sources: [{ fileId: 'src/a/Active.java', content: 'saved', sha256: 'recorded-hash' }] })
    const original = freeze({ ...workspace(), recorded })
    const result = transitionWorkspacePaths(original, { kind: 'rename', from: 'src/a', to: 'lib/new' })
    expect(result.state).toHaveProperty('recorded', recorded)
    expect(recorded.sources[0].fileId).toBe('src/a/Active.java')
  })
  it('constructs a safe draft dictionary even for an ordinary __proto__ filename', () => {
    const state = { ...workspace(), drafts: Object.fromEntries([['src/Closed.java', { draft: 'keep', revision: 'r1' }]]) }
    const result = transitionWorkspacePaths(state, { kind: 'rename', from: 'src/Closed.java', to: '__proto__' })
    expect(Object.hasOwn(result.state.drafts, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(result.state.drafts)).toBe(Object.prototype)
    expect(result.state.drafts['__proto__']).toEqual({ draft: 'keep', revision: 'r1' })
  })
})

describe('immutable workspace delete', () => {
  it('removes descendants and returns dirty content for explicit recovery/discard while preserving siblings', () => {
    const original = freeze(workspace())
    const result = transitionWorkspacePaths(original, { kind: 'delete', path: 'src/a' })
    expect(result.state.tabs).toEqual([original.tabs[1]])
    expect(result.state.drafts).toEqual({ 'src/ab/Other.java': original.drafts['src/ab/Other.java'] })
    expect(result.state.activePath).toBe('src/ab/Other.java')
    expect(result.state.breakpoints).toEqual([original.breakpoints[1]])
    expect(result.state.navigation).toBeNull()
    expect(result.state.workingDirectory).toBeNull()
    expect(result.workingDirectoryDeleted).toBe(true)
    expect(result.removedTabs).toEqual([original.tabs[0]])
    expect(result.removedDrafts).toEqual({ 'src/a/Active.java': original.drafts['src/a/Active.java'], 'src/a/nested/Closed.java': original.drafts['src/a/nested/Closed.java'] })
    expect(original).toEqual(workspace())
  })
  it('preserves project-root cwd and unrelated navigation when deleting an inactive file', () => {
    const original = freeze({ ...workspace(), workingDirectory: '.' })
    const result = transitionWorkspacePaths(original, { kind: 'delete', path: 'src/ab/Other.java' })
    expect(result.state.activePath).toBe(original.activePath)
    expect(result.state.navigation).toBe(original.navigation)
    expect(result.state.workingDirectory).toBe('.')
    expect(result.workingDirectoryDeleted).toBe(false)
  })
  it('clears the last active tab and already absent navigation/cwd without inventing replacements', () => {
    const original = freeze({ ...workspace(), tabs: [workspace().tabs[0]], workingDirectory: null, navigation: null })
    const result = transitionWorkspacePaths(original, { kind: 'delete', path: 'src' })
    expect(result.state.tabs).toEqual([])
    expect(result.state.activePath).toBeNull()
    expect(result.state.workingDirectory).toBeNull()
    expect(result.state.navigation).toBeNull()
    expect(result.workingDirectoryDeleted).toBe(false)
  })
})
