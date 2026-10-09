import type { QualityTier } from './pipelineGovernor'

export const slowFrameNotice = 'Switched to Interactive rendering: median frame time exceeded 33 ms for two consecutive seconds.'
/** Only complete, uninterrupted Cinematic one-second windows contribute. */
export class FrameTimeWatchdog {
  private start: number | null = null
  private samples: number[] = []
  private slowWindows = 0
  update(active: QualityTier, now: number, frameMs: number): boolean {
    if (active !== 'CINEMATIC') { this.reset(); return false }
    this.start ??= now
    if (Number.isFinite(frameMs) && frameMs > 0) this.samples.push(frameMs)
    if (now - this.start < 1000) return false
    const ordered = this.samples.sort((a, b) => a - b), middle = ordered.length >> 1
    const median = ordered.length ? (ordered[middle] + ordered[(ordered.length - 1) >> 1]) / 2 : 0
    // A long suspension cannot count as multiple measured windows.
    this.slowWindows = now - this.start < 2000 && median > 33 ? this.slowWindows + 1 : 0
    this.start = now; this.samples = []
    return this.slowWindows >= 2
  }
  reset(): void { this.start = null; this.samples = []; this.slowWindows = 0 }
}
