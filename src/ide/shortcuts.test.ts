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
  it.each(['mac', 'windows', 'linux'] as Platform[])('matches primary, alt, and physical Option keys on %s', (platform) => {
    const primary = platform === 'mac' ? { metaKey: true } : { ctrlKey: true }
    expect(matchesShortcut(key('KeyS', primary), ideShortcuts.save, platform)).toBe(true)
    expect(matchesShortcut(key('KeyS', { ...primary, altKey: true }), ideShortcuts.saveAll, platform)).toBe(true)
    expect(matchesShortcut(key('KeyS', { ...primary, shiftKey: true }), ideShortcuts.saveAll, platform)).toBe(false)
    expect(matchesShortcut(key('KeyR', { altKey: true, shiftKey: true, key: '®' }), ideShortcuts.run, platform)).toBe(true)
    expect(matchesShortcut(key('KeyD', { altKey: true, shiftKey: true }), ideShortcuts.debug, platform)).toBe(true)
    expect(matchesShortcut(key('KeyX', { altKey: true, shiftKey: true }), ideShortcuts.stop, platform)).toBe(true)
    expect(matchesShortcut(key('KeyE', { altKey: true, shiftKey: true }), ideShortcuts.explorer, platform)).toBe(true)
    expect(matchesShortcut(key('KeyF', { altKey: true, shiftKey: true }), ideShortcuts.focus, platform)).toBe(true)
    expect(matchesShortcut(key('KeyC', { altKey: true, shiftKey: true }), ideShortcuts.console, platform)).toBe(true)
  })
  it('formats the same action in native modifier vocabulary', () => {
    expect(formatShortcut(ideShortcuts.save, 'mac')).toBe('⌘S')
    expect(formatShortcut(ideShortcuts.saveAll, 'mac')).toBe('⌘⌥S')
    expect(formatShortcut(ideShortcuts.run, 'mac')).toBe('⌥⇧R')
    expect(formatShortcut(ideShortcuts.save, 'windows')).toBe('Ctrl+S')
    expect(formatShortcut(ideShortcuts.saveAll, 'linux')).toBe('Ctrl+Alt+S')
  })
})
