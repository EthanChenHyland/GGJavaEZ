/** Distinguish a requested animation frame from a redraw after idle. Idle time
 * belongs to neither renderer submission time nor the frame-time watchdog. */
export const renderActivity = { continuous: false, nextRequested: false }
export function requestAnimationFrameRender(invalidate: () => void): void {
  renderActivity.nextRequested = true
  invalidate()
}
