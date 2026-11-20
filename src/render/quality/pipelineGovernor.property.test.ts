import { expect, it } from 'vitest'
import fc from 'fast-check'
import { idleActivity, PipelineGovernor, type PipelineActivity } from './pipelineGovernor'
import { FrameTimeWatchdog } from './frameTimeWatchdog'

it('Property 62: every trigger interrupts Cinematic and restarts the complete settling interval (100 runs)', () => {
  fc.assert(fc.property(fc.array(fc.record({ dt: fc.integer({ min: 1, max: 650 }), scrubbing: fc.boolean(), liveTrailing: fc.boolean(), cameraMoving: fc.boolean() }), { minLength: 1, maxLength: 200 }), frames => {
    const governor = new PipelineGovernor()
    let now = 0, previousBlocked = false, settleUntil = -Infinity
    for (const { dt, ...activity } of frames) {
      now += dt
      const blocked = Object.values(activity).some(Boolean)
      if (blocked || previousBlocked) settleUntil = now + 500
      expect(governor.update('CINEMATIC', true, activity, now)).toBe(!blocked && now >= settleUntil ? 'CINEMATIC' : 'INTERACTIVE')
      previousBlocked = blocked
    }
    const start = now + 1
    governor.update('CINEMATIC', true, { ...idleActivity, cameraMoving: true }, start)
    expect(governor.update('CINEMATIC', true, idleActivity, start + 1)).toBe('INTERACTIVE')
    expect(governor.update('CINEMATIC', true, idleActivity, start + 500)).toBe('INTERACTIVE')
    expect(governor.update('CINEMATIC', true, idleActivity, start + 501)).toBe('CINEMATIC')
  }), { numRuns: 100 })
})
it('preparation, a user Interactive choice and every activity kind gate the same governor', () => {
  for (const trigger of Object.keys(idleActivity) as (keyof PipelineActivity)[]) {
    const governor = new PipelineGovernor()
    expect(governor.update('CINEMATIC', false, idleActivity, 0)).toBe('INTERACTIVE')
    expect(governor.update('INTERACTIVE', true, idleActivity, 0)).toBe('INTERACTIVE')
    expect(governor.update('CINEMATIC', true, { ...idleActivity, [trigger]: true }, 1)).toBe('INTERACTIVE')
  }
})
it('Property 62: the watchdog downgrades only after consecutive complete slow Cinematic windows (100 runs)', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 10, max: 60 }), { minLength: 2, maxLength: 30 }), times => {
    const watchdog = new FrameTimeWatchdog()
    let now = 0, consecutive = 0
    watchdog.update('CINEMATIC', now, times[0])
    for (const time of times) {
      // Uniform samples deliberately isolate the real median/threshold/window boundary.
      for (let step = 1; step < 10; step++) expect(watchdog.update('CINEMATIC', now + step * 100, time)).toBe(false)
      now += 1000
      consecutive = time > 33 ? consecutive + 1 : 0
      expect(watchdog.update('CINEMATIC', now, time)).toBe(consecutive >= 2)
      if (consecutive >= 2) { watchdog.update('INTERACTIVE', now + 1, time); consecutive = 0; watchdog.update('CINEMATIC', now + 1, time); now += 1 }
    }
  }), { numRuns: 100 })
})
it('an Interactive interruption or suspended window cannot count as two slow windows', () => {
  const watchdog = new FrameTimeWatchdog()
  watchdog.update('CINEMATIC', 0, 45)
  expect(watchdog.update('CINEMATIC', 1000, 45)).toBe(false)
  watchdog.update('INTERACTIVE', 1100, 45)
  watchdog.update('CINEMATIC', 1200, 45)
  expect(watchdog.update('CINEMATIC', 2200, 45)).toBe(false)
  expect(watchdog.update('CINEMATIC', 9000, 45)).toBe(false)
})
