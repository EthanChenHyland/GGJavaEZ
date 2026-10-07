import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { menuTargetIndex } from './contextMenus'

export interface WorkspaceMenuItem { id: string; label: string; enabled: boolean; reason?: string; shortcut?: string }
export function WorkspaceMenu({ label, x, y, items, onChoose, onClose }: {
  label: string; x: number; y: number; items: readonly WorkspaceMenuItem[]
  onChoose: (id: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) })
  }, [x, y, items.length])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose() }
    const close = () => onClose()
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', close) }
  }, [onClose])
  return createPortal(<div ref={ref} className="ide-workspace-menu" role="menu" aria-label={label} style={position} onKeyDown={(event) => {
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); onClose(); return }
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const next = menuTargetIndex(event.key, buttons.indexOf(document.activeElement as HTMLButtonElement), buttons.length)
    if (next !== null) { event.preventDefault(); buttons[next].focus() }
  }}>
    {items.map((item) => <button type="button" role="menuitem" disabled={!item.enabled} title={item.reason} key={item.id} onClick={() => onChoose(item.id)}><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}
  </div>, document.body)
}
