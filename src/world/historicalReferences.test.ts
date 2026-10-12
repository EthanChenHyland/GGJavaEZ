import {expect,it} from 'vitest'
import type {RuntimeSlot,RuntimeValue,TraceDocument,TraceEvent} from '../contracts/runtime'
import {seek} from '../runtime'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector} from './sceneProjector'
import {planPresentation} from './presentationPlanner'
import {historicalReferenceEligible,historicalSceneReference} from './historicalReference'
import {referencePresentationTopology} from './referencePresentationTopology'
import {collectionEntryFace} from './collectionFace'
import {inspectorEntity} from '../render/inspection'

// Accepted normalized unit fixtures; not JVM or screenshot evidence.
const ref=(objectId:string):RuntimeValue=>({kind:'reference',javaType:'Node',objectId})
const slot=(id:string,value:RuntimeValue):RuntimeSlot=>({id,name:id,javaType:'Node',value})
function fixture(){
 const base=(seq:number)=>({seq,eventId:`opaque/event/${seq}`,source:null,label:'Historical binding fixture',importance:'normal' as const})
 type Input=TraceEvent extends infer E?E extends TraceEvent?Omit<E,keyof ReturnType<typeof base>>:never:never
 const allocate=(id:string,fields:RuntimeSlot[]=[],className='Node'):Input=>({type:'ALLOCATE_OBJECT',objectId:id,displayId:id==='a'?1:id==='b'?2:id==='owner'?3:4,className,fields,metadata:{ownership:'PROJECT',runtimeType:className,packageName:''}})
 const inputs:Input[]=[{type:'PROGRAM_START'},allocate('a'),allocate('b'),allocate('owner',[slot('p',ref('a')),...Array.from({length:8},(_,i)=>slot(`live-${i}`,ref(i%2?'a':'b')))])]
 for(let i=0;i<100;i++)inputs.push({type:'CREATE_REFERENCE',sourceSlot:{kind:'object',objectId:'owner',slotId:'p'},targetObjectId:i%2?'a':'b',javaType:'Node'})
 inputs.push({type:'CLEAR_REFERENCE',sourceSlot:{kind:'object',objectId:'owner',slotId:'p'}},allocate('map',[],'java.util.HashMap'),
  {type:'OBJECT_OBSERVE',objectId:'map',replaceFields:true,fields:[slot('map:summary:entry:0:key',ref('a')),slot('map:summary:entry:0:value',ref('b'))],library:{kind:'MAP',size:1,entries:[{key:ref('a'),value:ref('b')}]}},
  {type:'OBJECT_OBSERVE',objectId:'map',replaceFields:true,fields:[slot('map:summary:entry:0:key',ref('a')),slot('map:summary:entry:0:value',{kind:'null'})],library:{kind:'MAP',size:1,entries:[{key:ref('a'),value:{kind:'null'}}]}})
 const events=inputs.map((input,seq)=>({...base(seq),...input})) as TraceEvent[]
 const trace:TraceDocument={schemaVersion:2,demoId:'unit/historical-bindings',sourceFiles:[],events},layout=createLayoutEngine();layout.append(events)
 const projector=createSceneProjector(trace),context={sessionEnded:true,pausedAtLiveHead:false,liveHead:events.length,recording:{state:'FULL' as const,reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}
 const sceneAt=(cursor:number)=>projector.project(seek(trace,cursor),layout.state,context)
 const plan=(cursor=events.length,scope:'all'|'current'|'relevant'='all',selected?:string,focus:string|null=null)=>{
  const scene=sceneAt(cursor);return{scene,plan:planPresentation({scene,layout:layout.state,detailLevel:'CLOSE',selection:selected?{kind:'reference',id:selected}:null,focusTargetId:focus,trace:{active:true,scope}})}
 }
 return{trace,events,layout,projector,context,sceneAt,plan}
}
it('keeps closed snapshots immutable and exposes no future introduction or ending at any cursor',()=>{
 const f=fixture(),early=f.sceneAt(4),full=f.sceneAt(f.events.length)
 expect(early.historicalBindings).toEqual([]);expect(full.historicalBindings.length).toBe(102)
 for(let cursor=0;cursor<=f.events.length;cursor++){
  const scene=f.sceneAt(cursor),expected=full.historicalBindings.filter(binding=>binding.endSeq!<cursor)
  expect(scene.historicalBindings).toEqual(expected)
  for(const binding of scene.historicalBindings){expect(binding.introducedSeq).toBeLessThan(cursor);expect(binding.endSeq).toBeLessThan(cursor);expect(f.events[binding.endSeq!].eventId).toBe(binding.endEventId)}
 }
 expect(early.historicalBindings).toEqual([]);expect(f.sceneAt(f.events.length).historicalBindings).toEqual(full.historicalBindings)
})
it('partitions every historical binding separately from current references and caps selected/Focus/current opacity',()=>{
 const f=fixture(),baseline=f.plan(),selected=baseline.scene.historicalBindings[0].id
 for(const [selection,focus]of [[undefined,null],[selected,'owner']] as const){
  const {scene,plan}=f.plan(f.events.length,'all',selection,focus),counts=plan.historicalReferencePresentation.counts
  expect(counts.recorded).toBe(scene.historicalBindings.length);expect(counts.eligible+counts.lifetimeExcluded).toBe(counts.recorded)
  expect(counts.eligible).toBe(counts.drawable+counts.unavailable+counts.internal+counts.scopeExcluded)
  expect(counts.drawable).toBe(counts.individual+counts.bundled)
  const drawn=[...plan.curves.filter(curve=>curve.kind==='binding-history'),...plan.bundles.filter(bundle=>bundle.kind==='binding-history')]
  expect(drawn.length).toBeGreaterThan(0);expect(drawn.every(curve=>curve.opacity<=.25)).toBe(true)
  const ids=[...plan.curves.filter(curve=>curve.kind==='binding-history').map(curve=>curve.id),...plan.bundles.filter(bundle=>bundle.kind==='binding-history').flatMap(bundle=>bundle.referenceIds!),...plan.historicalReferencePresentation.unavailable.map(item=>item.id),...plan.historicalReferencePresentation.internal.map(item=>item.id),...plan.historicalReferencePresentation.scopeExcluded]
  expect(ids.slice().sort()).toEqual(scene.historicalBindings.filter(historicalReferenceEligible).map(binding=>binding.id).sort());expect(new Set(ids).size).toBe(ids.length)
  expect(plan.curves.filter(curve=>curve.kind==='connector'||curve.kind==='binding-history').length).toBeLessThanOrEqual(64)
  if(selection)expect(plan.curves.find(curve=>curve.id===selection)).toMatchObject({kind:'binding-history',opacity:.25,widthPx:3.5})
  expect(plan.referencePresentation.counts.current).toBe(scene.references.length)
 }
 for(const scope of ['current','relevant']as const){const {plan}=f.plan(f.events.length,scope);expect(plan.historicalReferencePresentation.counts.scopeExcluded).toBe(102);expect(plan.curves.some(curve=>curve.kind==='binding-history')).toBe(false);expect(plan.bundles.some(bundle=>bundle.kind==='binding-history')).toBe(false)}
})
it('uses the actual visible Map value chip after nulling, never borrowing its key port',()=>{
 const f=fixture(),{scene,plan}=f.plan(),node=scene.entities.map
 expect(node.kind).toBe('collection');if(node.kind!=='collection')throw new Error('Expected captured Map')
 expect(node.entries[0].value.kind).toBe('null');expect(node.entries[0].port).toBeNull()
 const binding=scene.historicalBindings.find(binding=>binding.sourceSlotId==='map:summary:entry:0:value')!,curve=plan.curves.find(curve=>curve.id===binding.id)!
 expect(curve.kind).toBe('binding-history');expect(curve.points[0]).toEqual(collectionEntryFace(node.anchor,0,true)!.value);expect(curve.points[0]).not.toEqual(node.entries[0].keyPort)
 expect(inspectorEntity(scene,{kind:'reference',id:binding.id})).toBe(node)
})
it('does not manufacture a semantic source chip after replacement retires its slot',()=>{
 const f=fixture(),before=f.sceneAt(f.events.length),extra:TraceEvent={seq:f.events.length,eventId:'opaque/retire',source:null,label:'Captured field replacement',importance:'normal',type:'OBJECT_OBSERVE',objectId:'owner',replaceFields:true,fields:[]}
 const events=[...f.events,extra],trace={...f.trace,events},projector=createSceneProjector(trace);f.layout.append(events)
 const scene=projector.project(seek(trace,events.length),f.layout.state,{...f.context,liveHead:events.length}),plan=planPresentation({scene,layout:f.layout.state,detailLevel:'CLOSE',selection:{kind:'object',id:'owner'},focusTargetId:null,trace:{active:true,scope:'all'}})
 for(const binding of before.historicalBindings.filter(binding=>binding.sourceId==='owner'))expect(plan.historicalReferencePresentation.unavailable).toContainEqual({id:binding.id,reason:'Source slot is not in the visible face rows'})
 expect(plan.historicalReferencePresentation.counts.lifetimeExcluded).toBe(8)
 expect(plan.curves.filter(curve=>curve.kind==='binding-history').every(curve=>!before.historicalBindings.some(binding=>binding.sourceId==='owner'&&binding.id===curve.id))).toBe(true)
})
it('shares the individual budget and admits no optional relationship when mandatory current plus history overflow it',()=>{
 const f=fixture(),{scene,plan}=f.plan(),history=scene.historicalBindings.map(historicalSceneReference)
 const mandatoryIds=new Set([...scene.references.slice(0,5).map(ref=>ref.id),history[0].id])
 const result=referencePresentationTopology({scene,entities:plan.entities,clusters:plan.clusters,cellWindows:plan.cellWindows,individualLimit:3,mandatoryIds},history,true)
 const individuals=[...result.current.individual,...result.historical.individual]
 expect(individuals.length).toBe(6);expect(individuals.every(item=>mandatoryIds.has(item.reference.id))).toBe(true)
 expect(result.historical.bundles.reduce((sum,bundle)=>sum+bundle.count,0)+result.historical.individual.length+result.historical.unavailable.length+result.historical.internal.length).toBe(history.length)
 expect(result.current.bundles.map(bundle=>bundle.id).some(id=>result.historical.bundles.some(bundle=>bundle.id===id))).toBe(false)
})
