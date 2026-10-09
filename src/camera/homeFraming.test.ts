import {expect,it} from 'vitest'
import {generateRawTrace} from '../testing/traceGen'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {createLayoutEngine} from '../world/layoutEngine'
import {createSceneProjector} from '../world/sceneProjector'
import {planPresentation} from '../world/presentationPlanner'
import {homeFraming,homeInvocations} from './homeFraming'
import {projectionCamera,screenPoint} from './projection'
it('Home frames the most recent invocation and its actual nearest ancestors after completion',()=>{
 const raw=generateRawTrace({seed:17,rawEvents:80,callRate:.9,maxDepth:8}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
 const layout=createLayoutEngine();layout.append(trace.events)
 const scene=createSceneProjector(trace).project(seek(trace,trace.events.length),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const frames=homeInvocations(scene);expect(frames.at(-1)).toBe(scene.order.frames.at(-1));expect(frames.length).toBeLessThanOrEqual(4)
 const plan=planPresentation({scene,layout:layout.state,detailLevel:'MEDIUM',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}}),safe={x:450,y:100,width:920,height:630},viewport={width:1440,height:900}
 const home=homeFraming(scene,plan,safe,viewport),camera=projectionCamera(home.pose,viewport)
 for(const point of home.points){const projected=screenPoint(point,camera,viewport);expect(projected.x).toBeGreaterThanOrEqual(safe.x);expect(projected.x).toBeLessThanOrEqual(safe.x+safe.width);expect(projected.y).toBeGreaterThanOrEqual(safe.y);expect(projected.y).toBeLessThanOrEqual(safe.y+safe.height)}
})
