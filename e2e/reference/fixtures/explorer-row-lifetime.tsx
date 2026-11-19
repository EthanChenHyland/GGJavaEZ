import { StrictMode, useEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProjectExplorer } from '../../../src/ide/ProjectExplorer'
import type { ProjectEntry } from '../../../src/ide/contracts'
import type { CommandContext, IdeCommandId } from '../../../src/ide/commands'
import { Picker, type PickerItem } from '../../../src/shell/picker/Picker'
import { color } from '../../../src/theme/tokens'
import '../../../src/app/base.css'
import '../../../src/shell/shell.css'

export interface ExplorerLifetimeEvent {
  kind: 'context' | 'command' | 'action' | 'open' | 'toggle' | 'availability'
  owner: number
  path: string | null
  command?: IdeCommandId
  action?: string
  context?: CommandContext
  enabled?: boolean
}
export interface ExplorerLifetimeSnapshot {
  nameReads: number
  committed: { owner: number; unrelated: number; hidden: boolean; picker: boolean; allowRename: boolean; active: string } | null
  events: ExplorerLifetimeEvent[]
}
declare global { interface Window { explorerRowLifetime: { snapshot(): ExplorerLifetimeSnapshot } } }

// Observe actual component work without replacing React, touching its internals,
// patching ProjectExplorer, or mirroring its JSX/cache. Names are read by the
// production row construction; the observer never traverses these entries.
let nameReads = 0
let committed: ExplorerLifetimeSnapshot['committed'] = null
const events: ExplorerLifetimeEvent[] = []
const files: ProjectEntry[] = Array.from({ length: 5000 }, (_, index) => {
  const name = `File${String(index).padStart(4, '0')}.java`
  return Object.freeze({ path: `src/${name}`, kind: 'file' as const, get name() { nameReads++; return name } })
})
const tree: ProjectEntry[] = [{ path: 'src', name: 'src', kind: 'directory', children: files }]
const pickerItems: PickerItem[] = Array.from({ length: 5000 }, (_, index) => {
  const name = `File${String(index).padStart(4, '0')}.java`
  return { id: `src/${name}`, label: name, detail: `src/${name}`, enabled: true }
})
window.explorerRowLifetime = { snapshot: () => ({ nameReads, committed: committed && { ...committed }, events: structuredClone(events) }) }
for (const [role, palette] of Object.entries(color)) for (const [name, value] of Object.entries(palette)) {
  const kebab = (text: string) => text.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  document.documentElement.style.setProperty(`--color-${kebab(role)}-${kebab(name)}`, value)
}

function Fixture() {
  const [owner, setOwner] = useState(0), [unrelated, setUnrelated] = useState(0)
  const [hidden, setHidden] = useState(false), [picker, setPicker] = useState(false)
  const [allowRename, setAllowRename] = useState(true), [active, setActive] = useState(files[0].path)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  useLayoutEffect(() => { committed = { owner, unrelated, hidden, picker, allowRename, active } })
  // Fixture-only native control changes permissions without moving pointer/focus
  // outside an open production CommandMenu (which would dismiss that menu).
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.code !== 'KeyL' || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return
      event.preventDefault(); event.stopPropagation(); setAllowRename(value => !value)
    }
    window.addEventListener('keydown', toggle, true)
    return () => window.removeEventListener('keydown', toggle, true)
  }, [])
  // Deliberately capture this render's owner value. Ref-backed test callbacks
  // would conceal stale cached handlers, including the prior right-click bug.
  const context = (entry: ProjectEntry | null): CommandContext => {
    const result: CommandContext = { projectId: `fixture-project-${owner}`, workspaceGeneration: owner,
      ...(entry ? { target: { projectId: `fixture-project-${owner}`, path: entry.path, kind: entry.kind } } : {}) }
    events.push({ kind: 'context', owner, path: entry?.path ?? null, context: result })
    return result
  }
  return <main className="shell" style={{ padding: 20 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
      <button onClick={() => setUnrelated(value => value + 1)}>Unrelated update</button>
      <button onClick={() => setOwner(value => value + 1)}>Replace callbacks</button>
      <button onClick={() => setHidden(value => !value)}>{hidden ? 'Show Explorer' : 'Hide Explorer'}</button>
      <button onClick={() => setPicker(true)}>Open Quick Open</button>
      <button onClick={() => setActive(files[1].path)}>Select next file</button>
    </div>
    <p>Owner {owner}; unrelated {unrelated}; rename {allowRename ? 'allowed' : 'blocked'}. Alt+Shift+L toggles fixture permission.</p>
    <section aria-label="Explorer fixture pane" hidden={hidden} className="glass" style={{ width: 440, height: 500, overflow: 'auto' }}>
      <ProjectExplorer tree={tree} active={active} collapsed={collapsed} getCommandContext={context}
        onOpen={path => { events.push({ kind: 'open', owner, path }) }}
        onToggle={path => { events.push({ kind: 'toggle', owner, path }); setCollapsed(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next }) }}
        onAction={(action, entry) => { events.push({ kind: 'action', owner, path: entry?.path ?? null, action }) }}
        onCommand={(command, captured) => { events.push({ kind: 'command', owner, path: captured.target?.path ?? null, command, context: captured }) }}
        availability={(command, entry, captured) => {
          const enabled = command !== 'resource.rename' || allowRename
          events.push({ kind: 'availability', owner, path: entry?.path ?? null, command, context: captured, enabled })
          return enabled ? { enabled: true } : { enabled: false, reason: `Rename blocked by fixture policy ${owner}` }
        }}/>
    </section>
    {picker && <Picker mode="files" items={pickerItems} onClose={() => setPicker(false)} onChoose={() => setPicker(false)}/>}
  </main>
}
createRoot(document.getElementById('explorer-row-lifetime')!).render(<StrictMode><Fixture/></StrictMode>)
