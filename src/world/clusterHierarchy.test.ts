import {expect,it} from 'vitest'
import fc from 'fast-check'
import type {RuntimeSlot,TraceDocument,TraceEvent} from '../contracts/runtime'
import {projectTrace} from '../testing/projectTrace'
import {generateRawTrace} from '../testing/traceGen'
import {normalizeTrace} from '../instrumentation/normalize'
import {createLayoutEngine} from './layoutEngine'
import {clusterHierarchy,clusterId,liveDepthId,liveDepthMethod} from './clusterHierarchy'
import {presentationClusters,residualGroups} from './presentationClusters'
import {planPresentation} from './presentationPlanner'
import {seek} from '../runtime'

type Input=TraceEvent extends infer E?E extends TraceEvent?Omit<E,'seq'|'eventId'|'source'|'label'|'importance'>:never:never
const record=(inputs:Input[]):TraceDocument=>({schemaVersion:2,demoId:'unit-cluster-hierarchy',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'// normalized unit fixture\n'}],events:[{type:'PROGRAM_START' as const},...inputs].map((event,seq)=>({...event,...(event.type==='ALLOCATE_OBJECT'||event.type==='ALLOCATE_ARRAY'?{displayId:seq}:{}),seq,eventId:`unit/cluster/${seq}`,source:event.type==='LINE_EXECUTE'?{fileId:'Unit.java',line:1}:null,label:'Normalized unit fixture',importance:'quiet'}))})
const allocation=(id:string,name='app.Item'):Extract<Input,{type:'ALLOCATE_OBJECT'}>=>({type:'ALLOCATE_OBJECT',objectId:id,displayId:1,className:name,fields:[],metadata:{ownership:'PROJECT',runtimeType:name,packageName:name.slice(0,name.lastIndexOf('.'))}})
const enter=(id:string,caller:string|null,method='run'):Input=>({type:'ENTER_METHOD',frameId:id,callerFrameId:caller,className:'app.Work',methodName:method,locals:[]})
const summary=(ids:string[],kind:'LIST'|'BOXED'='LIST'):Input=>({type:'OBJECT_OBSERVE',objectId:'collection',library:{kind,size:ids.length,items:ids.map(objectId=>({kind:'reference',javaType:'app.Item',objectId}))}})
const members=(scene:ReturnType<ReturnType<typeof projectTrace>['project']>,layout:ReturnType<typeof projectTrace>['layout'],id:string)=>clusterHierarchy(scene,layout).get(id)

it('indexes all seven keys from recorded identities and contexts, without inferring an allocation caller',()=>{
 const trace=record([enter('root',null),enter('child','root'),allocation('collection','java.util.ArrayList'),allocation('member'),summary(['member']),{type:'EXECUTION_FACT',fact:{kind:'object',objectId:'member',className:'app.Item',fields:[],context:{owner:'app.Work',name:'run',descriptor:'()V',frameId:'child',site:1,rawSeq:900,source:null}}}])
 const projection=projectTrace(trace),before=projection.project(6),after=projection.project(7),nodes=clusterHierarchy(after,projection.layout)
 expect(new Set([...nodes.values()].filter(node=>node.memberIds.length).map(node=>node.key.kind))).toEqual(new Set(['class','type','package','ownership','collection','invocation-branch','execution-age']))
 expect(projection.layout.placement.member.clusterPath.some(key=>key.kind==='invocation-branch')).toBe(false)
 const branch=clusterId('heap',{kind:'invocation-branch',value:'root/observed-descendants'})
 expect(members(before,projection.layout,branch)).toBeUndefined()
 expect(members(after,projection.layout,branch)?.memberIds).toEqual(['member'])
 expect(projection.layout.placement.member.clusterMemberships?.find(item=>item.key.kind==='invocation-branch')?.fromSeq).toBe(6)
})

it('replaces captured collection membership in both directions and keeps the empty key reservation',()=>{
 const trace=record([allocation('collection','java.util.ArrayList'),allocation('a'),allocation('b'),summary(['a']),summary(['b']),summary([],'BOXED')]),projection=projectTrace(trace)
 const id=clusterId('heap',{kind:'collection',value:'collection'}),at=(cursor:number)=>members(projection.project(cursor),projection.layout,id)
 expect(at(4)).toBeUndefined()
 const first=at(5)!,saved=JSON.stringify(first)
 expect(first.memberIds).toEqual(['collection','a'])
 expect(at(6)?.memberIds).toEqual(['collection','b'])
 expect(at(7)?.memberIds).toEqual([])
 expect(at(7)?.anchor).toBe(first.anchor)
 expect(at(5)).toEqual(first);expect(JSON.stringify(first)).toBe(saved)
 for(const cursor of [5,6,7,5]){
  const scene=projection.project(cursor),groups=residualGroups(scene,projection.layout,scene.order.objects,'CLOSE')
  const actual=groups.find(group=>group.id===id)?.members??[]
  expect(actual).toEqual(at(cursor)?.memberIds??[])
 }
})

