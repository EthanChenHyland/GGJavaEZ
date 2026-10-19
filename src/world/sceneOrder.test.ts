import {expect,it} from 'vitest'
import {loadPersonTrace} from '../examples/traces'
import {seek} from '../runtime'
import type {SceneModel} from '../contracts/world'
import type {TraceDocument} from '../contracts/runtime'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector,type ProjectionContext} from './sceneProjector'
import {stackContextHeading} from './invocationContext'
const comparable=(scene:SceneModel)=>{const{revision,...rest}=scene;void revision;return rest}
function run(trace:TraceDocument){
 const layout=createLayoutEngine();layout.append(trace.events)
 const context:ProjectionContext={sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}
 const incremental=createSceneProjector(trace),rebuilt=createSceneProjector(trace)
 incremental.project(seek(trace,0),layout.state,context)
 let from=0
 const saved=JSON.stringify(layout.state)
 for(const to of[18,19,18,21,0,16,18]){
  const state=seek(trace,to),semantic=JSON.stringify(state)
  const actual=incremental.advance(state,layout.state,trace.events,from,to,context),expected=rebuilt.project(state,layout.state,context)
  const entryOrder=trace.events.slice(0,to).flatMap(event=>event.type==='ENTER_METHOD'?[event.frameId]:[])
  expect(actual.order.frames).toEqual(entryOrder);expect(expected.order.frames).toEqual(entryOrder)
  expect(comparable(actual)).toEqual(comparable(expected))
  expect(stackContextHeading(actual,layout.state.headings.stack)).toEqual(stackContextHeading(expected,layout.state.headings.stack))
  expect(JSON.stringify(state)).toBe(semantic);expect(JSON.stringify(layout.state)).toBe(saved)
  from=to
 }
}
it('short multi-entry advances and reverse replay keep recorded catalog/reference order and Home heading identical',()=>run(loadPersonTrace()))
it('catalog order follows recorded entry ordinals even when opaque frame IDs look like integer property keys',()=>{
 let encoded=JSON.stringify(loadPersonTrace())
 for(const[from,to]of[['frame:main:1','2'],['frame:person-constructor:1','10'],['frame:person-setAge:1','1']])encoded=encoded.replaceAll(from,to)
 const trace=JSON.parse(encoded)as TraceDocument
 expect(trace.events.filter(event=>event.type==='ENTER_METHOD').map(event=>event.frameId)).toEqual(['2','10','1'])
 run(trace)
})
