import {expect,it} from 'vitest'
import type {RuntimeTypeMetadata,TraceEvent} from '../contracts/runtime'
import {createLayoutEngine} from './layoutEngine'
import {ownershipObservation,recordedOwnership} from './recordedOwnership'
const metadata=(ownership:RuntimeTypeMetadata['ownership']):RuntimeTypeMetadata=>({ownership,runtimeType:'java.util.MisleadingName',packageName:'java.util'})
const base=(seq:number)=>({seq,eventId:`unit/metadata/${seq}`,source:null,label:'Ownership metadata unit fixture',importance:'quiet' as const})
function events():TraceEvent[]{return[
 {...base(0),type:'ALLOCATE_OBJECT',objectId:'opaque-object',displayId:1,className:'java.util.MisleadingName',fields:[]},
 {...base(1),type:'CLASS_OBSERVE',classId:'opaque-class',className:'java.util.MisleadingName',fields:[],initialization:'observed',metadata:metadata('PROJECT')},
 {...base(2),type:'OBJECT_OBSERVE',objectId:'opaque-object',metadata:metadata('LIBRARY')},
 {...base(3),type:'OBJECT_OBSERVE',objectId:'opaque-object',metadata:metadata('LIBRARY')},
 {...base(4),type:'OBJECT_OBSERVE',objectId:'opaque-object',metadata:metadata('JDK')},
 {...base(5),type:'ENTER_METHOD',frameId:'opaque-frame',callerFrameId:null,className:'java.util.MisleadingName',methodName:'run',locals:[]},
 {...base(6),type:'EXECUTION_FACT',fact:{kind:'enter',context:{owner:'java.util.MisleadingName',name:'run',descriptor:'()V',frameId:'opaque-frame',site:null,rawSeq:23,source:null},invocationId:'opaque-frame',callerInvocationId:null,method:{owner:'java.util.MisleadingName',name:'run',descriptor:'()V'},receiver:null,parameters:[],metadata:metadata('SYNTHETIC')}},
]}
it('resolves only the actual applied-prefix metadata, including late observations and changes',()=>{
 const layout=createLayoutEngine();layout.append(events())
 expect(layout.state.placement['opaque-object'].ownershipHistory).toEqual([{seq:2,value:'LIBRARY'},{seq:4,value:'JDK'}])
 for(const cursor of [0,1,2])expect(recordedOwnership(layout.state,'opaque-object',cursor)).toBeUndefined()
 expect(recordedOwnership(layout.state,'opaque-object',3)).toBe('LIBRARY')
 expect(recordedOwnership(layout.state,'opaque-object',4)).toBe('LIBRARY')
 expect(recordedOwnership(layout.state,'opaque-object',5)).toBe('JDK')
 expect(recordedOwnership(layout.state,'opaque-class',1)).toBeUndefined()
 expect(recordedOwnership(layout.state,'opaque-class',2)).toBe('PROJECT')
 expect(recordedOwnership(layout.state,'opaque-frame',6)).toBeUndefined()
 expect(recordedOwnership(layout.state,'opaque-frame',7)).toBe('SYNTHETIC')
 expect(recordedOwnership(layout.state,'absent',7)).toBeUndefined()
})
it('records observations persistently without changing a body, port, earlier snapshot or batch equivalence',()=>{
 const trace=events(),layout=createLayoutEngine();layout.append(trace.slice(0,2))
 const early=layout.state,before=JSON.stringify(early),anchors=JSON.stringify(early.anchors)
 for(let end=3;end<=trace.length;end++)layout.append(trace.slice(0,end))
 for(const[id,anchor]of Object.entries(early.anchors))expect(layout.state.anchors[id]).toEqual(anchor)
 expect(JSON.stringify(early)).toBe(before);expect(JSON.stringify(early.anchors)).toBe(anchors)
 const batch=createLayoutEngine();batch.append(trace);expect(layout.state).toEqual(batch.state)
 expect(()=>{(layout.state.placement['opaque-object'].ownershipHistory as unknown[]).push({seq:9,value:'PROJECT'})}).toThrow('immutable')
})
it('does not infer ownership from class names, source regions, raw ordinal gaps or unrelated calls',()=>{
 const trace=events();expect(ownershipObservation(trace[0])).toBeNull()
 expect(ownershipObservation({...base(0),type:'CONSOLE_WRITE',frameId:'opaque-frame',channel:'stdout',text:'java.util.Library'})).toBeNull()
 expect(ownershipObservation(trace[6])).toEqual({id:'opaque-frame',seq:6,value:'SYNTHETIC'})
})
