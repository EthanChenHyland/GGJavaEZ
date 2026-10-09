import {expect,it} from 'vitest'
import fc from 'fast-check'
import {createMilestoneIndex,labelBinCount} from './milestones'
import {generateRawTrace} from '../testing/traceGen'
import {normalizeTrace} from '../instrumentation/normalize'
it('Property 57: labels are real, bounded, one per bin; density accounts every normalized event (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100000}),fc.integer({min:0,max:1600}),fc.nat(10000),(seed,width,offset)=>{
  const raw=generateRawTrace({seed,rawEvents:50,provenance:seed%2===0}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
  const index=createMilestoneIndex(),split=Math.floor(trace.events.length/2);index.extend(trace.events,0,split);index.extend(trace.events,split)
  const cursor=offset%(trace.events.length+1),labels=index.labelled(cursor,width,12),bins=labelBinCount(width,12)
  expect(labels.length).toBeLessThanOrEqual(bins)
  const seen=new Set<number>();for(const label of labels){expect(label.id).toBe(trace.events[label.seq].eventId);expect(label.cursor).toBe(label.seq+1);expect(label.label).toBe(trace.events[label.seq].label);const bin=Math.min(bins-1,Math.floor(label.cursor/trace.events.length*bins));expect(seen.has(bin)).toBe(false);seen.add(bin)}
  if(width>0)expect(index.density(width).reduce((sum,n)=>sum+n,0)).toBe(trace.events.length)
  const fresh=createMilestoneIndex();fresh.extend(trace.events,0);expect(index.labelled(cursor,width,12)).toEqual(fresh.labelled(cursor,width,12))
 }),{numRuns:100})
})
