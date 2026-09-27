import design from '../../docs/visual-java-spec/DESIGN_TOKENS.json'

/** The spec JSON remains the sole color, typography, and spacing source. */
export const colors = design.color
export const spacingPx = design.spacingPx
export const radiusPx = design.radiusPx
export const typography = design.typography
export const line = design.line
export const worldMaterial = design.worldMaterial

export const motionMs = {
  instant: 90,
  quick: 160,
  standard: 260,
  deliberate: 420,
  cinematic: 680,
  hero: 950,
} as const

export const worldUnits = {
  frame: [5.1, 1.7, 1.25] as const,
  object: [3.8, 2.5, 1.7] as const,
  homePosition: [5.2, 4.9, 11.6] as const,
  homeTarget: [0, 0.15, -0.2] as const,
} as const

export const runtimeFont = "/fonts/Inter.ttf"

/** Shared presentation curve; semantic snapshots never contain interpolation. */
export function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3)
}

export const renderQuality = {
  high: { dpr: 2, shadows: true, shadowSize: 2048 },
  balanced: { dpr: 1.7, shadows: true, shadowSize: 1024 },
  low: { dpr: 1, shadows: false, shadowSize: 512 },
} as const

export const shellLayers = { source: 1, overlay: 2, controls: 3, inspector: 4, header: 5 } as const
