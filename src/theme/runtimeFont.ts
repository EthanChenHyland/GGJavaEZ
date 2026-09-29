import { preload } from 'suspend-react'

export const runtimeFont = '/fonts/Inter.ttf'
// A finite shared alphabet. Other observed glyphs still load on demand.
export const runtimeCharacters = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('') + '·→—×'
let preloadPromise: Promise<void> | undefined

export function preloadRuntimeText(): void {
  if (typeof window === 'undefined') return
  // Match both Drei cache keys: shared primitives specify characters; region
  // headings and transient cues use the font-only key. Both await one job.
  // Import asynchronously so the shell can paint
  // while the font worker and its bounded atlas initialize ahead of Visualize.
  const load = () => preloadPromise ??= import('troika-three-text').then(({ preloadFont }) => new Promise<void>(resolve => {
    performance.mark('visual-java:text-preload-start')
    preloadFont({ font: runtimeFont, characters: runtimeCharacters, sdfGlyphSize: 64 }, () => {
      performance.mark('visual-java:text-preload-ready')
      resolve()
    })
  }))
  preload(load, ['troika-text', runtimeFont, runtimeCharacters])
  preload(load, ['troika-text', runtimeFont, undefined])
}
