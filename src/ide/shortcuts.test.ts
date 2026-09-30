import { describe, expect, it } from 'vitest'
import { detectPlatform, formatShortcut, ideShortcuts, matchesShortcut, type Platform } from './shortcuts'

const key = (code: string, options: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; key: string }> = {}) =>
  ({ code, key: options.key ?? code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...options })

describe('platform shortcut contract', () => {
  it('detects all supported desktop platforms centrally', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('mac')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
  })
  it.each(['mac', 'windows', 'linux'] as Platform[])('matches primary, Shift, and physical Option keys on %s', (platform) => {
    const primary = platform === 'mac' ? { metaKey: true } : { ctrlKey: true }
    expect(matchesShortcut(key('KeyS', primary), ideShortcuts.save, platform)).toBe(true)
    expect(matchesShortcut(key('KeyS', { ...primary, shiftKey: true }), ideShortcuts.saveAll, platform)).toBe(true)
    expect(matchesShortcut(key('KeyS', { ...primary, altKey: true }), ideShortcuts.saveAll, platform)).toBe(false)
    expect(matchesShortcut(key('KeyS', { ...primary, altKey: true, shiftKey: true }), ideShortcuts.saveAll, platform)).toBe(false)
    expect(matchesShortcut(key('KeyS', { ...primary, shiftKey: true }), ideShortcuts.save, platform)).toBe(false)
    expect(matchesShortcut(key('KeyR', { altKey: true, shiftKey: true, key: '®' }), ideShortcuts.run, platform)).toBe(true)
    expect(matchesShortcut(key('KeyD', { altKey: true, shiftKey: true }), ideShortcuts.debug, platform)).toBe(true)
    expect(matchesShortcut(key('KeyX', { altKey: true, shiftKey: true }), ideShortcuts.stop, platform)).toBe(true)
    expect(matchesShortcut(key('KeyE', { altKey: true, shiftKey: true }), ideShortcuts.explorer, platform)).toBe(true)
    expect(matchesShortcut(key('KeyF', { altKey: true, shiftKey: true }), ideShortcuts.focus, platform)).toBe(true)
    expect(matchesShortcut(key('KeyC', { altKey: true, shiftKey: true }), ideShortcuts.console, platform)).toBe(true)
    expect(matchesShortcut(key('F9'), ideShortcuts.breakpoint, platform)).toBe(true)
    expect(matchesShortcut(key('F1'), ideShortcuts.commandPalette, platform)).toBe(true)
    expect(matchesShortcut(key('F9', { altKey: true }), ideShortcuts.breakpoint, platform)).toBe(false)
    expect(new Set(Object.values(ideShortcuts).map((shortcut) => formatShortcut(shortcut, platform))).size)
      .toBe(Object.keys(ideShortcuts).length)
  })
  it('formats the same action in native modifier vocabulary', () => {
    expect(formatShortcut(ideShortcuts.save, 'mac')).toBe('⌘S')
    expect(formatShortcut(ideShortcuts.saveAll, 'mac')).toBe('⌘⇧S')
    expect(formatShortcut(ideShortcuts.run, 'mac')).toBe('⌥⇧R')
    expect(formatShortcut(ideShortcuts.save, 'windows')).toBe('Ctrl+S')
    expect(formatShortcut(ideShortcuts.saveAll, 'windows')).toBe('Ctrl+Shift+S')
    expect(formatShortcut(ideShortcuts.saveAll, 'linux')).toBe('Ctrl+Shift+S')
    expect(formatShortcut(ideShortcuts.run, 'linux')).toBe('Alt+Shift+R')
  })
  it('formats explicit modifiers exactly as they match on each platform', () => {
    const macChord = { code: 'KeyS', primary: true, ctrl: true }
    expect(formatShortcut(macChord, 'mac')).toBe('⌘⌃S')
    expect(matchesShortcut(key('KeyS', { metaKey: true, ctrlKey: true }), macChord, 'mac')).toBe(true)
    expect(matchesShortcut(key('KeyS', { metaKey: true }), macChord, 'mac')).toBe(false)

    const windowsChord = { code: 'KeyS', primary: true, meta: true }
    expect(formatShortcut(windowsChord, 'windows')).toBe('Ctrl+Meta+S')
    expect(matchesShortcut(key('KeyS', { ctrlKey: true, metaKey: true }), windowsChord, 'windows')).toBe(true)
    expect(matchesShortcut(key('KeyS', { ctrlKey: true }), windowsChord, 'windows')).toBe(false)
  })
})
