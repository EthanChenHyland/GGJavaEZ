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

function modifiers(shortcut: Shortcut, platform: Platform) {
  return {
    ctrl: Boolean(shortcut.ctrl || (shortcut.primary && platform !== 'mac')),
    meta: Boolean(shortcut.meta || (shortcut.primary && platform === 'mac')),
    alt: Boolean(shortcut.alt),
    shift: Boolean(shortcut.shift),
  }
}

/** Exact modifier matching prevents native/browser chords from being stolen. Physical codes survive macOS Option glyph substitution. */
export function matchesShortcut(event: KeyEventLike, shortcut: Shortcut, platform: Platform): boolean {
  const required = modifiers(shortcut, platform)
  return event.code === shortcut.code && event.ctrlKey === required.ctrl && event.metaKey === required.meta &&
    event.altKey === required.alt && event.shiftKey === required.shift
}

export function formatShortcut(shortcut: Shortcut, platform: Platform): string {
  const key = shortcut.code.startsWith('Key') ? shortcut.code.slice(3) : shortcut.code.startsWith('Digit') ? shortcut.code.slice(5) : shortcut.code
  const required = modifiers(shortcut, platform)
  if (platform === 'mac') return `${required.meta ? '⌘' : ''}${required.ctrl ? '⌃' : ''}${required.alt ? '⌥' : ''}${required.shift ? '⇧' : ''}${key}`
  return `${required.ctrl ? 'Ctrl+' : ''}${required.alt ? 'Alt+' : ''}${required.shift ? 'Shift+' : ''}${required.meta ? 'Meta+' : ''}${key}`
}

export const ideShortcuts = {
  save: { code: 'KeyS', primary: true },
  saveAll: { code: 'KeyS', primary: true, shift: true },
  breakpoint: { code: 'F9' },
  commandPalette: { code: 'F1' },
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
