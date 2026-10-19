import {DialogFrame} from '../shell/dialogs/DialogFrame'
import { useEffect, useState } from 'react'
import type { LanguageClient } from '../language/client'
import { documentPath, type LspWorkspaceSymbol } from '../language/protocol'
import type { SourceLocation } from './contracts'

export function SymbolSearch({ client, onOpen, onClose }: { client: LanguageClient; onOpen: (location: SourceLocation) => void | Promise<void>; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<LspWorkspaceSymbol[]>([])
  const [selected, setSelected] = useState(0)
  const [status, setStatus] = useState('Search project symbols')
  useEffect(() => {
    let alive = true
    if (!query.trim()) { setItems([]); setStatus('Search project symbols'); return }
    setStatus('Searching…')
    const timer = window.setTimeout(() => {
      void client.request<LspWorkspaceSymbol[] | null>('workspace/symbol', { query }).then((result) => {
        if (!alive) return
        const projectId = client.projectId
        const local = (result ?? []).filter((symbol) => projectId && documentPath(symbol.location.uri, projectId)).slice(0, 80)
        setItems(local); setSelected(0); setStatus(local.length ? `${local.length} symbols` : 'No matching project symbols')
      }).catch((error) => { if (alive) { setItems([]); setStatus(error instanceof Error ? error.message : String(error)) } })
    }, 200)
    return () => { alive = false; clearTimeout(timer) }
  }, [client, query])
  const open = (item: LspWorkspaceSymbol) => {
    const path = client.projectId && documentPath(item.location.uri, client.projectId)
    if (!path) return
    void Promise.resolve(onOpen({ path, line: (item.location.range?.start.line ?? 0) + 1, column: (item.location.range?.start.character ?? 0) + 1 })).then(onClose)
  }
  return <DialogFrame title="Find workspace symbol" className="ide-symbol-search" onClose={onClose} actions={<button type="button" onClick={onClose}>Close</button>}><div onKeyDown={(event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((value) => Math.min(items.length - 1, value + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)) }
    if (event.key === 'Enter' && items[selected]) { event.preventDefault(); open(items[selected]) }
  }}>
    <input aria-label="Symbol query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Class, method or field…" />
    <p role="status">{status}</p>
    <div className="ide-symbol-results">{items.map((item, index) => <button key={`${item.location.uri}:${item.name}:${index}`} type="button" className={index === selected ? 'is-selected' : ''} onMouseEnter={() => setSelected(index)} onClick={() => open(item)}><strong>{item.name}</strong><small>{item.containerName || documentPath(item.location.uri, client.projectId ?? '')}</small></button>)}</div>
  </div></DialogFrame>
}
