import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ProjectEntry } from './contracts'
import { CommandMenu } from '../shell/dialogs/CommandMenu'
import { explorerMenuCommands } from './contextMenus'
import { ideCommandDefinitions, type CommandAvailability, type CommandContext, type IdeCommandId } from './commands'
export { menuTargetIndex } from './contextMenus'

export type TreeAction = 'class' | 'file' | 'folder' | 'rename' | 'delete' | 'reveal' | 'copy' | 'open' | 'refresh'
interface VisibleEntry { entry: ProjectEntry; depth: number; parent: string | null }

function visibleEntries(tree: ProjectEntry[], collapsed: ReadonlySet<string>, depth = 1, parent: string | null = null): VisibleEntry[] {
  return tree.flatMap((entry) => [{ entry, depth, parent }, ...(entry.kind === 'directory' && !collapsed.has(entry.path) ? visibleEntries(entry.children ?? [], collapsed, depth + 1, entry.path) : [])])
}

export function ProjectExplorer({ tree, active, collapsed, onToggle, onOpen, onAction, availability, getCommandContext, onCommand }: {
  tree: ProjectEntry[]; active: string; collapsed: ReadonlySet<string>
  availability?: (id: IdeCommandId, entry: ProjectEntry | null, context?: CommandContext) => CommandAvailability
  getCommandContext?: (entry: ProjectEntry | null) => CommandContext
  onCommand?: (id: IdeCommandId, context: CommandContext) => void
  onToggle: (path: string) => void; onOpen: (path: string) => void; onAction: (action: TreeAction, entry: ProjectEntry | null) => void
}) {
  const visible = useMemo(() => visibleEntries(tree, collapsed), [tree, collapsed])
  const [focused, setFocused] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ entry: ProjectEntry | null; x: number; y: number; context?: CommandContext } | null>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const focusPath = (path: string) => { setFocused(path); requestAnimationFrame(() => rowRefs.current.get(path)?.focus()) }
  const menuAt = (entry: ProjectEntry | null, x: number, y: number) => {
    setMenu({ entry, x, y, context: getCommandContext?.(entry) })
  }
  const action = (kind: TreeAction, entry: ProjectEntry | null) => { setMenu(null); onAction(kind, entry) }
  const onTreeKey = (event: React.KeyboardEvent<HTMLButtonElement>, row: VisibleEntry) => {
    const index = visible.findIndex((item) => item.entry.path === row.entry.path)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); focusPath(visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].entry.path)
    } else if (event.key === 'ArrowRight') {
      if (row.entry.kind === 'directory') { event.preventDefault(); if (collapsed.has(row.entry.path)) onToggle(row.entry.path); else if (visible[index + 1]?.parent === row.entry.path) focusPath(visible[index + 1].entry.path) }
    } else if (event.key === 'ArrowLeft') {
      if (row.entry.kind === 'directory' && !collapsed.has(row.entry.path)) { event.preventDefault(); onToggle(row.entry.path) }
      else if (row.parent) { event.preventDefault(); focusPath(row.parent) }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (row.entry.kind === 'directory') onToggle(row.entry.path)
      else onOpen(row.entry.path)
    } else if (event.key === 'F2') { event.preventDefault(); action('rename', row.entry) }
    else if (event.key === 'Delete') { event.preventDefault(); action('delete', row.entry) }
    else if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
      event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); menuAt(row.entry, rect.left + 24, rect.bottom)
    }
  }
  // Changing a Shell surface must not rebuild thousands of unchanged file
  // rows. Event handlers still dispatch through the current committed props,
  // including project ownership and menu availability after a workspace change.
  const callbacks = useRef({onTreeKey,menuAt,onToggle,onOpen})
  useLayoutEffect(()=>{callbacks.current={onTreeKey,menuAt,onToggle,onOpen}})
  const rows = useMemo(()=>visible.map((row) => <div className={`ide-tree-row ${active === row.entry.path ? 'is-active' : ''}`} key={row.entry.path} style={{ paddingLeft: 12 + (row.depth - 1) * 15 }}>
      <button ref={(node) => { if (node) rowRefs.current.set(row.entry.path, node); else rowRefs.current.delete(row.entry.path) }}
        className="ide-tree-name" role="treeitem" aria-level={row.depth} aria-selected={active === row.entry.path} aria-expanded={row.entry.kind === 'directory' ? !collapsed.has(row.entry.path) : undefined}
        tabIndex={focused === row.entry.path || !focused && visible[0]?.entry.path === row.entry.path ? 0 : -1} title={row.entry.path}
        onFocus={() => setFocused(row.entry.path)} onKeyDown={(event) => callbacks.current.onTreeKey(event, row)}
        onClick={() => row.entry.kind === 'directory' ? callbacks.current.onToggle(row.entry.path) : callbacks.current.onOpen(row.entry.path)}
        onContextMenu={(event) => { event.preventDefault(); event.currentTarget.focus(); setFocused(row.entry.path); callbacks.current.menuAt(row.entry, event.clientX, event.clientY) }}>
        {row.entry.kind === 'directory' ? collapsed.has(row.entry.path) ? <ChevronRight size={13}/> : <ChevronDown size={13}/> : <span className="ide-java-icon">{row.entry.name.endsWith('.java') ? 'J' : row.entry.name === 'pom.xml' ? 'M' : row.entry.name.includes('gradle') ? 'G' : '·'}</span>}{row.entry.name}
      </button>
      <button className="ide-entry-more" aria-label={`Actions for ${row.entry.path}`} title="File actions" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); callbacks.current.menuAt(row.entry, rect.left, rect.bottom) }}>···</button>
    </div>), [visible,active,focused])
  return <div className="ide-tree" role="tree" aria-label="Project explorer" onContextMenu={(event) => {
    if (event.target === event.currentTarget) { event.preventDefault(); menuAt(null, event.clientX, event.clientY) }
  }}>
    {rows}
    {!tree.length && <p className="ide-empty">Create a Java class or open a project.</p>}
    {menu && <CommandMenu label={menu.entry ? `Actions for ${menu.entry.path}` : 'Project actions'} x={menu.x} y={menu.y}
      items={explorerMenuCommands(menu.entry?.kind ?? null).map((id) => ({ id, label: id === 'resource.rename' ? 'Rename' : ideCommandDefinitions[id].title, ...(availability?.(id, menu.entry, menu.context) ?? { enabled: true }) }))}
      onClose={() => setMenu(null)} onChoose={(id) => {
        const kinds: Partial<Record<IdeCommandId, TreeAction>> = { 'file.open': 'open', 'file.new': 'file', 'java.newClass': 'class', 'folder.new': 'folder', 'resource.rename': 'rename', 'resource.delete': 'delete', 'resource.copyPath': 'copy', 'explorer.reveal': 'reveal' }
        const kind = kinds[id as IdeCommandId]
        const entry = menu.entry
        setMenu(null)
        const context = menu.context
        if (context && onCommand) requestAnimationFrame(() => onCommand(id as IdeCommandId, context))
        else if (kind) requestAnimationFrame(() => onAction(kind, entry))
      }}/>}
  </div>
}
