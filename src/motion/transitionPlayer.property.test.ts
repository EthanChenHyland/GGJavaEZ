import {expect,it,vi} from 'vitest'
import fc from 'fast-check'
import {loadPersonTrace} from '../examples/traces'
import {historyForTrace} from '../runtime/history'
import {createVirtualClock} from './clock'
import {createTransitionPlayer} from './transitionPlayer'
import {deriveSemanticTransitions} from './semanticTransition'
import {generateRawTrace} from '../testing/traceGen'
import {normalizeTrace} from '../instrumentation/normalize'
import {createTimelineStore,type TimelineAction} from '../timeline/timelineStore'
import {createTimelineMotionBinding} from './timelineMotion'
import {createLayoutEngine} from '../world/layoutEngine'
import {createSceneProjector} from '../world/sceneProjector'
import type {TraceDocument} from '../contracts/runtime'
const setup=()=>{const trace=loadPersonTrace(),clock=createVirtualClock(),player=createTransitionPlayer({trace,history:historyForTrace(trace)},clock);return{trace,clock,player}}
it('Property 54: overlays use only the requested accepted Event interval and speed scales actual durations (100 runs)',()=>{
 fc.assert(fc.property(fc.nat(1000),fc.constantFrom(.25,.5,1,2,4),(offset,speed)=>{
  const {trace,clock,player}=setup(),from=offset%trace.events.length,to=from+1
  player.cursorChanged({from,to,reason:'play',speed,reducedMotion:false})
  const sample=player.sample(clock.now(),()=>true)
  for(const overlay of sample.overlays){expect(overlay.step.seq).toBe(from);expect(overlay.step.eventId).toBe(trace.events[from].eventId);expect(overlay.step.durationMs*speed).toBeGreaterThanOrEqual(300);expect(overlay.step.durationMs*speed).toBeLessThanOrEqual(700)}
 }),{numRuns:100})
})
it('Property 55: every user change interrupts pending work and scrubbing has no overlays (100 runs)',()=>{
 fc.assert(fc.property(fc.nat(1000),fc.integer({min:1,max:20}),(seed,head)=>{
  const{clock,player}=setup();player.cursorChanged({from:0,to:head,reason:'live',speed:1,reducedMotion:false});expect(player.pendingCount).toBeLessThanOrEqual(8)
  player.scrubStarted();expect(player.pendingCount).toBe(0);expect(player.sample(clock.now(),()=>true)).toEqual({overlays:[],settle:null,animating:false})
  player.cursorChanged({from:head,to:seed%21,reason:'scrub',speed:1,reducedMotion:false});expect(player.sample(clock.now(),()=>true).overlays).toEqual([])
  player.scrubEnded(seed%21);const settle=player.sample(clock.now(),()=>true);expect(settle.settle?.progress).toBe(0);clock.step(250);expect(player.sample(clock.now(),()=>true).animating).toBe(false)
 }),{numRuns:100})
})
it('Property 55: LIVE backlog never exceeds eight and overflow or stale work settles in at most 250 ms (100 runs)',()=>{
 fc.assert(fc.property(fc.array(fc.integer({min:0,max:900}),{minLength:1,maxLength:30}),delays=>{
  const{clock,player}=setup();let from=0
  for(const delay of delays){clock.step(delay);const to=Math.min(21,from+1);player.cursorChanged({from,to,reason:'live',speed:1,reducedMotion:false});expect(player.pendingCount).toBeLessThanOrEqual(8);player.sample(clock.now(),()=>true);from=to}
  player.cursorChanged({from:0,to:21,reason:'seek',speed:1,reducedMotion:false});expect(player.pendingCount).toBe(0);clock.step(250);expect(player.sample(clock.now(),()=>true).animating).toBe(false)
 }),{numRuns:100})
})
it('Property 54: generated provenance steps retain exact Event/edge evidence in either playback direction (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100000}),fc.nat(1000),fc.boolean(),(seed,offset,reverse)=>{
  const raw=generateRawTrace({seed,rawEvents:30,classes:2,maxDepth:3,allocateRate:.7,provenance:true})
  const normalized=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
  const trace={...normalized,events:normalized.events.map((event,index)=>({...event,eventId:`opaque/${seed}/${index.toString(36)}`}))}
  const history=historyForTrace(trace),clock=createVirtualClock(),player=createTransitionPlayer({trace,history},clock)
  const index=offset%trace.events.length,event=trace.events[index],before=history.materialize(index),after=history.materialize(index+1)
  const expected=deriveSemanticTransitions(before,event,after)
  player.cursorChanged({from:reverse?index+1:index,to:reverse?index:index+1,reason:reverse?'reverse':'play',speed:1,reducedMotion:false})
  const sample=player.sample(clock.now(),()=>true)
  for(const overlay of sample.overlays){
   expect(overlay.step.eventId).toBe(event.eventId)
   expect(overlay.step.direction).toBe(reverse?'reverse':'forward')
   expect(expected).toContainEqual(overlay.step.transition)
   if(overlay.step.flowId)expect(after.executionGraph?.edges.some(edge=>edge.id===overlay.step.flowId&&edge.eventId===event.eventId)).toBe(true)
  }
  expect(player.sample(clock.now(),()=>false).overlays).toEqual([])
 }),{numRuns:100})
})
it('Property 55: sample expires stalled LIVE overlays without another batch, but slow HISTORY keeps its duration (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:751,max:1500}),elapsed=>{
  const live=setup(),history=setup()
  for(const [test,reason]of [[live,'live'],[history,'play']]as const){test.player.cursorChanged({from:1,to:2,reason,speed:.25,reducedMotion:false});test.player.sample(test.clock.now(),()=>true);test.clock.step(elapsed)}
  expect(live.player.sample(live.clock.now(),()=>true).settle).toEqual({cursor:2,progress:0})
  expect(live.player.pendingCount).toBe(0)
  expect(history.player.sample(history.clock.now(),()=>true).overlays[0]?.progress).toBeCloseTo(elapsed/1800)
  live.clock.step(250);expect(live.player.sample(live.clock.now(),()=>true).animating).toBe(false)
 }),{numRuns:100})
})
it('Property 56: motion cannot alter committed cursor/runtime/selection/pose/scene for the same input sequence (100 runs)',()=>{
 const trace=loadPersonTrace(),history=historyForTrace(trace),layout=createLayoutEngine();layout.append(trace.events)
 const actions:TimelineAction[]=[{type:'stepForward'},{type:'stepBack'},{type:'seek',cursor:18},{type:'replay'},{type:'returnLive'},{type:'beginScrub'},{type:'seek',cursor:7},{type:'endScrub'},{type:'reversePlay'},{type:'tick'}]
 fc.assert(fc.property(fc.array(fc.integer({min:0,max:actions.length-1}),{minLength:1,maxLength:25}),indices=>{
  const selection=Object.freeze({kind:'object',id:'object:person:17'}),pose=Object.freeze({target:[0,0,0],distance:24,yawDeg:8,pitchDeg:-13})
  const selectionText=JSON.stringify(selection),poseText=JSON.stringify(pose),initialTrace=JSON.stringify(trace)
  const run=(reducedMotion:boolean)=>{
   const clock=createVirtualClock(),player=createTransitionPlayer({trace,history},clock)
   const timeline=createTimelineStore({recordingId:'same-recording',liveHead:trace.events.length,partial:false,hostLens:'HISTORY'})
   const detach=createTimelineMotionBinding(player,timeline,()=>reducedMotion)()
   for(const index of indices){timeline.dispatch(actions[index]);const state=timeline.getSnapshot().state,runtime=history.materialize(state.cursor),before=JSON.stringify(runtime);clock.step(37);const frame=player.sample(clock.now(),()=>true);expect(JSON.stringify(runtime)).toBe(before);if(reducedMotion){expect(frame.animating).toBe(false);expect(frame.overlays.every(overlay=>overlay.static&&overlay.progress===1)).toBe(true)}}
   timeline.dispatch({type:'endScrub'});for(let frame=0;frame<10;frame++){clock.step(10000);player.sample(clock.now(),()=>true)}expect(player.pendingCount).toBe(0);detach()
   const state=timeline.getSnapshot().state,runtime=history.materialize(state.cursor)
   const scene=createSceneProjector(trace).project(runtime,layout.state,{sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
   return{state,runtime,selection,pose,scene}
  }
  expect(run(true)).toEqual(run(false))
  expect(JSON.stringify(selection)).toBe(selectionText);expect(JSON.stringify(pose)).toBe(poseText);expect(JSON.stringify(trace)).toBe(initialTrace)
 }),{numRuns:100})
})
it('reduced motion marks only the destination event after a seek, without reading its crossed interval',()=>{
 const{trace,clock,player}=setup()
 const history=historyForTrace(trace),materialize=vi.spyOn(history,'materialize')
 const target=trace.events.findIndex(event=>event.type==='SET_FIELD')+1
 player.cursorChanged({from:0,to:target,reason:'seek',speed:1,reducedMotion:true})
 const initial=player.sample(clock.now(),()=>true)
 expect(initial.overlays.map(item=>item.step.seq)).toEqual([target-1]);expect(player.pendingCount).toBe(0)
 expect(materialize.mock.calls.map(([cursor])=>cursor)).toEqual([target-1,target])
 clock.step(2000);expect(player.sample(clock.now(),()=>true)).toEqual(initial)
 player.cursorChanged({from:target,to:target,reason:'lens',speed:1,reducedMotion:true})
 expect(player.sample(clock.now(),()=>true)).toEqual(initial)
 player.cursorChanged({from:target,to:1,reason:'seek',speed:1,reducedMotion:true})
 expect(player.sample(clock.now(),()=>true).overlays).not.toEqual(initial.overlays)
 materialize.mockRestore()
})
it('activating reduced motion finishes the active overlay immediately and retains recorded static subjects',()=>{
 const{clock,player}=setup()
 player.cursorChanged({from:1,to:2,reason:'play',speed:1,reducedMotion:false});player.sample(clock.now(),()=>true);clock.step(80)
 player.cursorChanged({from:2,to:2,reason:'seek',speed:1,reducedMotion:true})
 expect(player.pendingCount).toBe(0);expect(player.sample(clock.now(),()=>true)).toMatchObject({animating:false,settle:null,overlays:[{static:true,progress:1}]})
})
it('coalesces fast batches to the latest applied event and at most two steps',()=>{
 const{trace,clock,player}=setup()
 const target=trace.events.findIndex(event=>event.type==='SET_FIELD')+1
 const history=historyForTrace(trace),materialize=vi.spyOn(history,'materialize')
 player.cursorChanged({from:0,to:target,reason:'live',speed:4,reducedMotion:false})
 expect(materialize.mock.calls.map(([cursor])=>cursor)).toEqual([target-1,target])
 expect(player.pendingCount).toBeLessThanOrEqual(2)
 expect(player.sample(clock.now(),()=>true).overlays[0]?.step.seq).toBe(target-1)
 clock.step(151)
 expect(player.sample(clock.now(),()=>true).animating).toBe(false)
 materialize.mockRestore()
})
it('submitted but unconsumed stdin bytes cause no motion or static runtime highlight',()=>{
 const trace:TraceDocument={...loadPersonTrace(),schemaVersion:2,events:[
  {type:'PROGRAM_START',eventId:'begin',seq:0,source:null,label:'start',importance:'normal'},
  {type:'CONSOLE_INPUT',eventId:'submitted',seq:1,source:null,label:'submitted bytes',importance:'normal',frameId:null,text:'42\n'},
 ]}
 const clock=createVirtualClock(),player=createTransitionPlayer({trace,history:historyForTrace(trace)},clock)
 for(const reducedMotion of [false,true]){player.cursorChanged({from:1,to:2,reason:'live',speed:1,reducedMotion});expect(player.sample(clock.now(),()=>true)).toEqual({overlays:[],settle:null,animating:false})}
})
it('reduced motion keeps only recorded static subjects and culls invisible steps immediately',()=>{
 const{clock,player}=setup();player.cursorChanged({from:0,to:1,reason:'step',speed:1,reducedMotion:true});expect(player.sample(clock.now(),()=>true).animating).toBe(false);expect(player.sample(clock.now(),()=>false).overlays).toEqual([])
 player.cursorChanged({from:0,to:1,reason:'step',speed:1,reducedMotion:false});expect(player.sample(clock.now(),()=>false)).toEqual({overlays:[],settle:null,animating:false});expect(player.pendingCount).toBe(0)
})
