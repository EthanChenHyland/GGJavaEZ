export interface Clock {now():number}
export const productionClock:Clock={now:()=>performance.now()}
export function createVirtualClock(start=0) {
 let time=start
 return {now:()=>time,step(ms:number){if(!Number.isFinite(ms)||ms<0)throw new RangeError('Clock steps must be finite and nonnegative');time+=ms;return time}}
}
