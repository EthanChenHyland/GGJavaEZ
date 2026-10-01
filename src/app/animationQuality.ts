import type { renderQuality } from '../theme/tokens'

/** INV-14 / R14.5: High motion is the fresh-store default; stored choices are kept.
 * Extracted verbatim from App's initial state so the default is testable. */
export function initialAnimationQuality(saved: string | null): keyof typeof renderQuality {
  return saved === 'low' ? 'low' : saved === 'medium' ? 'balanced' : 'high'
}
