import {SurfacePortal} from '../shell/dialogs/SurfacePortal'
import {ShellSurfaceParent,useShellSurface} from '../shell/dialogs/useShellSurface'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { rankPickerItems, type SearchableItem } from './fuzzy'
import { menuTargetIndex } from './contextMenus'

export interface WorkspacePickerItem extends SearchableItem { enabled: boolean; reason?: string; shortcut?: string }
export function WorkspacePicker({ mode, items, onChoose, onClose }: {
  mode: 'files' | 'commands'; items: readonly WorkspacePickerItem[]
  onChoose: (id: string) => void; onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId(),surfaceRef=useRef<HTMLDivElement>(null),surface=useShellSurface(surfaceRef,onClose,true)
  const results = useMemo(() => rankPickerItems(items, query.replace(/^>/, '')).slice(0, 100), [items, query])
  const index = Math.min(selected, Math.max(0, results.length - 1))
  const title = mode === 'files' ? 'Quick Open' : 'Command Palette'
  useEffect(() => { list.current?.children[index]?.scrollIntoView?.({ block: 'nearest' }) }, [index, query])
  return <SurfacePortal><ShellSurfaceParent.Provider value={surface.id}><div className="ide-picker-backdrop" style={{zIndex:surface.zIndex}} onPointerDown={(event) => { if (event.target === event.currentTarget) surface.dismissFromPointer() }}>
    <div ref={surfaceRef} tabIndex={-1} className="ide-picker glass" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => {
      event.stopPropagation()
      const next = menuTargetIndex(event.key, index, results.length)
      if (next !== null) { event.preventDefault(); setSelected(next) }
      if (event.key === 'Enter' && results[index]?.enabled) { event.preventDefault(); onChoose(results[index].id) }
    }}>
      <div className="ide-picker-query"><Search size={16}/><input ref={input} role="combobox" aria-label={title === 'Quick Open' ? 'Search project files' : 'Search commands'} aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={results.length ? `${id}-${index}` : undefined} placeholder={mode === 'files' ? 'Search project files…' : 'Type a command…'} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0) }}/><button type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={15}/></button></div>
      <div ref={list} id={`${id}-list`} className="ide-picker-results" role="listbox" aria-label={title}>
        {results.map((item, row) => <div key={item.id} id={`${id}-${row}`} role="option" aria-selected={row === index} aria-disabled={!item.enabled} className={`ide-picker-result ${row === index ? 'is-selected' : ''}`} title={item.reason} onMouseMove={() => setSelected(row)} onPointerDown={(event) => event.preventDefault()} onClick={() => { if (item.enabled) onChoose(item.id) }}><span><strong>{item.label}</strong><small>{item.reason ?? item.detail}</small></span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</div>)}
      </div>
      {!results.length && <p className="ide-picker-empty">{mode === 'files' ? 'No matching project files' : 'No matching commands'}</p>}
      <div className="ide-picker-foot"><span>{results.length} {mode === 'files' ? 'files' : 'commands'}</span><span>↑ ↓ Navigate · ↵ {mode === 'files' ? 'Open' : 'Run'} · Esc Close</span></div>
    </div>
  </div></ShellSurfaceParent.Provider></SurfacePortal>
}
