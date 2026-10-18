import {expect,it} from 'vitest'
import {generateRawTrace} from '../testing/traceGen'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {createLayoutEngine} from '../world/layoutEngine'
import {createSceneProjector} from '../world/sceneProjector'
import {planPresentation} from '../world/presentationPlanner'
import {homeFraming,homeInvocations} from './homeFraming'
import {projectionCamera,screenPoint} from './projection'
import {heroTrace} from '../testing/heroTrace'
import {projectTrace} from '../testing/projectTrace'
import type {TraceEvent} from '../contracts/runtime'
import {buildSolidBatch} from '../render/SolidBatch'
import {placeStructuralLabels,projectStructuralObstacle,regionHeadingSpec} from '../render/text/structuralLabelLayout'
it('Home frames the most recent invocation and its actual nearest ancestors after completion',()=>{
 const raw=generateRawTrace({seed:17,rawEvents:80,callRate:.9,maxDepth:8}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
 const layout=createLayoutEngine();layout.append(trace.events)
 const scene=createSceneProjector(trace).project(seek(trace,trace.events.length),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const frames=homeInvocations(scene);expect(frames.at(-1)).toBe(scene.order.frames.at(-1));expect(frames.length).toBeLessThanOrEqual(4)
 const plan=planPresentation({scene,layout:layout.state,detailLevel:'MEDIUM',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}}),safe={x:450,y:100,width:920,height:630},viewport={width:1440,height:900}
 const home=homeFraming(scene,plan,safe,viewport),camera=projectionCamera(home.pose,viewport)
 expect(home.pose.yawDeg).toBe(8);expect(home.pose.pitchDeg).toBe(-13)
 for(const point of home.points){const projected=screenPoint(point,camera,viewport);expect(projected.x).toBeGreaterThanOrEqual(safe.x);expect(projected.x).toBeLessThanOrEqual(safe.x+safe.width);expect(projected.y).toBeGreaterThanOrEqual(safe.y);expect(projected.y).toBeLessThanOrEqual(safe.y+safe.height)}
})
for(const viewport of [{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650}])it(`Home keeps real region headings visible above a deep live stack and its library argument proxy ${viewport.width}x${viewport.height}`,()=>{
 const {trace}=heroTrace();trace.events=trace.events.slice(0,4)
 for(let depth=0;depth<7;depth++)trace.events.push({type:'ENTER_METHOD',frameId:`recursive/${depth}`,callerFrameId:depth?`recursive/${depth-1}`:'entry',className:'domain.Root',methodName:'total',locals:[{id:`n/${depth}`,name:'n',javaType:'int',role:'parameter',value:{kind:'primitive',javaType:'int',value:7-depth}}],seq:trace.events.length,eventId:`recursive-enter/${depth}`,source:{fileId:'Unit.java',line:1},label:'Recorded call',importance:'normal'} as TraceEvent)
 const projection=projectTrace(trace),scene=projection.project(trace.events.length),plan=planPresentation({scene,layout:projection.layout,detailLevel:'MEDIUM',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(scene.liveStack).toHaveLength(8);expect(plan.clusters.some(cluster=>cluster.anchor.region==='library')).toBe(true)
 const {width:w,height:h}=viewport,left=w<1024?40:Math.max(w*.27,340+w*.02),safe={x:left,y:h*.1,width:w*.985-left,height:h*.73}
 const home=homeFraming(scene,plan,safe,viewport,projection.layout),camera=projectionCamera(home.pose,viewport)
 const blocked=buildSolidBatch(scene,plan).filter(solid=>solid.role!=='face').flatMap(solid=>{const obstacle=projectStructuralObstacle(solid.anchor,camera,viewport);return obstacle?[obstacle]:[]})
 const labels=placeStructuralLabels(plan.headings.slice(0,2).map(heading=>regionHeadingSpec(heading.id,heading.position)),camera,viewport,safe,blocked)
 for(const label of labels){expect(label.visible,`${label.id} is actually visible`).toBe(true);expect(label.minimumFontPixels).toBeGreaterThanOrEqual(12)}
})
