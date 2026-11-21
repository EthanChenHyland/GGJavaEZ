export type SourceMark = 'running' | 'paused' | 'history' | 'focus' | 'reveal'
export interface SourceScrollTarget { mark: SourceMark; line: number | null; key: string }
export interface VisibleSourceLines { first: number; last: number }
export type SourceScrollAction = 'middle-third' | 'reveal' | 'none'

/** Presentation policy only. Pause identity is independent of the displayed lens. */
export function createSourceScrollPolicy() {
 let pauseId: string | null = null, consumedPause: string | null = null
 let revealedTarget: string | null = null, manuallyScrolledTarget: string | null = null, manualUntil = -Infinity
 return {
  manualScroll(now: number) { manualUntil = now + 2000; manuallyScrolledTarget = revealedTarget },
  decide(target: SourceScrollTarget, visible: VisibleSourceLines | null, actualPauseId: string | null, now: number, resized = false): SourceScrollAction {
   if(actualPauseId!==pauseId){pauseId=actualPauseId;consumedPause=null}
   const line=target.line
   if(line===null||!Number.isInteger(line)||line<1||!visible)return 'none'
   const outside=line<visible.first||line>visible.last
   if(target.mark==='paused'){
    if(!pauseId||consumedPause===pauseId)return 'none'
    consumedPause=pauseId
    return 'middle-third'
   }
   if(target.mark==='running')return now<manualUntil||!outside?'none':'reveal'
   // Restore a History line lost during resize unless the user scrolled it away.
   const changed=revealedTarget!==target.key
   if(changed)manuallyScrolledTarget=null
   revealedTarget=target.key
   return outside&&(changed||resized&&target.mark==='history'&&manuallyScrolledTarget!==target.key)?'reveal':'none'
  },
  suppressedUntil() { return manualUntil },
 }
}

/** Closest centered visible range, clamped at both actual file boundaries. */
export function firstVisibleLineForMiddleThird(line: number, visibleCount: number, lineCount: number): number {
 const count=Math.max(1,Math.floor(visibleCount)),total=Math.max(1,Math.floor(lineCount))
 return Math.max(1,Math.min(Math.max(1,total-count+1),Math.floor(line-(count-1)/2)))
}
