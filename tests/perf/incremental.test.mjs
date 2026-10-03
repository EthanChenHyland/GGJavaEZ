import { test, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import { generateRawTrace } from '../../src/testing/traceGen.ts';
import { TraceNormalizer } from '../../src/instrumentation/normalize.ts';
import { validateTrace } from '../../src/runtime/trace.ts';
import { seek } from '../../src/runtime/seek.ts';
const out='docs/checkpoints/v12-p2/performance.json';
const time=f=>{const start=performance.now();const value=f();return [value,performance.now()-start]};
const pct=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))]};
const terminal={status:'complete',exitCode:0,diagnostic:null};
function measure(size) {
 globalThis.gc?.();
 const before=process.memoryUsage().heapUsed;
 const {rawEvents,manifest,stats}=generateRawTrace({rawEvents:size,seed:42});
 const normalizer=new TraceNormalizer(manifest,`perf:${size}`), history=normalizer.history;
 const appendMs=[];let normalizeMs=0,indexMs=0,deltaBytes=0,fullBytes=0;
 // The constructor's PROGRAM_START is indexed before raw batches.

 for(let from=0;from<rawEvents.length;from+=1000){
  const events=rawEvents.slice(from,from+1000);
  const [,nms]=time(()=>normalizer.append(events));
  const ims=0; // normalization and indexed validation now share one history.
  normalizeMs+=nms;indexMs+=ims;appendMs.push(nms+ims);
  deltaBytes+=Buffer.byteLength(JSON.stringify({version:1,sessionId:'benchmark',fromSequence:from,toSequence:from+events.length,events}));

 }
 // Exact hypothetical full-resend bytes without executing that quadratic serialization.
 let cumulative=0;
 for(let index=0;index<rawEvents.length;index++){
  cumulative+=Buffer.byteLength(JSON.stringify(rawEvents[index]));
  if((index+1)%1000===0)fullBytes+=cumulative+index+Buffer.byteLength('{"rawEvents":[]}');
 }
 const [result,finishMs]=time(()=>normalizer.finish(terminal));
 const tailMs=0;
 const trace=result.trace;
 const serialized=JSON.stringify(trace);
 const [,reloadMs]=time(()=>{const restored=validateTrace(JSON.parse(serialized));seek(restored,restored.events.length)});
 let seed=12345;const jumps=[];
 for(let i=0;i<30;i++){seed=(seed*1664525+1013904223)>>>0;jumps.push(time(()=>history.materialize(Math.floor(seed/2**32*history.length)))[1]);}
 const [,returnToLiveMs]=time(()=>history.materialize(history.length));
 expect(history.state.status).toBe('ended');
 globalThis.gc?.();
 const heapMiB=process.memoryUsage().heapUsed/2**20;
 const retainedDeltaMiB=(process.memoryUsage().heapUsed-before)/2**20;
 const summary={rawEvents:rawEvents.length,semanticEvents:history.length,generator:stats,normalizeMs,indexValidateMs:indexMs,finishMs:finishMs+tailMs,reloadMs,
  appendBatchMs:{p50:pct(appendMs,.5),p95:pct(appendMs,.95),first:appendMs[0],last:appendMs.at(-1)},
  scrubMs:{p50:pct(jumps,.5),p95:pct(jumps,.95),max:Math.max(...jumps)},returnToLiveMs,deltaBytes,fullBytes,
  eventJsonBytes:Buffer.byteLength(serialized),heapMiB,retainedDeltaMiB,explicitGc:typeof globalThis.gc==='function',
  checkpointPolicy:history.stats??null};
 history.dispose();
 globalThis.gc?.();
 summary.releasedHistoryMiB=(heapMiB-process.memoryUsage().heapUsed/2**20);
 return summary;
}
test('Phase 2 incremental pipeline and random scrub benchmark',async()=>{
 await mkdir('docs/checkpoints/v12-p2',{recursive:true});
 const report={phase:'v12-p2',base:'14e2a17',recordedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,cpus:cpus().length,memoryGiB:totalmem()/2**30},
  note:'Node processing, not WebGL/GPU. Append: 1000 raw-event batches. Scrub: 30 deterministic random samples. One construction sample per size. Retained heap includes generator raw input, semantic events/history and exported JSON; reload transients are collected with explicit GC. Not isolated checkpoint bytes.',samples:[]};
 for(const size of (process.env.VJ_P2_SIZES??'5000,20000,100000,205000').split(',').map(Number)){
  report.samples.push(measure(size));
  await writeFile(out,JSON.stringify(report,null,2)+'\n');
 }
},300000);