it('never presents future objects or preview memberships from the full recording',()=>{
 const trace=record([allocation('collection','java.util.ArrayList'),allocation('early'),summary(['early']),allocation('later'),summary(['later'])]),projection=projectTrace(trace),id=clusterId('heap',{kind:'collection',value:'collection'})
 expect(projection.project(4).entities.later).toBeUndefined()
 expect(members(projection.project(4),projection.layout,id)?.memberIds).toEqual(['collection','early'])
 expect(members(projection.project(5),projection.layout,id)?.memberIds).toEqual(['collection','early'])
 expect(members(projection.project(6),projection.layout,id)?.memberIds).toEqual(['collection','later'])
})

it('groups observed descendants by their recorded ancestor without conflating another root, and separates roles',()=>{
 const trace=record([enter('root',null),enter('a','root'),enter('b','a'),{type:'EXIT_METHOD',frameId:'b'},{type:'EXIT_METHOD',frameId:'a'},{type:'EXIT_METHOD',frameId:'root'},enter('other-root',null),enter('d','other-root')]),projection=projectTrace(trace)
 const key=clusterId('stack',{kind:'invocation-branch',value:'root/observed-descendants'}),before=members(projection.project(4),projection.layout,key)!,after=members(projection.project(9),projection.layout,key)!
 expect(before.liveIds).toEqual(['a','b']);expect(before.historicalIds).toEqual([])
 expect(after.memberIds).toEqual(['a','b']);expect(after.liveIds).toEqual([]);expect(after.historicalIds).toEqual(['a','b'])
 expect(after.anchor).toBe(before.anchor)
 expect(members(projection.project(9),projection.layout,clusterId('stack',{kind:'invocation-branch',value:'other-root/observed-descendants'}))?.memberIds).toEqual(['d'])
 expect(members(projection.project(4),projection.layout,key)).toEqual(before)
})

it('labels the exact residual live depth with the most frequent signature, ties to the innermost',()=>{
 const projection=projectTrace(record([enter('a',null,'first'),enter('b','a','second'),enter('c','b','first'),enter('d','c','second')]),{sessionEnded:false}),scene=projection.project(5)
 const clusters=presentationClusters(scene,projection.layout,scene.liveStack,'FAR',20,null,false)
 expect(clusters).toHaveLength(1)
 expect(clusters[0]).toMatchObject({id:liveDepthId,members:4,label:'Live depth · Work.second()',memberIds:['a','b','c','d']})
 const cut=presentationClusters(scene,projection.layout,['a','c'],'FAR',20,null,false)[0]
 expect(cut).toMatchObject({members:2,label:'Live depth · Work.first()'});expect(cut.anchor).toBe(clusters[0].anchor)
})

it('uses normalized execution-age buckets of 4096, independently of raw recorder ordinals',()=>{
 const inputs:Input[]=[enter('frame',null)]
 while(inputs.length<4094)inputs.push({type:'LINE_EXECUTE',frameId:'frame'})
 inputs.push(allocation('last-first-bucket'),allocation('first-second-bucket'))
 const projection=projectTrace(record(inputs)),nodes=clusterHierarchy(projection.project(4097),projection.layout)
 expect(nodes.get(clusterId('heap',{kind:'execution-age',value:'0'}))?.memberIds).toEqual(['last-first-bucket'])
 expect(nodes.get(clusterId('heap',{kind:'execution-age',value:'1'}))?.memberIds).toEqual(['first-second-bucket'])
})

it('counts canonical overloads separately when their displayed parameter names coincide',()=>{
 const typed=(id:string,caller:string|null,type:string):Input=>({type:'ENTER_METHOD',frameId:id,callerFrameId:caller,className:'app.Work',methodName:'overload',locals:[{id:`${id}/parameter/0`,name:'arg',role:'parameter',javaType:type,value:{kind:'null'}}]})
 const projection=projectTrace(record([typed('a',null,'warehouse.Token'),typed('b','a','catalog.Token'),typed('c','b','catalog.Token')]),{sessionEnded:false}),scene=projection.project(4)
 expect(new Set(scene.liveStack.map(id=>scene.entities[id].title)).size).toBe(1)
 expect(liveDepthMethod(scene,projection.layout,scene.liveStack)).toMatchObject({count:2,frameId:'c',signature:JSON.stringify(['app.Work','overload',['catalog.Token']])})
})

