import { preload } from 'suspend-react'
import { supportsRuntimeWebGL } from '../render/graphicsRecovery'

export const runtimeFont = '/fonts/runtime/VisualJavaInter-Regular.ttf'
export const runtimeFonts={400:runtimeFont,500:'/fonts/runtime/VisualJavaInter-Medium.ttf',600:'/fonts/runtime/VisualJavaInter-SemiBold.ttf'} as const
// A finite shared alphabet. Other observed glyphs still load on demand.
export const runtimeCharacters = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('') + '·→—×…⟨⟩'
let preloadPromise: Promise<void> | undefined

export function preloadRuntimeText(): void {
  // Tokens are imported before Canvas mounts. Atlas generation also needs GL;
  // the operational fallback must not start its worker or populate these keys.
  if (typeof window === 'undefined' || !supportsRuntimeWebGL()) return
  // Match both Drei cache keys: shared primitives specify characters; region
  // headings and transient cues use the font-only key. Both await all weights.
  // Import asynchronously so the shell can paint
  // while the font worker and its bounded atlas initialize ahead of Visualize.
  const load = () => preloadPromise ??= import('troika-three-text').then(async ({ preloadFont }) => {
    performance.mark('visual-java:text-preload-start')
    await Promise.all(Object.values(runtimeFonts).map(font=>new Promise<void>(resolve=>preloadFont({font,characters:runtimeCharacters,sdfGlyphSize:64},resolve))))
    performance.mark('visual-java:text-preload-ready')
  })
  preload(load, ['troika-text', runtimeFont, runtimeCharacters])
  preload(load, ['troika-text', runtimeFont, undefined])
}
