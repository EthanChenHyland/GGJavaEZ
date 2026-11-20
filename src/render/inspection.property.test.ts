import { expect,it } from 'vitest'
import fc from 'fast-check'
import { generateRawTrace } from '../testing/traceGen'
import { normalizeTrace } from '../instrumentation/normalize'
import { seek } from '../runtime'
import { createFlowCatalog } from '../world/flowCatalog'
import { createLayoutEngine } from '../world/layoutEngine'
import { createSceneProjector } from '../world/sceneProjector'
import { inspectorEntity,inspectorProvenance,inspectorRows } from './inspection'
// Feature: reference-exact-rebuild, Property 50: Inspector completeness within recorded evidence bounds
it('Flow and storage Inspector evidence contains all captured adjacency at the applied prefix (100 runs)',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:100000}),fc.nat(10000),(seed,offset)=>{
    const raw=generateRawTrace({seed,rawEvents:35,classes:3,maxDepth:4,callRate:.5,provenance:true});
    const trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace;
    const head=seek(trace,trace.events.length),catalog=createFlowCatalog();catalog.extend(head.executionGraph!,trace);
    const layout=createLayoutEngine();layout.append(trace.events);
    const cursor=offset%(trace.events.length+1),runtime=seek(trace,cursor),before=JSON.stringify(runtime);
    const scene=createSceneProjector(trace).project(runtime,layout.state,{liveHead:trace.events.length,sessionEnded:false,pausedAtLiveHead:false,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}});
    const edges=runtime.executionGraph?.edges??[],flow=edges[offset%Math.max(1,edges.length)];
    if(flow){
      const ids=new Set([flow.from,flow.to,...(flow.originSlotId?[flow.originSlotId]:[])]);
      const expected=edges.filter(edge=>ids.has(edge.from)||ids.has(edge.to)||!!edge.originSlotId&&ids.has(edge.originSlotId));
      const observed=inspectorProvenance(catalog,{kind:'flow',id:flow.id},null,cursor,flow);
      expect(observed.map(item=>item.edgeId)).toEqual(expected.map(edge=>edge.id));
      expect(observed.some(item=>item.edgeId===flow.id)).toBe(true);
      for(const item of observed){const captured=edges[item.edgeIndex];expect(item).toMatchObject({kind:captured.kind,from:captured.from,to:captured.to,eventId:captured.eventId,graphEvidence:captured.evidence})}
    }
    for(const node of Object.values(scene.entities)){
      const rows=inspectorRows(node);
      for(let index=0;index<Math.min(rows.count,30);index++){
        const row=rows.at(index);
        expect(inspectorEntity(scene,{kind:'slot',id:row.slotId})).toBe(node);
        expect(typeof row.value.exact).toBe('string');
        if(row.value.kind==='not-recorded')expect(row.value.observation).toBe('UNAVAILABLE');
      }
    }
    expect(JSON.stringify(runtime)).toBe(before);
  }),{numRuns:100});
});