it('canonical keys, memberships and anchors ignore camera/LOD/pins and retain immutable append snapshots (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100000}),seed=>{
  const raw=generateRawTrace({seed,rawEvents:40,maxDepth:5,classes:4}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace,projection=projectTrace(trace),cursor=Math.floor(trace.events.length/2),scene=projection.project(cursor),engine=createLayoutEngine()
  engine.append(trace.events.slice(0,cursor));const snapshot=engine.state,saved=JSON.stringify(snapshot),early=clusterHierarchy(scene,snapshot)
  engine.append(trace.events);expect(JSON.stringify(snapshot)).toBe(saved)
  const later=clusterHierarchy(scene,engine.state)
  for(const [id,node]of early)expect(later.get(id)).toEqual(node)
  const semantic=JSON.stringify(seek(trace,cursor)),before=JSON.stringify([...later])
  for(const detailLevel of ['FAR','MEDIUM','CLOSE'] as const){
   const selected=scene.order.frames[0],plan=planPresentation({scene,layout:engine.state,detailLevel,selection:selected?{kind:'frame',id:selected}:null,focusTargetId:selected??null,viewTile:[seed%3,0,0],trace:{active:false,scope:'relevant'}})
   const residual=plan.clusters.flatMap(cluster=>cluster.memberIds)
   expect(new Set([...plan.entities.keys(),...residual]).size).toBe(plan.accounting.total)
   expect(plan.entities.size+residual.length).toBe(plan.accounting.total)
   expect(clusterHierarchy(scene,engine.state)).toEqual(later)
  }
  expect(JSON.stringify([...later])).toBe(before);expect(JSON.stringify(seek(trace,cursor))).toBe(semantic)
 }),{numRuns:100})
})

it('expands optional groups all or nothing after removing pins, with one-hop priority',()=>{
 const slot:RuntimeSlot={id:'selected/field/item',name:'item',javaType:'app.Near',value:{kind:'reference',javaType:'app.Near',objectId:'near'}}
 const trace=record([...Array.from({length:5},(_,i)=>allocation(`far-${i}`,`app.Far${i}`)),...Array.from({length:7},(_,i)=>allocation(`big-${i}`,'app.Big')),allocation('near','app.Near'),{...allocation('selected','app.Selected'),fields:[slot]},{type:'PROGRAM_END'}]),projection=projectTrace(trace),scene=projection.project(trace.events.length)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel:'FAR',selection:{kind:'object',id:'selected'},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(plan.entities.get('selected')).toMatchObject({mode:'detailed',pinned:true})
 expect(plan.entities.get('near')?.mode).toBe('detailed')
 expect(Array.from({length:7},(_,i)=>plan.entities.has(`big-${i}`))).toEqual(Array(7).fill(false))
 const big=plan.clusters.find(cluster=>cluster.key.value==='app.Big')!
 expect(big.members).toBe(7);expect(big.memberIds).toHaveLength(7)
 expect(plan.entities.has('far-4')).toBe(false)
 const pinned=planPresentation({scene,layout:projection.layout,detailLevel:'FAR',selection:{kind:'object',id:'big-0'},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(pinned.entities.get('big-0')).toMatchObject({mode:'detailed',pinned:true})
 expect(pinned.clusters.find(cluster=>cluster.key.value==='app.Big')?.members).toBe(6)
})

it('presents class-state package clusters with exact counts after subtracting selected shelves',()=>{
 const inputs:Input[]=Array.from({length:26},(_,i)=>({type:'CLASS_OBSERVE',classId:`jvm:class:app.T${i}`,className:`app.T${i}`,fields:[],initialization:'observed',metadata:{ownership:'PROJECT',runtimeType:`app.T${i}`,packageName:'app'}}))
 inputs.push({type:'PROGRAM_END'})
 const projection=projectTrace(record(inputs)),scene=projection.project(28)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel:'FAR',selection:{kind:'class',id:'jvm:class:app.T0'},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(plan.entities.get('jvm:class:app.T0')).toMatchObject({pinned:true,mode:'detailed'})
 expect(plan.clusters).toHaveLength(1)
 expect(plan.clusters[0]).toMatchObject({key:{kind:'package',value:'app'},members:25})
 expect(plan.clusters[0].memberIds).not.toContain('jvm:class:app.T0')
 expect(plan.accounting).toEqual({detailed:1,quiet:0,clustered:25,total:26})
})
