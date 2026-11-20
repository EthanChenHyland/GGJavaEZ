import type {RuntimeSlot,RuntimeTypeMetadata,TraceDocument,TraceEvent} from '../contracts/runtime'
const int=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
const ref=(objectId:string,javaType:string)=>({kind:'reference' as const,javaType,objectId})
const metadata=(runtimeType:string,ownership:RuntimeTypeMetadata['ownership']):RuntimeTypeMetadata=>({runtimeType,ownership,packageName:runtimeType.slice(0,runtimeType.lastIndexOf('.'))})
const slot=(id:string,name:string,javaType:string,value:RuntimeSlot['value'],parameter=false):RuntimeSlot=>({id,name,javaType,value,...(parameter?{role:'parameter' as const}:{})})
/** Normalized regression corpus for the real-JVM Hero failure: user-level
 * Strings/collections retain JDK type ownership in project heap columns. */
export function heroTrace(){
 const fields=(label:string)=>[
  {...slot('label','label','java.lang.String',ref(label,'java.lang.String')),declaringClass:'domain.Record'},
  {...slot('quantity','quantity','int',int(0)),declaringClass:'domain.Record'},
  {...slot('tags','tags','java.util.List',{kind:'null'}),declaringClass:'domain.Record'},
  {...slot('related','related','domain.Record',{kind:'null'}),declaringClass:'domain.Record'},
 ]
 const objectFields=(id:string,label:string)=>fields(label).map(field=>({...field,id:`${id}/${field.id}`}))
 const enter=(frameId:string,methodName:string,locals:RuntimeSlot[])=>({type:'ENTER_METHOD',frameId,callerFrameId:'entry',className:'domain.Record',methodName,locals})
 const allocate=(objectId:string,displayId:number,className:string,values:RuntimeSlot[],ownership:RuntimeTypeMetadata['ownership']='JDK')=>({type:'ALLOCATE_OBJECT',objectId,displayId,className,fields:values,metadata:metadata(className,ownership)})
 const bind=(objectId:string,field:string,targetObjectId:string,javaType:string)=>({type:'CREATE_REFERENCE',sourceSlot:{kind:'object',objectId,slotId:`${objectId}/${field}`},targetObjectId,javaType})
 const payloads:object[]=[
  {type:'PROGRAM_START'},
  {type:'ENTER_METHOD',frameId:'entry',callerFrameId:null,className:'domain.Root',methodName:'main',returnType:'void',locals:[]},
  {type:'ALLOCATE_ARRAY',objectId:'arguments',displayId:1,elementType:'java.lang.String',elements:[],length:0,metadata:metadata('java.lang.String[]','JDK'),source:null},
  {type:'DECLARE_LOCAL',frameId:'entry',slot:slot('args','args','java.lang.String[]',ref('arguments','java.lang.String[]'),true)},
  allocate('first-label',2,'java.lang.String',[]),
  allocate('first-record',3,'domain.Record',objectFields('first-record','first-label'),'PROJECT'),
  enter('first-constructor','<init>',[slot('first-this','this','domain.Record',ref('first-record','domain.Record')),slot('first-parameter','label','java.lang.String',ref('first-label','java.lang.String'),true)]),
  allocate('first-list',4,'java.util.ArrayList',[]),
  bind('first-record','tags','first-list','java.util.List'),
  {type:'OBJECT_OBSERVE',objectId:'first-list',library:{kind:'LIST',size:3,items:[int(1),int(2),int(3)],truncated:false}},
  {type:'EXIT_METHOD',frameId:'first-constructor'},
  {type:'DECLARE_LOCAL',frameId:'entry',slot:slot('primary','primary','domain.Record',ref('first-record','domain.Record'))},
  allocate('second-label',5,'java.lang.String',[]),
  allocate('second-record',6,'domain.Record',objectFields('second-record','second-label'),'PROJECT'),
  enter('second-constructor','<init>',[slot('second-this','this','domain.Record',ref('second-record','domain.Record')),slot('second-parameter','label','java.lang.String',ref('second-label','java.lang.String'),true)]),
  allocate('second-list',7,'java.util.ArrayList',[]),
  bind('second-record','tags','second-list','java.util.List'),
  {type:'OBJECT_OBSERVE',objectId:'second-list',library:{kind:'LIST',size:0,items:[],truncated:false}},
  {type:'EXIT_METHOD',frameId:'second-constructor'},
  {type:'DECLARE_LOCAL',frameId:'entry',slot:slot('secondary','secondary','domain.Record',ref('second-record','domain.Record'))},
  bind('first-record','related','second-record','domain.Record'),
  enter('setter','update',[slot('setter-this','this','domain.Record',ref('first-record','domain.Record')),slot('setter-value','quantity','int',int(18),true)]),
  {type:'SET_FIELD',objectId:'first-record',slotId:'first-record/quantity',value:int(18),importance:'major'},
  {type:'EXIT_METHOD',frameId:'setter'},
  {type:'EXIT_METHOD',frameId:'entry'},
  {type:'PROGRAM_END'},
 ]
 const events=payloads.map((payload,seq)=>({eventId:`hero-regression/${seq}`,seq,source:{fileId:'Unit.java',line:1},label:'Recorded operation',importance:'normal',...payload} as TraceEvent))
 const trace:TraceDocument={schemaVersion:2,demoId:'hero-regression',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'class Unit {}'}],events}
 return{trace,cursor:events.find(event=>event.type==='SET_FIELD'&&event.slotId==='first-record/quantity')!.seq+1}
}
