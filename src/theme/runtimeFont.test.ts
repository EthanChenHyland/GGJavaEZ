import { afterEach, expect, it, vi } from 'vitest'
import { clear, suspend } from 'suspend-react'
import { preloadRuntimeText, runtimeCharacters, runtimeFont, runtimeFonts } from './runtimeFont'

const font = vi.hoisted(() => ({ jobs: [] as Array<{ font: string; characters: string; finish: () => void }> }))
vi.mock('troika-three-text', () => ({
  preloadFont: (options: { font: string; characters: string }, finish: () => void) => {
    font.jobs.push({ ...options, finish })
  },
}))

afterEach(() => {
  clear(['troika-text', runtimeFont, runtimeCharacters])
  clear(['troika-text', runtimeFont, undefined])
  vi.unstubAllGlobals()
})

it('does not queue an atlas or populate font jobs without WebGL',async()=>{
  vi.stubGlobal('window',{})
  vi.stubGlobal('document',{createElement:()=>({getContext:()=>null})})
  preloadRuntimeText();preloadRuntimeText();await Promise.resolve()
  expect(font.jobs).toHaveLength(0)
})

it('warms all three weights once after a skipped probe and waits for every bounded job', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('document',{createElement:()=>({getContext:()=>({getExtension:()=>null})})})
  preloadRuntimeText()
  preloadRuntimeText()
  await vi.waitFor(() => expect(font.jobs).toHaveLength(3))
  expect(font.jobs.map(job => job.font)).toEqual(Object.values(runtimeFonts))
  for (const job of font.jobs) expect(job.characters).toBe(runtimeCharacters)
  const ready = vi.fn()
  let pending: unknown
  try { suspend(() => { throw new Error('Missing font prewarm') }, ['troika-text', runtimeFont, runtimeCharacters]) } catch (promise) { pending = promise }
  expect(pending).toBeInstanceOf(Promise)
  ;(pending as Promise<void>).then(ready)
  font.jobs[0].finish()
  font.jobs[1].finish()
  await Promise.resolve()
  expect(ready).not.toHaveBeenCalled()
  font.jobs[2].finish()
  await vi.waitFor(() => {
    for (const characters of [runtimeCharacters, undefined]) {
      expect(suspend(() => { throw new Error('Unwarmed label would suspend') }, ['troika-text', runtimeFont, characters])).toBeUndefined()
    }
  })
  expect(ready).toHaveBeenCalledOnce()
  preloadRuntimeText()
  expect(font.jobs).toHaveLength(3)
})
