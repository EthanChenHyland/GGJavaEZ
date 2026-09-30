export type Platform = 'mac' | 'windows' | 'linux'
export interface Shortcut { code: string; primary?: boolean; alt?: boolean; shift?: boolean; ctrl?: boolean; meta?: boolean }
export type KeyEventLike = Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

export function detectPlatform(userAgent: string): Platform {
  if (/Macintosh|Mac OS X|MacIntel/i.test(userAgent)) return 'mac'
  if (/Windows/i.test(userAgent)) return 'windows'
  return 'linux'
}

export function currentPlatform(): Platform {
  return detectPlatform(typeof navigator === 'undefined' ? '' : navigator.userAgent)
}

/** Exact modifier matching prevents native/browser chords from being stolen. Physical codes survive macOS Option glyph substitution. */
export function matchesShortcut(event: KeyEventLike, shortcut: Shortcut, platform: Platform): boolean {
  const primary = shortcut.primary ?? false
  const ctrl = shortcut.ctrl ?? (primary && platform !== 'mac')
  const meta = shortcut.meta ?? (primary && platform === 'mac')
  return event.code === shortcut.code && event.ctrlKey === ctrl && event.metaKey === meta &&
    event.altKey === (shortcut.alt ?? false) && event.shiftKey === (shortcut.shift ?? false)
}

export function formatShortcut(shortcut: Shortcut, platform: Platform): string {
  const key = shortcut.code.startsWith('Key') ? shortcut.code.slice(3) : shortcut.code.startsWith('Digit') ? shortcut.code.slice(5) : shortcut.code
  if (platform === 'mac') return `${shortcut.primary || shortcut.meta ? '⌘' : ''}${shortcut.ctrl ? '⌃' : ''}${shortcut.alt ? '⌥' : ''}${shortcut.shift ? '⇧' : ''}${key}`
  return `${shortcut.primary || shortcut.ctrl ? 'Ctrl+' : ''}${shortcut.alt ? 'Alt+' : ''}${shortcut.shift ? 'Shift+' : ''}${shortcut.meta ? 'Meta+' : ''}${key}`
}

export const ideShortcuts = {
  save: { code: 'KeyS', primary: true },
  saveAll: { code: 'KeyS', primary: true, alt: true },
  run: { code: 'KeyR', alt: true, shift: true },
  debug: { code: 'KeyD', alt: true, shift: true },
  stop: { code: 'KeyX', alt: true, shift: true },
  focus: { code: 'KeyF', alt: true, shift: true },
  explorer: { code: 'KeyE', alt: true, shift: true },
  tools: { code: 'KeyB', alt: true, shift: true },
  inspector: { code: 'KeyI', alt: true, shift: true },
  symbols: { code: 'KeyO', alt: true, shift: true },
  console: { code: 'KeyC', alt: true, shift: true },
  problems: { code: 'KeyP', alt: true, shift: true },
  returnLive: { code: 'KeyL', alt: true, shift: true },
} as const satisfies Record<string, Shortcut>
