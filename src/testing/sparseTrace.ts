import type {RuntimeSlot,TraceDocument,TraceEvent} from '../contracts/runtime'
export const sparseArrayId='observed-array',sparseHeapId='heap:domain.Box:observation-with-a-long-actual-runtime-identity',sparseClassId='jvm:class:domain.Registry'
export const sparseInt=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
/** Explicit normalized unit records, never fresh JVM execution evidence. Integer
 * and reference arrays remain separately typed; sparse absence is not a value. */
export function sparseTrace(options:{indices?:number[];length?:number;references?:boolean;extra?:object[]}={}):TraceDocument{
 const indices=options.indices??[0,1,2,750000,999999],length=options.length??1000000,component=options.references?'domain.Box':'int'
 const fields:RuntimeSlot[]=[{id:'static:counter',name:'counter',javaType:'int',value:sparseInt(7),static:true},{id:'static:entries',name:'entries',javaType:`${component}[]`,value:{kind:'reference',javaType:`${component}[]`,objectId:sparseArrayId},static:true},{id:'static:unknown',name:'unknown',javaType:'int',value:{kind:'unavailable',javaType:'int',reason:'not observed'},static:true}]
 const payloads:object[]=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId:'observed-call',callerFrameId:null,className:'domain.Registry',methodName:'load',locals:[]},
  {type:'ALLOCATE_OBJECT',objectId:sparseHeapId,displayId:77,className:'domain.Box',fields:[]},{type:'ALLOCATE_ARRAY',objectId:sparseArrayId,displayId:12,elementType:component,elements:[],length,truncated:true},
  ...Array.from({length:Math.ceil(indices.length/32)},(_,chunk)=>({type:'OBJECT_OBSERVE',objectId:sparseArrayId,arrayElements:indices.slice(chunk*32,(chunk+1)*32).map(index=>({index,value:options.references?(index===750000?{kind:'reference',javaType:'domain.Box',objectId:sparseHeapId}:{kind:'null'}):sparseInt(index)}))})),
  {type:'CLASS_OBSERVE',classId:sparseClassId,className:'domain.Registry',initialization:'observed',fields},...fields.map(field=>({type:'SET_STATIC',classId:sparseClassId,slotId:field.id,value:field.value})),...(options.extra??[])]
 return{schemaVersion:2,demoId:'sparse-unit-records',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'// explicit unit records'}],events:payloads.map((payload,seq)=>({...payload,eventId:`sparse-unit/${seq}`,seq,source:'type' in payload&&payload.type==='LINE_EXECUTE'?{fileId:'Unit.java',line:1}:null,label:'Recorded operation',importance:'normal'} as TraceEvent))}
}
