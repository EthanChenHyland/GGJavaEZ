import {expect,it} from 'vitest'
import fc from 'fast-check'
import {accessibleEntities} from './accessibleEntities'
import {generateRawTrace} from '../testing/traceGen'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {createLayoutEngine} from '../world/layoutEngine'
import {createSceneProjector} from '../world/sceneProjector'
import {planPresentation} from '../world/presentationPlanner'
it('Property 65: accessible identities equal actual pickable visible geometry in spatial order (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100000}),seed=>{
  const raw=generateRawTrace({seed,rawEvents:80,callRate:.6,maxDepth:8}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace,layout=createLayoutEngine();layout.append(trace.events)
  const scene=createSceneProjector(trace).project(seek(trace,trace.events.length),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
  const plan=planPresentation({scene,layout:layout.state,detailLevel:'FAR',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}}),project=(point:readonly[number,number,number])=>({x:point[0]*10,y:-point[1]*10,visible:point[2]>=0})
  const observed=accessibleEntities(scene,plan,project),expected=[...plan.entities].filter(([id,item])=>item.pickable&&project(scene.entities[id].anchor.position).visible).map(([id])=>id).concat(plan.clusters.filter(item=>item.pickable&&project(item.anchor.position).visible).map(item=>item.id))
  expect(observed.map(item=>item.id).sort()).toEqual(expected.sort())
  for(let index=1;index<observed.length;index++)expect(observed[index].y>observed[index-1].y||observed[index].y===observed[index-1].y&&observed[index].x>=observed[index-1].x).toBe(true)
  expect(new Set(observed.map(item=>item.id)).size).toBe(observed.length)
 }),{numRuns:100})
})
