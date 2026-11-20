export interface Clock {now():number}
/** Wall time in production; QA can step this same presentation clock without
 * advancing the recording cursor, reducer, JVM or playback scheduler. */
export function createSteppableClock(wall:()=>number) {
 let virtual:number|null=null,offset=0
 const listeners=new Set<()=>void>()
 const now=()=>virtual??wall()+offset
 const notify=()=>listeners.forEach(listener=>listener())
 return{now,get stepped(){return virtual!==null},subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}},
  step(ms:number){if(!Number.isFinite(ms)||ms<0)throw new RangeError('Clock steps must be finite and nonnegative');virtual=now()+ms;notify();return virtual},
  resume(){if(virtual!==null){offset=virtual-wall();virtual=null;notify()}}
 }
}
export const productionClock=createSteppableClock(()=>performance.now())
export function createVirtualClock(start=0) {
 let time=start
 return {now:()=>time,step(ms:number){if(!Number.isFinite(ms)||ms<0)throw new RangeError('Clock steps must be finite and nonnegative');time+=ms;return time}}
}
