import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fuzzyScore, rankPickerItems } from './fuzzy'
import { defaultClassFolder, javaClassContent, javaClassPath } from './classCreation'
import { explorerMenuCommands, menuTargetIndex, tabMenuCommands } from './contextMenus'
import { WorkspacePicker } from './WorkspacePicker'
import { ideCommandDefinitions } from './commands'
import type { JavaProject } from './javaProject'

const project = (sourceRoots: string[], testSourceRoots: string[] = []): JavaProject => ({
  projectId: 'test', revision: '1', buildSystem: 'plain', status: 'ready', diagnostic: null,
  sourceRoots, testSourceRoots, outputRoots: [], dependencies: [], runnableTargets: [], elapsedMs: 0,
})

describe('shell fuzzy lookup', () => {
  it('accepts subsequences and path/name tokens instead of requiring a substring', () => {
    expect(fuzzyScore('QOp', 'Quick Open')).not.toBeNull()
    expect(fuzzyScore('acct srv', 'src/accounts/AccountService.java')).not.toBeNull()
    expect(fuzzyScore('zxq', 'AccountService.java')).toBeNull()
  })
  it('ranks contiguous and basename matches above scattered path matches', () => {
    const results = rankPickerItems([
      { id: 'scattered', label: 'AxByC.java', detail: 'src/main/java' },
      { id: 'contiguous', label: 'ABC.java', detail: 'src/main/java' },
      { id: 'path', label: 'Other.java', detail: 'src/abc/Other.java' },
    ], 'abc')
    expect(results[0].id).toBe('contiguous')
    expect(results.map((item) => item.id)).toContain('scattered')
  })
  it('keeps existing order for an empty query and rejects unrelated items', () => {
    const items = [{ id: 'recent', label: 'Z.java' }, { id: 'second', label: 'A.java' }]
    expect(rankPickerItems(items, '')).toEqual(items)
    expect(rankPickerItems(items, 'doesNotExist')).toEqual([])
  })
  it('normalizes query whitespace and case while preserving stable equal-score order', () => {
    expect(fuzzyScore('  ACCT   SRV ', 'src/accounts/AccountService.java')).toBe(fuzzyScore('acct srv', 'src/accounts/AccountService.java'))
    const items = [{ id: 'first', label: 'Account.java' }, { id: 'second', label: 'Account.java' }]
    expect(rankPickerItems(items, 'AcCt').map((item) => item.id)).toEqual(['first', 'second'])
    expect(rankPickerItems(items, '   ')).toEqual(items)
  })
  it('can find a command by its registry id and a file by folder and basename together', () => {
    const items = [
      { id: 'console', label: 'Workbench: Show Console', keywords: 'workbench.console' },
      { id: 'account', label: 'AccountService.java', detail: 'src/accounts/AccountService.java' },
    ]
    expect(rankPickerItems(items, 'workbench.console').map((item) => item.id)).toEqual(['console'])
    expect(rankPickerItems(items, 'accounts asj').map((item) => item.id)).toEqual(['account'])
  })
  it('matches command categories and preserves disabled reasons in the keyboard list', () => {
    const items = [{ id: 'debug.stepInto', label: 'Debug: Step Into', enabled: false, reason: 'Stepping requires a paused debugger', shortcut: 'F11' }]
    expect(rankPickerItems(items, 'dsi')).toEqual(items)
    const html = renderToStaticMarkup(<WorkspacePicker mode="commands" items={items} onChoose={() => {}} onClose={() => {}}/>)
    expect(html).toContain('role="combobox"')
    expect(html).toContain('role="listbox"')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('Stepping requires a paused debugger')
    expect(html).toContain('F11')
  })
})

