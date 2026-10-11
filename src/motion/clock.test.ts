import {expect,it,vi} from 'vitest'
import fc from 'fast-check'
import {createSteppableClock} from './clock'
it('steps the actual presentation clock independently of wall time and resumes without going backward (100 runs)',()=>{
 fc.assert(fc.property(fc.array(fc.integer({min:0,max:5000}),{minLength:1,maxLength:50}),steps=>{
  let wall=100;const clock=createSteppableClock(()=>wall),listener=vi.fn(),remove=clock.subscribe(listener)
  expect(clock.now()).toBe(100);wall=200;expect(clock.now()).toBe(200)
  let expected=200
  for(const step of steps){expected+=step;clock.step(step);wall+=27;expect(clock.now()).toBe(expected)}
  expect(listener).toHaveBeenCalledTimes(steps.length);clock.resume();expect(clock.now()).toBe(expected)
  wall+=10;expect(clock.now()).toBe(expected+10);expect(clock.stepped).toBe(false)
  remove();const count=listener.mock.calls.length;clock.step(0);expect(listener).toHaveBeenCalledTimes(count)
 }),{numRuns:100})
})
it('rejects invalid clock steps without changing time or notifying render owners',()=>{
 const clock=createSteppableClock(()=>100),listener=vi.fn();clock.subscribe(listener)
 for(const step of [-1,NaN,Infinity])expect(()=>clock.step(step)).toThrow(RangeError)
 expect(clock.now()).toBe(100);expect(listener).not.toHaveBeenCalled()
})
