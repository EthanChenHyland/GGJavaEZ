import {expect,it} from 'vitest'
import type {SceneExceptionPath} from '../contracts/worldV2'
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
it('keeps captured path entities opaque through Focus and Trace while dimming the forensic context',()=>{
 const{scene,layout}=fixture(),target=scene.order.frames[0],throwing=scene.exception!.throwFrameId!
 const input={scene,layout,detailLevel:'CLOSE' as const,selection:{kind:'frame' as const,id:target},focusTargetId:target,trace:{active:true,scope:'relevant' as const}}
 const plan=planPresentation(input)
 expect(plan.exceptionPanel).not.toBeNull()
 expect(plan.entities.get(throwing)).toMatchObject({opacity:1,pinned:true,highlight:'exception'})
 for(const[id,entity]of plan.entities)if(id!==throwing)expect(entity.opacity).toBeLessThanOrEqual(.4)
 for(const cluster of plan.clusters)expect(cluster.opacity).toBeLessThanOrEqual(.4)
 for(const curve of plan.curves)expect(curve.opacity).toBeLessThanOrEqual(curve.colorRole==='exception'?1:.4)
 const history=planPresentation({...input,scene:{...scene,cursor:scene.cursor-1},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(history.exceptionPanel).toBeNull()
 const next=planPresentation({...input,scene:{...scene,exception:null},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(next.exceptionPanel).toBeNull()
})
it('does not promote an earlier exception flow on the same endpoints into the final recorded path',()=>{
 const{scene,layout}=fixture(),from=scene.exception!.throwFrameId!,to=scene.order.objects[0]
 expect(to).toBeTruthy()
 const current:SceneFlow={id:'current-throw',edgeIndex:0,kind:'throw',from:{kind:'frame',id:from},to:{kind:'object',id:to},evidenceEventIds:['throw'],evidenceSeqs:[1],valueText:null}
 const earlier:SceneFlow={...current,id:'earlier-caught-throw',edgeIndex:1,evidenceEventIds:['caught-earlier']}
 const flows:FlowCatalog={extend(){},query:()=>[earlier,current],prefix:()=>[earlier,current],atEvent:()=>[],bundles:()=>[],recordedProvenanceOf:()=>[],drawableFlowsOf:()=>[]}
 const plan=planPresentation({scene,layout,flows,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:true,scope:'all'}})
 expect(plan.curves.find(curve=>curve.id===current.id)).toMatchObject({colorRole:'exception',opacity:1})
 expect(plan.curves.find(curve=>curve.id===earlier.id)?.opacity).toBeLessThanOrEqual(.4)
})
