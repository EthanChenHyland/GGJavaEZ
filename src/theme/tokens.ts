import design from '../../docs/visual-java-spec/DESIGN_TOKENS.json'
import { preloadRuntimeText } from './runtimeFont'
export { runtimeFont, runtimeFonts } from './runtimeFont'

preloadRuntimeText()

/** The spec JSON remains the sole color, typography, and spacing source. */
/** Frozen design contract shared by the Shell and renderer. */
function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
export const tokens = freeze(design)
export const color = tokens.color
export const shell = tokens.shell
export const world = tokens.world
export const camera = tokens.camera
export const motion = tokens.motion
export const budgets = tokens.budgets
export const detailLevel = tokens.detailLevel
export const typography = tokens.typography

export const shellLayers = { world: 0, source: 2, overlay: 3, controls: 2, inspector: 3, header: 4, dialog: 5 } as const
