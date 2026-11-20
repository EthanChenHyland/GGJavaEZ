export type QualityTier = 'INTERACTIVE' | 'CINEMATIC'
export interface PipelineActivity { scrubbing: boolean; liveTrailing: boolean; cameraMoving: boolean }
export const idleActivity: PipelineActivity = { scrubbing: false, liveTrailing: false, cameraMoving: false }

/** Frame-driven clock: motion stops restart the entire 500 ms settling interval. */
export class PipelineGovernor {
  private blocked = false
  private settleUntil = -Infinity
  update(setting: QualityTier, ready: boolean, activity: PipelineActivity, now: number): QualityTier {
    const blocked = activity.scrubbing || activity.liveTrailing || activity.cameraMoving
    if (blocked) this.settleUntil = now + 500
    else if (this.blocked) this.settleUntil = now + 500
    this.blocked = blocked
    return setting === 'CINEMATIC' && ready && !blocked && now >= this.settleUntil ? 'CINEMATIC' : 'INTERACTIVE'
  }
  reset(): void { this.blocked = false; this.settleUntil = -Infinity }
}
