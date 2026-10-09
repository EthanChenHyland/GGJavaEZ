import design from '../../docs/visual-java-spec/DESIGN_TOKENS.json'
import { preloadRuntimeText } from './runtimeFont'
export { runtimeFont, runtimeFonts } from './runtimeFont'

preloadRuntimeText()

/** The spec JSON remains the sole color, typography, and spacing source. */
/** Frozen v4 contract. Compatibility aliases below serve the interim renderer only. */
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
/** @deprecated Interim v3 consumer aliases; remove with legacy renderer. */
export const colors = {
  canvas: color.background.bottom, canvasRaised: color.background.top,
  panel: '#0B1018', panelRaised: '#111824', panelHover: '#151E2B', border: '#223044', borderStrong: '#354A64',
  text: color.ui.text, textSecondary: color.ui.textSecondary, textMuted: color.ui.textMuted,
  execution: color.semantic.execution, stack: color.stack.edge, heap: color.heap.edge,
  mutation: color.semantic.mutation, success: color.semantic.stdout, exception: color.semantic.exception, null: color.ui.textMuted,
} as const
export const spacingPx = [4, 8, 12, 16, 24, 32, 48] as const
export const radiusPx = { shell: shell.timeDock.radiusPx, control: shell.modeButton.radiusPx } as const
export const typography = {
  ui: 'Inter, ui-sans-serif, system-ui, sans-serif', code: 'JetBrains Mono, SFMono-Regular, Consolas, monospace',
  runtimeMicroPx: 12, secondaryUiPx: 13, primaryUiPx: 14, inspectorValuePx: 15,
} as const
export const typographyV4 = tokens.typography
export const line = { uiBorderPx: 1, referenceDefaultPx: world.connector.corePx, referenceMinPx: 1.5, referenceMaxPx: world.connector.selectedPx } as const
export const worldMaterial = {
  stackBody: color.stack.core, stackFace: color.stack.face, stackSlot: color.stack.chip,
  heapBody: color.heap.core, heapFace: color.heap.face, heapSlot: color.heap.chip,
  floor: color.background.bottom, historyBody: '#303A47', historyFace: '#202B36', historySlot: '#2A3542',
} as const

export const motionMs = {
  instant: 90,
  quick: 160,
  standard: 260,
  deliberate: 420,
  cinematic: 680,
  hero: 950,
} as const

/** Fixed region heading; Home framing includes its presentation footprint. */
export const stackRegionLabel = {
  position: [-5.9, 3.25, -1.5] as const,
}

export const worldUnits = {
  frame: [5.1, 1.7, 1.25] as const,
  object: [3.8, 2.5, 1.7] as const,
  arraySpatial: { cell: [1.12, 1.15, 1.15] as const, step: 1.28, boundaryHeight: 3.2, boundaryDepth: 1.45 },
  arrayTheater: { cell: [1.5, 1.45, 1.35] as const, step: 2.05, boundaryHeight: 3.8, boundaryDepth: 1.65 },
  arrayHeader: { maxWidth: 5.1, height: 0.85, depth: 0.45, topInset: 0.38 },
  scope: { rowGap: 0.48, headingGap: 0.36, depthOffset: 0.07, inset: 0.10, plateDepth: 0.055 },
  homePosition: [5.2, 4.9, 11.6] as const,
  homeTarget: [0, 0.15, -0.2] as const,
} as const

/** Shared presentation curve; semantic snapshots never contain interpolation. */
export function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3)
}

export const renderQuality = {
  high: { dpr: 2, shadows: true, shadowSize: 2048 },
  balanced: { dpr: 1.7, shadows: true, shadowSize: 1024 },
  low: { dpr: 1, shadows: false, shadowSize: 512 },
} as const

export const shellLayers = { world: 0, source: 2, overlay: 3, controls: 2, inspector: 3, header: 4, dialog: 5 } as const
