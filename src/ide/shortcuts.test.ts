import { describe, expect, it } from 'vitest'
import { commandForShortcut, detectPlatform, formatShortcut, ideShortcuts, matchesShortcut, worldEscapeCommand, type Platform, type ShortcutFocus } from './shortcuts'
import { ideCommandDefinitions } from './commands'

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

describe('canonical shortcut dispatch scopes', () => {
  const definitions = Object.values(ideCommandDefinitions)
  const world: ShortcutFocus = { world: true, editor: false, textInput: false, shellSurface: false }
  const dispatch = (event: ReturnType<typeof key>, focus = world, platform: Platform = 'mac') => commandForShortcut(event, definitions, platform, focus)?.id
  it.each(['mac', 'windows', 'linux'] as Platform[])('uses physical H, Alt+Shift+F and both palette chords on %s', platform => {
    expect(dispatch(key('KeyH', { key: 'h' }), world, platform)).toBe('navigation.home')
    expect(dispatch(key('KeyF', { key: 'Ï', altKey: true, shiftKey: true }), world, platform)).toBe('navigation.focusSelection')
    expect(dispatch(key('F1'), world, platform)).toBe('workbench.commandPalette')
    const primary = platform === 'mac' ? { metaKey: true } : { ctrlKey: true }
    expect(dispatch(key('KeyP', { ...primary, shiftKey: true }), world, platform)).toBe('workbench.commandPalette')
    expect(dispatch(key('KeyH', { shiftKey: true }), world, platform)).toBeUndefined()
    expect(dispatch(key('KeyF'), world, platform)).toBeUndefined()
    expect(dispatch(key('KeyT'), world, platform)).toBeUndefined()
  })
  it('leaves Home, bare F/T and navigation chords to focused typing and shell controls', () => {
    for (const focus of [
      { ...world, textInput: true }, { ...world, editor: true, textInput: true },
      { ...world, editor: true }, { ...world, world: false }, { ...world, shellSurface: true },
    ]) expect(dispatch(key('KeyH'), focus)).toBeUndefined()
    for (const focus of [{ ...world, textInput: true }, { ...world, editor: true }]) {
      expect(dispatch(key('KeyF', { altKey: true, shiftKey: true }), focus)).toBeUndefined()
      expect(dispatch(key('KeyF'), focus)).toBeUndefined()
      expect(dispatch(key('KeyT'), focus)).toBeUndefined()
      expect(dispatch(key('F1'), focus)).toBe('workbench.commandPalette')
    }
    expect(dispatch(key('F2'), world)).toBeUndefined()
    expect(dispatch(key('F2'), { ...world, editor: true })).toBe('java.renameSymbol')
  })
  it('gives Escape to source/inspector/widgets before navigation and exits Focus before Trace', () => {
    const both = { inspectorOpen: false, focusActive: true, traceActive: true }
    expect(worldEscapeCommand(key('Escape'), world, both)).toBe('navigation.exitFocus')
    expect(worldEscapeCommand(key('Escape'), world, { inspectorOpen: false, focusActive: false, traceActive: true })).toBe('navigation.explore')
    expect(worldEscapeCommand(key('Escape'), world, { inspectorOpen: false, focusActive: false, traceActive: false })).toBeNull()
    for (const focus of [{ ...world, editor: true }, { ...world, textInput: true }, { ...world, shellSurface: true }])
      expect(worldEscapeCommand(key('Escape'), focus, both)).toBeNull()
    expect(worldEscapeCommand(key('Escape', { shiftKey: true }), world, both)).toBeNull()
    expect(worldEscapeCommand(key('Escape', { ctrlKey: true }), world, both)).toBeNull()
    expect(worldEscapeCommand(key('KeyT'), world, both)).toBeNull()
  })
  it('closes the Inspector only from its own focused surface, leaving World Escape to Focus and Trace', () => {
    const state = { inspectorOpen: true, focusActive: true, traceActive: true }
    expect(worldEscapeCommand(key('Escape'), world, state)).toBe('navigation.exitFocus')
    expect(worldEscapeCommand(key('Escape'), { ...world, world: false, shellSurface: true,inspector:true }, state)).toBe('workbench.inspector')
    expect(worldEscapeCommand(key('Escape'), { ...world, world: false, shellSurface: true }, state)).toBeNull()
    expect(worldEscapeCommand(key('Escape'), world, {...state,focusActive:false})).toBe('navigation.explore')
    expect(worldEscapeCommand(key('Escape'), world, {...state,focusActive:false,traceActive:false})).toBeNull()
    expect(worldEscapeCommand(key('Escape'), { ...world, editor: true }, state)).toBeNull()
    expect(worldEscapeCommand(key('Escape'), { ...world, textInput: true }, state)).toBeNull()
    expect(worldEscapeCommand(key('Escape'), world, { ...state, inspectorOpen: false })).toBe('navigation.exitFocus')
  })
})
