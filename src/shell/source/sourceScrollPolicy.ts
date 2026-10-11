export type SourceMark = 'running' | 'paused' | 'history' | 'focus'
export interface SourceScrollTarget { mark: SourceMark; line: number | null; key: string }
export interface VisibleSourceLines { first: number; last: number }
export type SourceScrollAction = 'middle-third' | 'reveal' | 'none'

/** Presentation policy only. Pause identity is independent of the displayed lens. */
export function createSourceScrollPolicy() {
 let pauseId: string | null = null, consumedPause: string | null = null
 let revealedTarget: string | null = null, manualUntil = -Infinity
 return {
  manualScroll(now: number) { manualUntil = now + 2000 },
  decide(target: SourceScrollTarget, visible: VisibleSourceLines | null, actualPauseId: string | null, now: number): SourceScrollAction {
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
   // Repainting/resizing does not undo a later manual scroll. A new Focus
   // target or History cursor can request reveal, even on the same source line.
   const changed=revealedTarget!==target.key
   revealedTarget=target.key
   return changed&&outside?'reveal':'none'
  },
  suppressedUntil() { return manualUntil },
 }
}

/** Closest centered visible range, clamped at both actual file boundaries. */
export function firstVisibleLineForMiddleThird(line: number, visibleCount: number, lineCount: number): number {
 const count=Math.max(1,Math.floor(visibleCount)),total=Math.max(1,Math.floor(lineCount))
 return Math.max(1,Math.min(Math.max(1,total-count+1),Math.floor(line-(count-1)/2)))
}
