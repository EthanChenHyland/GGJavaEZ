import { test, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { generateRawTrace } from '../../src/testing/traceGen.ts';
import { TraceNormalizer } from '../../src/instrumentation/normalize.ts';
import { ExecutionHistory } from '../../src/runtime/history.ts';
const clock=f=>{const t=performance.now();const result=f();return [result,performance.now()-t]};
const pct=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor(a.length*p)];
test('bounded batching and checkpoint policy comparison', async()=>{
 const input=generateRawTrace({rawEvents:100000,seed:42});
 const batches=[];
 for(const batchSize of [64,256,1024]){
  globalThis.gc?.();const normalizer=new TraceNormalizer(input.manifest);const timings=[];
  for(let from=0;from<input.rawEvents.length;from+=batchSize)
   timings.push(clock(()=>normalizer.append(input.rawEvents.slice(from,from+batchSize)))[1]);
  normalizer.finish({status:'complete',exitCode:0,diagnostic:null});
  batches.push({batchSize,totalMs:timings.reduce((a,b)=>a+b,0),p50:pct(timings,.5),p95:pct(timings,.95),max:Math.max(...timings)});
  normalizer.history.dispose();
 }
 const normalizer=new TraceNormalizer(input.manifest);normalizer.append(input.rawEvents);normalizer.finish({status:'complete',exitCode:0,diagnostic:null});
 const events=normalizer.trace.events;normalizer.history.dispose();globalThis.gc?.();
 const checkpoints=[];
 for(const maxCheckpoints of [16,64,128,256]){
  globalThis.gc?.();const before=process.memoryUsage().heapUsed;
  const history=new ExecutionHistory({sourceFiles:normalizer.trace.sourceFiles,schemaVersion:2,maxCheckpoints});
  const [,indexMs]=clock(()=>history.append(events));globalThis.gc?.();
  const indexedMiB=(process.memoryUsage().heapUsed-before)/2**20;
  let seed=12345;const jumps=[];
  for(let i=0;i<30;i++){seed=(seed*1664525+1013904223)>>>0;jumps.push(clock(()=>history.materialize(Math.floor(seed/2**32*history.length)))[1]);}
  expect(history.state.status).toBe('ended');
  checkpoints.push({maxCheckpoints,indexMs,indexedMiB,scrubMs:{p50:pct(jumps,.5),p95:pct(jumps,.95),max:Math.max(...jumps)},stats:history.stats});
  history.dispose();
 }
 await writeFile('docs/checkpoints/v12-p2/policy.json',JSON.stringify({rawEvents:input.rawEvents.length,semanticEvents:events.length,explicitGc:typeof globalThis.gc==='function',batches,checkpoints},null,2)+'\n');
},60000);
