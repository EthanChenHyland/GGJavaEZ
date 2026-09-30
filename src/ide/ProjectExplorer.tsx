import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ProjectEntry } from './contracts'
import './ProjectExplorer.css'

export type TreeAction = 'class' | 'file' | 'folder' | 'rename' | 'delete' | 'reveal' | 'refresh'
interface VisibleEntry { entry: ProjectEntry; depth: number; parent: string | null }

export function menuTargetIndex(key: string, current: number, count: number): number | null {
  if (!count) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (current < 0 && key === 'ArrowDown') return 0
  if (current < 0 && key === 'ArrowUp') return count - 1
  if (key === 'ArrowDown') return (current + 1 + count) % count
  if (key === 'ArrowUp') return (current - 1 + count) % count
  return null
}

function visibleEntries(tree: ProjectEntry[], collapsed: ReadonlySet<string>, depth = 1, parent: string | null = null): VisibleEntry[] {
  return tree.flatMap((entry) => [{ entry, depth, parent }, ...(entry.kind === 'directory' && !collapsed.has(entry.path) ? visibleEntries(entry.children ?? [], collapsed, depth + 1, entry.path) : [])])
}

export function ProjectExplorer({ tree, active, collapsed, onToggle, onOpen, onAction }: {
  tree: ProjectEntry[]; active: string; collapsed: ReadonlySet<string>
  onToggle: (path: string) => void; onOpen: (path: string) => void; onAction: (action: TreeAction, entry: ProjectEntry | null) => void
}) {
  const visible = useMemo(() => visibleEntries(tree, collapsed), [tree, collapsed])
  const [focused, setFocused] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ entry: ProjectEntry | null; x: number; y: number } | null>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])
  const focusPath = (path: string) => { setFocused(path); requestAnimationFrame(() => rowRefs.current.get(path)?.focus()) }
  const menuAt = (entry: ProjectEntry | null, x: number, y: number) => {
    setMenu({ entry, x: Math.max(0, Math.min(x, window.innerWidth - 194)), y: Math.max(0, Math.min(y, window.innerHeight - 258)) })
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
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
  return <div className="ide-tree" role="tree" aria-label="Project explorer" onContextMenu={(event) => {
    if (event.target === event.currentTarget) { event.preventDefault(); menuAt(null, event.clientX, event.clientY) }
  }}>
    {visible.map((row) => <div className={`ide-tree-row ${active === row.entry.path ? 'is-active' : ''}`} key={row.entry.path} style={{ paddingLeft: 12 + (row.depth - 1) * 15 }}>
      <button ref={(node) => { if (node) rowRefs.current.set(row.entry.path, node); else rowRefs.current.delete(row.entry.path) }}
        className="ide-tree-name" role="treeitem" aria-level={row.depth} aria-selected={active === row.entry.path} aria-expanded={row.entry.kind === 'directory' ? !collapsed.has(row.entry.path) : undefined}
        tabIndex={focused === row.entry.path || !focused && visible[0]?.entry.path === row.entry.path ? 0 : -1} title={row.entry.path}
        onFocus={() => setFocused(row.entry.path)} onKeyDown={(event) => onTreeKey(event, row)}
        onClick={() => row.entry.kind === 'directory' ? onToggle(row.entry.path) : onOpen(row.entry.path)}
        onContextMenu={(event) => { event.preventDefault(); focusPath(row.entry.path); menuAt(row.entry, event.clientX, event.clientY) }}>
        {row.entry.kind === 'directory' ? collapsed.has(row.entry.path) ? <ChevronRight size={13}/> : <ChevronDown size={13}/> : <span className="ide-java-icon">{row.entry.name.endsWith('.java') ? 'J' : row.entry.name === 'pom.xml' ? 'M' : row.entry.name.includes('gradle') ? 'G' : '·'}</span>}{row.entry.name}
      </button>
      <button className="ide-entry-more" aria-label={`Actions for ${row.entry.path}`} title="File actions" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); menuAt(row.entry, rect.left, rect.bottom) }}>···</button>
    </div>)}
    {!tree.length && <p className="ide-empty">Create a Java class or open a project.</p>}
    {menu && <div ref={menuRef} className="ide-tree-menu" role="menu" aria-label={menu.entry ? `Actions for ${menu.entry.path}` : 'Project actions'} style={{ left: menu.x, top: menu.y }} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(null); if (menu.entry) focusPath(menu.entry.path); return }
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      const target = menuTargetIndex(event.key, items.indexOf(document.activeElement as HTMLButtonElement), items.length)
      if (target !== null) { event.preventDefault(); items[target].focus() }
    }}>
      {(['class', 'file', 'folder', ...(menu.entry ? ['rename', 'delete', 'reveal'] : []), 'refresh'] as TreeAction[]).map((kind) => <button type="button" role="menuitem" key={kind} onClick={() => action(kind, menu.entry)}>{kind === 'class' ? 'New Java Class' : kind === 'file' ? 'New File' : kind === 'folder' ? 'New Folder' : kind === 'rename' ? 'Rename' : kind === 'delete' ? 'Delete' : kind === 'reveal' ? 'Reveal in editor' : 'Refresh'}</button>)}
    </div>}
  </div>
}
