import { test, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { ExecutionHistory, attachHistory } from '../../src/runtime/history.ts';
import { createLayout, createLayoutBuilder } from '../../src/world/layout.ts';
import { buildSceneModel } from '../../src/world/sceneModel.ts';
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
 const [batch,batchLayoutMs]=timed(()=>createLayout(trace));
 const [layout,incrementalLayoutMs]=timed(()=>{const builder=createLayoutBuilder();builder.append(events);return builder.state});
 const [scene,sceneMs]=timed(()=>buildSceneModel(history.state,layout,'meso'));
 expect(layout).toEqual(batch);
 await writeFile('docs/checkpoints/v12-p2/projection.json',JSON.stringify({semanticEvents:events.length,indexMs,batchLayoutMs,incrementalLayoutMs,sceneMs,frames:scene.frames.length,objects:scene.objects.length,anchors:Object.keys(layout.anchors).length},null,2)+'\n');
 history.dispose();
},60000);
