import { test, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { ExecutionHistory, attachHistory } from '../../src/runtime/history.ts';
import { createLayoutEngine } from '../../src/world/layoutEngine.ts';
import { createSceneProjector } from '../../src/world/sceneProjector.ts';
const timed=f=>{const t=performance.now();const value=f();return [value,performance.now()-t]};
test('large array projection preserves the batch geometry oracle',async()=>{
 const events=[];
 const emit=event=>events.push({eventId:'e:'+events.length,seq:events.length,source:null,label:'Projection',importance:'normal',...event});
 emit({type:'PROGRAM_START'});emit({type:'ENTER_METHOD',frameId:'main',callerFrameId:null,className:'Main',methodName:'main',locals:[]});
 for(let i=0;i<3;i++)emit({type:'ALLOCATE_ARRAY',objectId:'array:'+i,displayId:i+1,elementType:'int',elements:Array.from({length:4096},()=>({kind:'primitive',javaType:'int',value:0}))});
 for(let i=0;i<1000;i++){
  emit({type:'ENTER_METHOD',frameId:'frame:'+i,callerFrameId:'main',className:'Main',methodName:'work',locals:[]});
  emit({type:'ARRAY_WRITE',objectId:'array:'+i%3,index:i%4096,frameId:'frame:'+i,value:{kind:'primitive',javaType:'int',value:i}});
  emit({type:'EXIT_METHOD',frameId:'frame:'+i});
 }
 emit({type:'EXIT_METHOD',frameId:'main'});emit({type:'PROGRAM_END'});
 const trace={schemaVersion:2,demoId:'projection',events,sourceFiles:[],capture:{origin:'jvm',sourceHashes:{},recordedAt:''}};
 const [history,indexMs]=timed(()=>{const h=new ExecutionHistory();h.append(events);return h});attachHistory(trace,history);
 const [batch,batchLayoutMs]=timed(()=>{const builder=createLayoutEngine();builder.append(events);return builder.state});
 const [layout,incrementalLayoutMs]=timed(()=>{const builder=createLayoutEngine();for(let to=256;to<events.length;to+=256)builder.append(events.slice(0,to));builder.append(events);return builder.state});
 const [scene,sceneMs]=timed(()=>createSceneProjector(trace).project(history.state,layout,{sessionEnded:true,pausedAtLiveHead:false,liveHead:events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}));
 expect(layout).toEqual(batch);
 expect(scene.order.frames).toHaveLength(1001);
 expect(scene.order.objects).toHaveLength(3);
 for(const id of scene.order.objects)expect(scene.entities[id].cells).toHaveLength(4096);
 const output=process.env.VJ_PERF_OUTPUT_ROOT ?? '.ggjavaez/qa/reference-exact/projection';await mkdir(output,{recursive:true});
 await writeFile(`${output}/projection.json`,JSON.stringify({method:'Production layout/projector, same 3×4096 array / 1000 invocation oracle; prefix appends of 256 events',semanticEvents:events.length,indexMs,batchLayoutMs,incrementalLayoutMs,sceneMs,frames:scene.order.frames.length,objects:scene.order.objects.length,anchors:Object.keys(layout.anchors).length},null,2)+'\n');
 history.dispose();
},60000);
