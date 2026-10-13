import {productionClock} from '../motion/clock'
/** Distinguish a requested animation frame from a redraw after idle. Idle time
 * belongs to neither renderer submission time nor the frame-time watchdog. */
export const renderActivity = { continuous: false, nextRequested: false }
/** Note an animation redraw already requested by an external render owner
 * such as Drei's OrbitControls. This does not request an additional frame. */
export function noteRequestedAnimationFrame():void {
  if(!productionClock.stepped)renderActivity.nextRequested=true
}
export function requestAnimationFrameRender(invalidate: () => void): void {
  if(productionClock.stepped)return
  noteRequestedAnimationFrame()
  invalidate()
}
