import {expect,it} from 'vitest'
import {arrayElementSlotId,type RuntimeSlot,type RuntimeState,type RuntimeValue,type TraceDocument,type TraceEvent} from '../contracts/runtime'
import {seek} from '../runtime'
import {createRecordedReferenceBindings} from './recordedReferenceBindings'

const ref=(objectId:string):RuntimeValue=>({kind:'reference',javaType:'java.lang.Object',objectId})
const slot=(id:string,value:RuntimeValue):RuntimeSlot=>({id,name:id,javaType:'java.lang.Object',value})
const base=(seq:number)=>({seq,eventId:`unit/bindings/${seq}`,source:null,label:'Normalized binding unit fixture',importance:'normal' as const})
type EventInput=TraceEvent extends infer Event?Event extends TraceEvent?Omit<Event,keyof ReturnType<typeof base>>:never:never
function fixture(inputs:EventInput[]):TraceDocument{
 return{schemaVersion:2,demoId:'unit-recorded-bindings',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'// normalized unit fixture'}],events:[{type:'PROGRAM_START'},...inputs].map((input,seq)=>({...base(seq),...input})) as TraceEvent[]}
}
function runtimeReferences(state:RuntimeState){
 const result:Array<[string,string,string]>=[]
 const add=(owner:string,value:RuntimeSlot)=>{if(value.value.kind==='reference')result.push([owner,value.id,value.value.objectId])}
 for(const frame of Object.values(state.frames))for(const value of Object.values(frame.locals))add(frame.id,value)
 for(const object of Object.values(state.objects)){
  for(const value of Object.values(object.fields))add(object.id,value)
  for(const value of [...object.array?.elements??[],...Object.values(object.array?.sparseElements??{})])add(object.id,value)
 }
 for(const owner of Object.values(state.classes??{}))for(const value of Object.values(owner.statics))add(owner.id,value)
 return result.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
it('agrees with actual normalized RuntimeState references at every prefix and replay boundary',()=>{
 const trace=fixture([
  {type:'ALLOCATE_OBJECT',objectId:'a',displayId:1,className:'Unit',fields:[]},
  {type:'ALLOCATE_OBJECT',objectId:'b',displayId:2,className:'Unit',fields:[]},
  {type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'Unit',methodName:'run',locals:[slot('p',{kind:'null'})]},
  {type:'CREATE_REFERENCE',sourceSlot:{kind:'frame',frameId:'frame',slotId:'p'},targetObjectId:'a',javaType:'java.lang.Object'},
  {type:'OBJECT_OBSERVE',objectId:'a',fields:[slot('field',ref('b'))]},
  {type:'CREATE_REFERENCE',sourceSlot:{kind:'frame',frameId:'frame',slotId:'p'},targetObjectId:'b',javaType:'java.lang.Object'},
  {type:'CLEAR_REFERENCE',sourceSlot:{kind:'frame',frameId:'frame',slotId:'p'}},
  {type:'CREATE_REFERENCE',sourceSlot:{kind:'frame',frameId:'frame',slotId:'p'},targetObjectId:'a',javaType:'java.lang.Object'},
  {type:'ALLOCATE_ARRAY',objectId:'array',displayId:3,elementType:'java.lang.Object',elements:[ref('a'),{kind:'null'}]},
  {type:'ARRAY_WRITE',frameId:'frame',objectId:'array',index:0,value:ref('b')},
  {type:'CLASS_OBSERVE',classId:'jvm:class:Unit',className:'Unit',initialization:'observed',fields:[slot('static',ref('a'))]},
  {type:'SET_STATIC',classId:'jvm:class:Unit',slotId:'static',value:ref('b')},
  {type:'DECLARE_LOCAL',frameId:'frame',slot:slot('retired-local',ref('a'))},
  {type:'REMOVE_LOCAL',frameId:'frame',slotId:'retired-local'},
  {type:'OBJECT_OBSERVE',objectId:'a',fields:[],replaceFields:true},
  {type:'EXIT_METHOD',frameId:'frame'},
  {type:'PROGRAM_END'},
 ])
 const index=createRecordedReferenceBindings(trace.demoId);index.append(trace.events)
 for(let cursor=0;cursor<=trace.events.length;cursor++){
  const current=index.current(cursor).map(binding=>[binding.sourceId,binding.sourceSlotId,binding.targetId] as [string,string,string]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  expect(current,`RuntimeState at ${cursor}`).toEqual(runtimeReferences(seek(trace,cursor)))
  for(const binding of index.historical(cursor)){expect(binding.introducedSeq).toBeLessThan(cursor);expect(binding.endSeq).toBeLessThan(cursor)}
 }
 expect(index.historical(8).filter(binding=>binding.sourceSlotId==='p').map(binding=>[binding.targetId,binding.endKind])).toEqual([['a','overwritten'],['b','null']])
 expect(index.historical(trace.events.length).find(binding=>binding.sourceSlotId==='retired-local')?.endKind).toBe('retired')
 expect(index.current(trace.events.length).find(binding=>binding.sourceSlotId==='p')?.targetId).toBe('a')
 expect(index.historical(trace.events.length).find(binding=>binding.sourceSlotId===arrayElementSlotId('array',0))?.endKind).toBe('overwritten')
 const incremental=createRecordedReferenceBindings(trace.demoId)
 for(let end=0;end<=trace.events.length;end++){
  incremental.append(trace.events.slice(0,end))
  expect(incremental.current(end)).toEqual(index.current(end));expect(incremental.historical(end)).toEqual(index.historical(end))
 }
})
it('closes only actual scoped locals on scope exit and method completion',()=>{
 const trace=fixture([
  {type:'ALLOCATE_OBJECT',objectId:'target',displayId:1,className:'Unit',fields:[]},
  {type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'Unit',methodName:'run',locals:[]},
  {type:'ENTER_SCOPE',frameId:'frame',scopeId:'outer',parentId:null,labelScope:'Outer'},
  {type:'DECLARE_LOCAL',frameId:'frame',slot:{...slot('outer-value',ref('target')),scopeId:'outer'}},
  {type:'ENTER_SCOPE',frameId:'frame',scopeId:'inner',parentId:'outer',labelScope:'Inner'},
  {type:'DECLARE_LOCAL',frameId:'frame',slot:{...slot('inner-value',ref('target')),scopeId:'inner'}},
  {type:'EXIT_SCOPE',frameId:'frame',scopeId:'inner'},
  {type:'EXIT_METHOD',frameId:'frame'},
  {type:'PROGRAM_END'},
 ])
 const index=createRecordedReferenceBindings(trace.demoId);index.append(trace.events)
 for(let cursor=0;cursor<=trace.events.length;cursor++)expect(index.current(cursor).map(binding=>[binding.sourceId,binding.sourceSlotId,binding.targetId]).sort()).toEqual(runtimeReferences(seek(trace,cursor)).sort())
 expect(index.historical(8).map(binding=>binding.sourceSlotId)).toEqual(['inner-value'])
 expect(index.current(8).map(binding=>binding.sourceSlotId)).toEqual(['outer-value'])
 expect(index.historical(9).map(binding=>binding.sourceSlotId)).toEqual(['inner-value','outer-value'])
 expect(index.historical(9).every(binding=>binding.endKind==='retired')).toBe(true)
})
it('keeps mirrored graph value/REFERENCE_BIND versions from inventing extra slot bindings',()=>{
 const trace=fixture([
  {type:'ALLOCATE_OBJECT',objectId:'target',displayId:1,className:'Unit',fields:[]},
  {type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'Unit',methodName:'run',locals:[slot('p',ref('target'))]},
  {type:'EXECUTION_FACT',fact:{kind:'write',context:{owner:'Unit',name:'run',descriptor:'()V',frameId:'frame',site:1,rawSeq:100,source:null},target:{id:'p',kind:'variable',ownerId:'frame',name:'p',javaType:'java.lang.Object'},value:ref('target'),origin:{kind:'unknown'}}},
  {type:'EXIT_METHOD',frameId:'frame'},
 ])
 const index=createRecordedReferenceBindings(trace.demoId);index.append(trace.events)
 expect(seek(trace,4).executionGraph!.edges.filter(edge=>edge.kind==='REFERENCE_BIND').length).toBeGreaterThan(0)
 expect(index.current(3)).toEqual(index.current(4));expect(index.historical(4)).toEqual([])
})
it('indexes actual summary key/value identity, observation changes and preview retirement without inferring operations',()=>{
 const entry=(index:number,part:'key'|'value',value:RuntimeValue)=>slot(`map:summary:entry:${index}:${part}`,value)
 const trace=fixture([
  {type:'ALLOCATE_OBJECT',objectId:'a',displayId:1,className:'Unit',fields:[]},
  {type:'ALLOCATE_OBJECT',objectId:'b',displayId:2,className:'Unit',fields:[]},
  {type:'ALLOCATE_OBJECT',objectId:'map',displayId:3,className:'java.util.HashMap',fields:[]},
  {type:'OBJECT_OBSERVE',objectId:'map',replaceFields:true,fields:[entry(0,'key',ref('a')),entry(0,'value',ref('b')),entry(1,'key',ref('b')),entry(1,'value',ref('a'))],library:{kind:'MAP',size:2,entries:[{key:ref('a'),value:ref('b')},{key:ref('b'),value:ref('a')}]}},
  {type:'OBJECT_OBSERVE',objectId:'map',replaceFields:true,fields:[entry(0,'key',ref('a')),entry(0,'value',{kind:'null'})],library:{kind:'MAP',size:1,entries:[{key:ref('a'),value:{kind:'null'}}]}},
 ])
 const index=createRecordedReferenceBindings(trace.demoId);index.append(trace.events)
 expect(index.current(5).map(binding=>[binding.sourceSlotId,binding.targetId])).toEqual([['map:summary:entry:0:key','a'],['map:summary:entry:0:value','b'],['map:summary:entry:1:key','b'],['map:summary:entry:1:value','a']])
 expect(index.current(6).map(binding=>binding.sourceSlotId)).toEqual(['map:summary:entry:0:key'])
 expect(index.historical(6).map(binding=>[binding.sourceSlotId,binding.endKind])).toEqual([['map:summary:entry:1:key','retired'],['map:summary:entry:1:value','retired'],['map:summary:entry:0:value','null']])
 for(let cursor=0;cursor<=trace.events.length;cursor++)expect(index.current(cursor).map(binding=>[binding.sourceId,binding.sourceSlotId,binding.targetId]).sort()).toEqual(runtimeReferences(seek(trace,cursor)).sort())
})
it('rejects a nonappend envelope before consuming any new observations',()=>{
 const trace=fixture([{type:'ALLOCATE_OBJECT',objectId:'a',displayId:1,className:'Unit',fields:[]},{type:'ALLOCATE_OBJECT',objectId:'b',displayId:2,className:'Unit',fields:[slot('p',ref('a'))]}])
 const index=createRecordedReferenceBindings(trace.demoId);index.append(trace.events.slice(0,2))
 const bad=[...trace.events,{...base(3),type:'PROGRAM_END' as const,eventId:trace.events[0].eventId}]
 expect(()=>index.append(bad)).toThrow();expect(index.length).toBe(2);expect(index.current(4)).toEqual([])
 index.append(trace.events);expect(index.current(3).length).toBe(1)
 expect(()=>index.append(trace.events.slice(0,2))).toThrow();expect(index.length).toBe(3)
})
it('shares a read-only accepted event lookup through append, rejected suffixes and independent recordings',()=>{
 const trace=fixture([{type:'ALLOCATE_OBJECT',objectId:'a',displayId:1,className:'Unit',fields:[]},{type:'ALLOCATE_OBJECT',objectId:'b',displayId:2,className:'Unit',fields:[slot('p',ref('a'))]}])
 const index=createRecordedReferenceBindings(trace.demoId),lookup=index.events,other=createRecordedReferenceBindings(trace.demoId)
 expect(Object.isFrozen(lookup)).toBe(true);expect('set'in lookup).toBe(false)
 expect(lookup.get(trace.events[0].eventId)).toBeUndefined()
 index.append(trace.events.slice(0,2))
 expect(index.events).toBe(lookup);expect(lookup.get(trace.events[1].eventId)).toBe(trace.events[1])
 expect(lookup.get(trace.events[2].eventId)).toBeUndefined();expect(other.events.get(trace.events[1].eventId)).toBeUndefined()
 const duplicate=[...trace.events,{...base(3),type:'PROGRAM_END' as const,eventId:trace.events[0].eventId}]
 expect(()=>index.append(duplicate)).toThrow();expect(index.length).toBe(2)
 expect(lookup.get(trace.events[2].eventId)).toBeUndefined();expect(lookup.get(trace.events[0].eventId)).toBe(trace.events[0])
 const gap=[...trace.events.slice(0,2),{...trace.events[2],seq:8}]
 expect(()=>index.append(gap)).toThrow();expect(lookup.get(trace.events[2].eventId)).toBeUndefined()
 index.append(trace.events);expect(lookup.get(trace.events[2].eventId)).toBe(trace.events[2])
 expect(()=>index.append(trace.events.slice(0,2))).toThrow();expect(index.events).toBe(lookup)
 for(const event of trace.events)expect(lookup.get(event.eventId)).toBe(event)
 expect(lookup.get('not an accepted event')).toBeUndefined();expect(other.length).toBe(0)
})
