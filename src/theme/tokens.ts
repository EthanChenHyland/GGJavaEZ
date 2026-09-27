import design from '../../docs/visual-java-spec/DESIGN_TOKENS.json'

/** The spec JSON remains the sole color, typography, and spacing source. */
export const colors = design.color
export const spacingPx = design.spacingPx
export const radiusPx = design.radiusPx
export const typography = design.typography
export const line = design.line

export const motionMs = {
  instant: 90,
  quick: 160,
  standard: 260,
  deliberate: 420,
  cinematic: 680,
  hero: 950,
} as const

export const worldUnits = {
  frame: [4.8, 1.35, 0.55] as const,
  object: [3.2, 2.1, 0.85] as const,
  homePosition: [5.6, 5.1, 14.2] as const,
  homeTarget: [0, 0.15, -0.2] as const,
} as const