describe('canonical shell menus and navigation', () => {
  it('provides exactly the seven conventional tab commands', () => {
    expect(tabMenuCommands).toEqual(['editor.close', 'editor.closeOthers', 'editor.closeRight', 'editor.closeSaved', 'resource.rename', 'explorer.reveal', 'resource.copyPath'])
    expect(tabMenuCommands.every((id) => ideCommandDefinitions[id])).toBe(true)
  })
  it('shows file actions for files and creation actions for folders/root', () => {
    expect(explorerMenuCommands('file')).toEqual(['file.open', 'resource.rename', 'resource.delete', 'resource.copyPath', 'explorer.reveal'])
    expect(explorerMenuCommands('directory')).toEqual(['file.new', 'java.newClass', 'folder.new', 'resource.rename', 'resource.delete', 'resource.copyPath', 'explorer.reveal'])
    expect(explorerMenuCommands(null)).toEqual(['file.new', 'java.newClass', 'folder.new'])
  })
  it('wraps keyboard navigation and supports Home/End and empty lists', () => {
    expect(menuTargetIndex('ArrowDown', 6, 7)).toBe(0)
    expect(menuTargetIndex('ArrowUp', 0, 7)).toBe(6)
    expect(menuTargetIndex('Home', 4, 7)).toBe(0)
    expect(menuTargetIndex('End', 4, 7)).toBe(6)
    expect(menuTargetIndex('ArrowDown', 0, 0)).toBeNull()
    expect(menuTargetIndex('ArrowDown', -1, 7)).toBe(0)
    expect(menuTargetIndex('ArrowUp', -1, 7)).toBe(6)
    expect(menuTargetIndex('Enter', 0, 7)).toBeNull()
  })
  it('offers canonical Reveal and Copy Path for both resource kinds without duplicate actions', () => {
    for (const kind of ['file', 'directory'] as const) {
      const ids = explorerMenuCommands(kind)
      expect(ids).toContain('explorer.reveal')
      expect(ids).toContain('resource.copyPath')
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids.every((id) => ideCommandDefinitions[id])).toBe(true)
    }
  })
})

describe('New Java Class source and package conventions', () => {
  it('accepts a class name or optional extension within the selected folder', () => {
    expect(javaClassPath('src/main/java/accounts', 'Account')).toBe('src/main/java/accounts/Account.java')
    expect(javaClassPath('src/main/java/accounts', 'Account.java')).toBe('src/main/java/accounts/Account.java')
    expect(javaClassPath('.', 'Account')).toBe('Account.java')
  })
  it('uses plain, Maven/Gradle and test source roots without including them in the package', () => {
    expect(javaClassContent('Account.java', project(['.']))).toBe('public class Account {\n}\n')
    expect(javaClassContent('src/accounts/Account.java', project(['src']))).toBe('package accounts;\n\npublic class Account {\n}\n')
    expect(javaClassContent('src/main/java/com/example/Account.java', project(['src/main/java']))).toContain('package com.example;')
    expect(javaClassContent('src/test/java/com/example/AccountTest.java', project(['src/main/java'], ['src/test/java']))).toContain('package com.example;')
    expect(defaultClassFolder(project(['src/main/java']))).toBe('src/main/java')
  })
  it('chooses the most specific declared source root', () => {
    expect(javaClassContent('src/generated/accounts/Account.java', project(['src', 'src/generated']))).toContain('package accounts;')
  })
  it('supports Unicode Java names and rejects keywords, traversal and invalid packages', () => {
    expect(javaClassPath('src', 'État')).toBe('src/État.java')
    for (const name of ['class', 'record', '_', 'bad-name', '../Escape', 'com.Account']) expect(() => javaClassPath('src', name)).toThrow()
    expect(() => javaClassContent('src/bad-name/Account.java', project(['src']))).toThrow('valid Java package')
    expect(() => javaClassContent('assets/Account.java', project(['src']))).toThrow('Java source folder')
  })
  it('handles source-root files and package-boundary lookalikes without guessing a package', () => {
    expect(javaClassContent('src/main/java/Account.java', project(['src/main/java']))).toBe('public class Account {\n}\n')
    expect(() => javaClassContent('src/main/javaExtra/Account.java', project(['src/main/java']))).toThrow('Java source folder')
    expect(() => javaClassContent('src/class/Account.java', project(['src']))).toThrow('valid Java package')
    expect(javaClassContent('src/record/Account.java', project(['src']))).toContain('package record;')
  })
  it('uses conventional roots while metadata is pending, and respects an explicit empty model', () => {
    expect(defaultClassFolder(null)).toBe('.')
    expect(javaClassContent('src/main/java/com/example/Account.java', null)).toContain('package com.example;')
    expect(javaClassContent('src/test/java/com/example/AccountTest.java', null)).toContain('package com.example;')
    expect(() => javaClassContent('Account.java', project([]))).toThrow('Java source folder')
  })
})
