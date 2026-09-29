import { afterEach, expect, it, vi } from 'vitest'
import { clear, suspend } from 'suspend-react'
import { preloadRuntimeText, runtimeCharacters, runtimeFont } from './runtimeFont'

const font = vi.hoisted(() => ({ finish: undefined as (() => void) | undefined, jobs: 0, characters: '' }))
vi.mock('troika-three-text', () => ({
  preloadFont: (options: { characters: string }, finish: () => void) => {
    font.jobs++
    font.characters = options.characters
    font.finish = finish
  },
}))

afterEach(() => {
  clear(['troika-text', runtimeFont, runtimeCharacters])
  clear(['troika-text', runtimeFont, undefined])
  vi.unstubAllGlobals()
})

it('makes both primitive and region labels ready through one bounded font job', async () => {
  vi.stubGlobal('window', {})
  preloadRuntimeText()
  preloadRuntimeText()
  await vi.waitFor(() => expect(font.finish).toBeTypeOf('function'))
  expect(font.characters).toBe(runtimeCharacters)
  expect(font.jobs).toBe(1)
  font.finish!()
  await vi.waitFor(() => {
    for (const characters of [runtimeCharacters, undefined]) {
      expect(suspend(() => { throw new Error('Unwarmed label would suspend') }, ['troika-text', runtimeFont, characters])).toBeUndefined()
    }
  })
})
