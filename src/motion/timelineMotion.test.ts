import { expect, it } from 'vitest'
import { loadPersonTrace } from '../examples/traces'
import { historyForTrace } from '../runtime/history'
import { createTimelineStore } from '../timeline/timelineStore'
import { createVirtualClock } from './clock'
import { createTransitionPlayer } from './transitionPlayer'
import { createTimelineMotionBinding } from './timelineMotion'

function setup(lens: 'LIVE' | 'HISTORY', liveHead = 2, reducedMotion=false) {
  const trace = loadPersonTrace(), clock = createVirtualClock()
  const timeline = createTimelineStore({ recordingId: 'recorded-run', liveHead, partial: false, hostLens: lens })
  const player = createTransitionPlayer({ trace, history: historyForTrace(trace) }, clock)
  const attach = createTimelineMotionBinding(player, timeline, () => reducedMotion)
  return { trace, clock, timeline, player, attach }
}
it('scrubbing before the first cursor change never animates when reduced motion starts enabled',()=>{
  const{clock,timeline,player,attach}=setup('HISTORY',2,true),release=attach();
  for(const type of ['beginScrub','endScrub','stepForward']as const){
    timeline.dispatch({type});clock.step(37);
    const frame=player.sample(clock.now(),()=>true);
    expect(frame.animating).toBe(false);expect(frame.settle).toBeNull();
    expect(frame.overlays.every(overlay=>overlay.static&&overlay.progress===1)).toBe(true);
  }
  expect(timeline.getSnapshot().state.cursor).toBe(1);expect(player.pendingCount).toBe(0);release();
});
it('presents the first accepted LIVE batch even when published before subscription', () => {
  const { trace, clock, timeline, player, attach } = setup('LIVE')
  const committed = timeline.getSnapshot()
  const release = attach()
  expect(timeline.getSnapshot()).toBe(committed)
  expect(player.sample(clock.now(), () => true).overlays[0]?.step.eventId).toBe(trace.events[1].eventId)
  release()
})
it('effect reattachment does not replay a LIVE prefix', () => {
  const { clock, player, attach } = setup('LIVE')
  attach()()
  player.sample(clock.now(), () => true)
  clock.step(700)
  expect(player.sample(clock.now(), () => true).animating).toBe(false)
  const release = attach()
  expect(player.sample(clock.now(), () => true).overlays).toEqual([])
  release()
})
it('HISTORY mount and hidden live append never animate or change the historical cursor', () => {
  const { clock, timeline, player, attach } = setup('HISTORY')
  const release = attach()
  timeline.reconcile({ recordingId: 'recorded-run', liveHead: 4, partial: false, hostLens: 'HISTORY' })
  expect(timeline.getSnapshot().state.cursor).toBe(0)
  expect(player.sample(clock.now(), () => true)).toEqual({ overlays: [], settle: null, animating: false })
  release()
})
it('a lens change at the same cursor interrupts queued overlays', () => {
  const { clock, timeline, player, attach } = setup('LIVE')
  const release = attach()
  expect(player.pendingCount).toBe(1)
  timeline.dispatch({ type: 'lens', lens: 'HISTORY' })
  expect(player.pendingCount).toBe(0)
  expect(player.sample(clock.now(), () => true)).toEqual({ overlays: [], settle: null, animating: false })
  release()
})
it('catches a prefix advanced during detached effect cleanup exactly once', () => {
  const { clock, timeline, player, attach } = setup('LIVE')
  attach()()
  timeline.dispatch({ type: 'head', liveHead: 3 })
  const release = attach()
  expect(player.pendingCount).toBe(1) // the second Event is a line fact with no invented step
  const sample = player.sample(clock.now(), () => true)
  expect(sample.overlays[0]?.step.seq).toBe(1)
  expect(timeline.getSnapshot().state.cursor).toBe(3)
  release()
})
