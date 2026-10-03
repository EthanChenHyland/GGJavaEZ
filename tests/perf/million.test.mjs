import { test, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { generateRawTrace } from '../../src/testing/traceGen.ts';
import { TraceNormalizer } from '../../src/instrumentation/normalize.ts';
test('one million semantic-event bounded scalability probe',async()=>{
 globalThis.gc?.();const before=process.memoryUsage().heapUsed;
 const input=generateRawTrace({rawEvents:820000,seed:42});const normalizer=new TraceNormalizer(input.manifest);
 const start=performance.now();
 for(let from=0;from<input.rawEvents.length;from+=256)normalizer.append(input.rawEvents.slice(from,from+256));
 normalizer.finish({status:'complete',exitCode:0,diagnostic:null});const constructMs=performance.now()-start;
 globalThis.gc?.();const retainedMiB=(process.memoryUsage().heapUsed-before)/2**20;
 let seed=12345;const jumps=[];
 for(let i=0;i<30;i++){seed=(seed*1664525+1013904223)>>>0;const t=performance.now();normalizer.history.materialize(Math.floor(seed/2**32*normalizer.history.length));jumps.push(performance.now()-t)}
 const sorted=[...jumps].sort((a,b)=>a-b);const liveStart=performance.now();normalizer.history.materialize(normalizer.history.length);const returnToLiveMs=performance.now()-liveStart;
 expect(normalizer.state.status).toBe('ended');
 await writeFile(`${process.env.VJ_PERF_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p2'}/million.json`,JSON.stringify({rawEvents:input.rawEvents.length,semanticEvents:normalizer.history.length,constructMs,retainedMiB,explicitGc:typeof globalThis.gc==='function',scrubMs:{p50:sorted[15],p95:sorted[28],max:sorted[29]},returnToLiveMs,policy:normalizer.history.stats,note:'Single probe; no million-event archive reload or WebGL scene. Heap includes raw generator input plus canonical semantic events/state and shared checkpoint roots.'},null,2)+'\n');
 normalizer.history.dispose();
},60000);
