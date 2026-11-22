import {expect,it} from 'vitest'
import type {SceneExceptionPath} from '../contracts/world'
import type {RawRuntimeEvent} from '../instrumentation/contracts'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {generateRawTrace} from '../testing/traceGen'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector} from './sceneProjector'
import {exceptionPanelAnchor,exceptionPanelFor} from './exceptionPanelPlacement'
import {planPresentation} from './presentationPlanner'
import type {FlowCatalog,SceneFlow} from './flowCatalog'
function fixture(){
 const raw=generateRawTrace({seed:11,rawEvents:80,classes:2,callRate:.6,allocateRate:.7,maxDepth:4}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
 const layout=createLayoutEngine();layout.append(trace.events)
 const scene=createSceneProjector(trace).project(seek(trace,trace.events.length),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const frames=scene.order.frames
 expect(frames.length).toBeGreaterThan(1)
 const exception:SceneExceptionPath={exceptionId:null,className:'pkg.Failure',simpleName:'Failure',message:'captured failure',throwFrameId:frames.at(-1)!,unwound:[frames.at(-1)!],catchFrameId:null,uncaught:true,causes:[],complete:true,throwLine:null,stack:[],stackEvidence:{kind:'unavailable',introducedSeq:null,changedSeq:null,eventIds:[],unavailableReason:'not captured'},causeEvidence:{kind:'unavailable',introducedSeq:null,changedSeq:null,eventIds:[],unavailableReason:'not captured'},evidence:{kind:'observed',introducedSeq:1,changedSeq:1,eventIds:['throw']}}
 return{scene:{...scene,exception},layout:layout.state}
}
it('adds structural evidence only at the uncaught live head without changing semantic anchors',()=>{
 const{scene}=fixture(),before=Object.values(scene.entities).map(node=>node.anchor),panel=exceptionPanelFor(scene)!
 expect(panel).not.toBeNull()
 const anchor=exceptionPanelAnchor(panel,scene.recording),throwAnchor=scene.entities[scene.exception!.throwFrameId!].anchor
 expect(anchor.position[0]+anchor.size[0]/2).toBeLessThan(throwAnchor.position[0]-throwAnchor.size[0]/2)
 expect(Object.values(scene.entities).map(node=>node.anchor)).toEqual(before)
 expect(scene.entities[anchor.entityId]).toBeUndefined()
 expect(exceptionPanelFor({...scene,cursor:scene.cursor-1})).toBeNull()
 expect(exceptionPanelFor({...scene,exception:{...scene.exception!,uncaught:false}})).toBeNull()
 expect(exceptionPanelFor({...scene,exception:null})).toBeNull()
})
it('preserves explicit Focus and the forensic evidence when dimming other context',()=>{
 const{scene,layout}=fixture(),target=scene.order.frames[0],throwing=scene.exception!.throwFrameId!
 const input={scene,layout,detailLevel:'CLOSE' as const,selection:{kind:'frame' as const,id:target},focusTargetId:target,trace:{active:true,scope:'relevant' as const}}
 const plan=planPresentation(input)
 expect(plan.exceptionPanel).not.toBeNull()
 expect(plan.entities.get(throwing)).toMatchObject({opacity:1,pinned:true,highlight:'exception'})
 expect(plan.entities.get(target)).toMatchObject({opacity:1,pinned:true})
 for(const[id,entity]of plan.entities)if(id!==throwing&&id!==target)expect(entity.opacity).toBeLessThanOrEqual(.4)
 for(const cluster of plan.clusters)expect(cluster.opacity).toBeLessThanOrEqual(.4)
 for(const curve of plan.curves)expect(curve.opacity).toBeLessThanOrEqual(curve.colorRole==='exception'?1:.4)
 const history=planPresentation({...input,scene:{...scene,cursor:scene.cursor-1},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(history.exceptionPanel).toBeNull()
 const next=planPresentation({...input,scene:{...scene,exception:null},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(next.exceptionPanel).toBeNull()
})

it('places the panel beside the exact throw, unwind and catch invocations in an observed prefix',()=>{
 const raw=[
  {type:'enter',frameId:'catcher',methodName:'run',callerFrameId:null,receiver:null,parameters:[]},
  {type:'enter',frameId:'origin',methodName:'fail',callerFrameId:'catcher',receiver:null,parameters:[]},
  {type:'throw',frameId:'origin',methodName:'fail',objectId:'failure',className:'pkg.Failure',message:'boom',explicit:true},
  {type:'unwind',frameId:'origin',methodName:'fail',objectId:'failure'},
  {type:'catch',frameId:'catcher',methodName:'run',objectId:'failure'},
  {type:'exit',frameId:'catcher',methodName:'run'},
 ].map((event,seq)=>({v:1,provenanceVersion:1,seq,site:seq,line:seq+3,threadId:'1',className:'pkg.App',descriptor:'()V',...event})) as RawRuntimeEvent[]
 const trace=normalizeTrace(raw,{sources:[],classes:[]},{status:'complete',exitCode:0,diagnostic:null}).trace
 const layout=createLayoutEngine();layout.append(trace.events)
 const projector=createSceneProjector(trace)
 const project=(cursor:number)=>projector.project(seek(trace,cursor),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const snapshots=trace.events.map(event=>({event,scene:project(event.seq+1)}))
 for(const phase of ['throw','unwind','catch'] as const){
  const type={throw:'THROW_EXCEPTION',unwind:'UNWIND_EXCEPTION',catch:'CATCH_EXCEPTION'}[phase]
  const frameId=phase==='catch'?'jvm:frame:catcher':'jvm:frame:origin'
  const matches=snapshots.filter(({event})=>event.type===type||event.type==='EXECUTION_FACT'&&event.fact.kind===phase)
  expect(matches).toHaveLength(2)
  for(const {event,scene} of matches){
   const panel=exceptionPanelFor(scene),frame=scene.entities[frameId].anchor
   expect(panel?.content.current).toMatchObject({eventId:event.eventId,phase,frameId})
   expect(panel?.position[1]).toBe(frame.position[1])
   expect(scene.entities[frameId].anchor).toBe(layout.state.anchors[frameId])
  }
 }
 const ordinary=snapshots.find(({event})=>event.type==='EXIT_METHOD')!.scene
 expect(exceptionPanelFor(ordinary)).toBeNull()
 const caught=snapshots.find(({event})=>event.type==='CATCH_EXCEPTION')!.scene
 expect(exceptionPanelFor({...caught,cursorEvent:ordinary.cursorEvent})).toBeNull()
 expect(exceptionPanelFor(project(trace.events.length))).toBeNull()
})
it('does not promote an earlier exception flow on the same endpoints into the final recorded path',()=>{
 const{scene,layout}=fixture(),from=scene.exception!.throwFrameId!,to=scene.order.objects[0]
 expect(to).toBeTruthy()
 const current:SceneFlow={id:'current-throw',edgeIndex:0,kind:'throw',from:{kind:'frame',id:from},to:{kind:'object',id:to},evidenceEventIds:['throw'],evidenceSeqs:[1],valueText:null}
 const earlier:SceneFlow={...current,id:'earlier-caught-throw',edgeIndex:1,evidenceEventIds:['caught-earlier']}
 const flows:FlowCatalog={extend(){},query:()=>[earlier,current],prefix:()=>[earlier,current],iteratePrefix:()=>[earlier,current],atEvent:()=>[],bundles:()=>[],recordedProvenanceOf:()=>[],drawableFlowsOf:()=>[]}
 for(const focusTargetId of[null,scene.order.frames[0]]){
  const plan=planPresentation({scene,layout,flows,detailLevel:'CLOSE',selection:null,focusTargetId,trace:{active:true,scope:'all'}})
  expect(plan.curves.find(curve=>curve.id===current.id)).toMatchObject({colorRole:'exception',opacity:.84,widthPx:2.5})
  expect(plan.curves.find(curve=>curve.id===earlier.id)?.opacity).toBeLessThanOrEqual(.4)
 }
})
