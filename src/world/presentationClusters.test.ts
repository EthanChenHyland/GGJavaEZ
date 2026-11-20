import {expect,it} from 'vitest'
import type {RuntimeSlot,RuntimeTypeMetadata,TraceDocument,TraceEvent} from '../contracts/runtime'
import type {Ownership,WorldAnchor} from '../contracts/world'
import {seek} from '../runtime'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector} from './sceneProjector'
import {presentationClusters,prepareClusterClearance} from './presentationClusters'
import {clusterHierarchy} from './clusterHierarchy'
import {planPresentation} from './presentationPlanner'
import {faceRows} from './faceRows'
const overlap=(a:WorldAnchor,b:WorldAnchor)=>a.position.every((v,i)=>Math.abs(v-b.position[i])<(a.size[i]+b.size[i])/2-1e-6)

// Explicit normalized unit fixtures, not evidence of JVM execution.
const base=(seq:number)=>({seq,eventId:`unit/hierarchy/${seq}`,source:null,label:'Hierarchy unit fixture',importance:'quiet' as const})
const metadata=(ownership:Ownership,name:string):RuntimeTypeMetadata=>({ownership,runtimeType:name,packageName:name.slice(0,Math.max(0,name.lastIndexOf('.')))})
const allocation=(seq:number,id:string,name:string,ownership?:Ownership,fields:RuntimeSlot[]=[]):TraceEvent=>({...base(seq),type:'ALLOCATE_OBJECT',objectId:id,displayId:seq+1,className:name,fields,...(ownership?{metadata:metadata(ownership,name)}:{})})
function catalog(events:TraceEvent[]){
 const recorded:TraceEvent[]=[{...base(0),type:'PROGRAM_START'},...events.map((event,index)=>({...event,seq:index+1,eventId:`unit/hierarchy/${index+1}`}))]
 const trace:TraceDocument={schemaVersion:2,demoId:'unit-hierarchy',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'// normalized unit fixture\n'}],events:recorded}
 const layout=createLayoutEngine();layout.append(recorded)
 const projector=createSceneProjector(trace)
 const at=(count=events.length,sessionEnded=true)=>projector.project(seek(trace,count+1),layout.state,{sessionEnded,pausedAtLiveHead:false,liveHead:recorded.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 return{trace,layout,at}
}
it('collapses only applied recorded external ownership and exposes ordinary type groups at CLOSE',()=>{
 const data=catalog([allocation(0,'unknown','java.util.Unknown'),allocation(1,'project','java.util.Project','PROJECT'),allocation(2,'library','vendor.Library','LIBRARY'),allocation(3,'jdk','java.util.Jdk','JDK'),allocation(4,'synthetic','generated.Synthetic','SYNTHETIC')])
 const scene=data.at(),ids=scene.order.objects,before=JSON.stringify({scene,layout:data.layout.state})
 for(const detail of ['FAR','MEDIUM'] as const){
  const clusters=presentationClusters(scene,data.layout.state,ids,detail,12,null,false)
  expect(clusters.filter(c=>c.key.kind==='ownership').map(c=>[c.key.value,c.memberIds])).toEqual([['LIBRARY',['library']],['JDK',['jdk']]])
  expect(clusters.filter(c=>c.key.kind==='type').flatMap(c=>c.memberIds).sort()).toEqual(['project','synthetic','unknown'])
 }
 expect(presentationClusters(scene,data.layout.state,ids,'CLOSE',20,null,false).every(c=>c.key.kind==='type')).toBe(true)
 expect(JSON.stringify({scene,layout:data.layout.state})).toBe(before)
})
it('reserves proxies outside runtime bodies and other proxies even when the first member is detailed',()=>{
 const events:TraceEvent[]=[]
 for(let i=0;i<8;i++)events.push(allocation(i,`body-${i}`,`vendor.T${i}`,i%2?'JDK':'LIBRARY'))
 events.push({...base(8),type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'app.Main',methodName:'run',locals:[]})
 const data=catalog(events),scene=data.at(),ids=Object.keys(scene.entities)
 for(const detail of ['FAR','MEDIUM','CLOSE']as const){
  const clusters=presentationClusters(scene,data.layout.state,ids,detail,20,null,false)
  for(let i=0;i<clusters.length;i++){
   for(const node of Object.values(scene.entities))expect(overlap(clusters[i].anchor,node.anchor),`${clusters[i].id} inside ${node.id}`).toBe(false)
   for(const other of clusters.slice(i+1))expect(overlap(clusters[i].anchor,other.anchor)).toBe(false)
  }
  const residual=presentationClusters(scene,data.layout.state,ids.filter(id=>id!=='body-0'),detail,20,null,false)
  for(const cluster of residual)expect(cluster.anchor).toEqual(clusters.find(initial=>initial.id===cluster.id)!.anchor)
 }
})
it('late ownership on an old body cannot reorder already introduced structural reservations',()=>{
 const data=catalog([allocation(0,'older','vendor.Older'),allocation(1,'known','vendor.Known','JDK'),{...base(2),type:'OBJECT_OBSERVE' as const,objectId:'older',metadata:metadata('LIBRARY','vendor.Older')}])
 const engine=createLayoutEngine();engine.append(data.trace.events.slice(0,3))
 const early=presentationClusters(data.at(2),engine.state,['older','known'],'FAR',20,null,false)
 engine.append(data.trace.events)
 const late=presentationClusters(data.at(3),engine.state,['older','known'],'FAR',20,null,false)
 for(const cluster of early.filter(cluster=>late.some(item=>item.id===cluster.id)))expect(late.find(item=>item.id===cluster.id)!.anchor).toEqual(cluster.anchor)
 const rewound=presentationClusters(data.at(2),engine.state,['older','known'],'FAR',20,null,false)
 expect(rewound.map(cluster=>[cluster.id,cluster.anchor])).toEqual(early.map(cluster=>[cluster.id,cluster.anchor]))
})
it('keeps exact residual counts and the canonical key anchor when its representative is detailed or the cursor rewinds',()=>{
 const data=catalog([allocation(0,'first','vendor.First','LIBRARY'),allocation(1,'second','vendor.Second','LIBRARY'),allocation(2,'third','vendor.Third','LIBRARY')])
 const cluster=(cursor:number,ids:readonly string[])=>presentationClusters(data.at(cursor),data.layout.state,ids,'FAR',20,null,false)[0]
 const initial=cluster(1,['first']),residual=cluster(3,['second','third'])
 expect(residual.id).toBe(initial.id);expect(residual.anchor).toEqual(initial.anchor)
 expect(residual.members).toBe(2);expect(residual.memberIds).toEqual(['second','third'])
 expect(presentationClusters(data.at(0),data.layout.state,[],'FAR',20,null,false)).toEqual([])
 expect(cluster(1,['first'])).toEqual(initial)
})
it('uses the first metadata observation for an ownership anchor, not the oldest body or later residual order',()=>{
 const events=[allocation(0,'older','vendor.Older'),allocation(1,'known','vendor.Known','JDK'),{...base(2),type:'OBJECT_OBSERVE' as const,objectId:'older',metadata:metadata('JDK','vendor.Older')}]
 const data=catalog(events),early=presentationClusters(data.at(2),data.layout.state,['older','known'],'FAR',20,null,false)
 const proxy=early.find(c=>c.key.kind==='ownership')!.anchor,known=data.layout.state.anchors.known
 expect(proxy.position[0]).toBe(known.position[0]);expect(proxy.position[1]-proxy.size[1]/2).toBeGreaterThan(known.position[1]+known.size[1]/2)
 const late=presentationClusters(data.at(3),data.layout.state,['older'],'FAR',20,null,false)[0]
 expect(late.id).toBe(early.find(c=>c.key.kind==='ownership')!.id);expect(late.anchor).toEqual(early.find(c=>c.key.kind==='ownership')!.anchor)
 const incremental=createLayoutEngine();incremental.append(data.trace.events.slice(0,3))
 const original=presentationClusters(data.at(2),incremental.state,['known'],'FAR',20,null,false)[0]
 incremental.append(data.trace.events)
 expect(presentationClusters(data.at(3),incremental.state,['older'],'FAR',20,null,false)[0].anchor).toEqual(original.anchor)
})
it('coarsens exact type keys into recorded package keys, then recorded ownership, without mixing ownership',()=>{
 const data=catalog([allocation(0,'a','app.one.A','PROJECT'),allocation(1,'b','app.one.B','PROJECT'),allocation(2,'c','app.two.C','PROJECT'),allocation(3,'d','app.two.D','PROJECT'),allocation(4,'external','vendor.Any','JDK')]),scene=data.at()
 const packages=presentationClusters(scene,data.layout.state,scene.order.objects,'MEDIUM',3,null,false)
 expect(packages.map(c=>[c.key,c.memberIds])).toEqual([[{kind:'package',value:'app.one'},['a','b']],[{kind:'package',value:'app.two'},['c','d']],[{kind:'ownership',value:'JDK'},['external']]])
 const root=presentationClusters(scene,data.layout.state,scene.order.objects,'MEDIUM',2,null,false)
 expect(root.map(c=>[c.key,c.memberIds])).toEqual([[{kind:'ownership',value:'PROJECT'},['a','b','c','d']],[{kind:'ownership',value:'JDK'},['external']]])
 for(const clusters of [packages,root])expect(clusters.reduce((sum,c)=>sum+c.members,0)).toBe(scene.order.objects.length)
})
it('separates the actual default package from a recorded ownership cut',()=>{
 const data=catalog([allocation(0,'a','A','PROJECT'),allocation(1,'b','named.B','PROJECT')]),scene=data.at()
 const exact=presentationClusters(scene,data.layout.state,scene.order.objects,'CLOSE',2,null,false)
 const root=presentationClusters(scene,data.layout.state,scene.order.objects,'CLOSE',1,null,false)[0]
 expect(root.key).toEqual({kind:'ownership',value:'PROJECT'});expect(root.id).not.toBe(exact[0].id)
 expect(root.memberIds).toEqual(['a','b']);expect(root.anchor.ports).toEqual({})
})

const ref=(owner:string,index:number,target:string):RuntimeSlot=>({id:`${owner}/field/${index}`,name:`f${index}`,javaType:'vendor.External',value:{kind:'reference',javaType:'vendor.External',objectId:target}})
const planFor=(data:ReturnType<typeof catalog>,detail:'FAR'|'MEDIUM'|'CLOSE',selection:string|null=null,focus:string|null=null)=>planPresentation({scene:data.at(),layout:data.layout.state,detailLevel:detail,selection:selection?{kind:data.at().entities[selection].kind==='frame'?'frame':'object',id:selection}:null,focusTargetId:focus,trace:{active:false,scope:'relevant'}})
const end=(seq:number):TraceEvent=>({...base(seq),type:'PROGRAM_END'})
it('prevents optional detailed and quiet external volumes from bypassing ownership collapse, retaining selection and Focus',()=>{
 const data=catalog([...Array.from({length:20},(_,i)=>allocation(i,`external-${i}`,`vendor.T${i}`,i%2?'LIBRARY':'JDK')),allocation(20,'unknown','java.util.Unknown'),allocation(21,'synthetic','java.util.Synthetic','SYNTHETIC'),end(22)])
 for(const detail of ['FAR','MEDIUM'] as const){
  const plan=planFor(data,detail)
  expect([...plan.entities.keys()].filter(id=>id.startsWith('external-'))).toEqual([])
  expect(plan.clusters.flatMap(c=>c.memberIds).filter(id=>id.startsWith('external-')).length).toBe(20)
  expect(plan.entities.has('unknown')).toBe(true);expect(plan.entities.has('synthetic')).toBe(true)
  const protectedPlan=planFor(data,detail,'external-1','external-2')
  for(const id of ['external-1','external-2'])expect(protectedPlan.entities.get(id)).toMatchObject({mode:'detailed',pinned:true,pickable:true})
 }
 expect([...planFor(data,'CLOSE').entities.keys()].filter(id=>id.startsWith('external-')).length).toBe(20)
})
it('admits exactly the visible optional project-object dependencies without making them semantic mandatory evidence',()=>{
 const data=catalog([...Array.from({length:5},(_,i)=>allocation(i,`external-${i}`,`vendor.T${i}`,'LIBRARY')),allocation(5,'project','app.Project','PROJECT',Array.from({length:5},(_,i)=>ref('project',i,`external-${i}`))),end(6)])
 const plan=planFor(data,'MEDIUM'),node=data.at().entities.project
 expect(faceRows(node,plan.entities.get('project')!).visible.length).toBe(4)
 for(let i=0;i<4;i++)expect(plan.entities.get(`external-${i}`)).toMatchObject({mode:'detailed',pinned:false,pickable:true})
 expect([...plan.pinned]).toEqual([])
 expect(plan.entities.has('external-4')).toBe(false);expect(plan.clusters.flatMap(c=>c.memberIds)).toContain('external-4')
 const far=planFor(data,'FAR');expect([...far.pinned]).toEqual([])
 expect(far.clusters.flatMap(c=>c.memberIds).sort()).toEqual(Array.from({length:5},(_,i)=>`external-${i}`))
})
it('protects optional historical Frame rows and expands only a focused Frame to CLOSE rows',()=>{
 const locals=Array.from({length:5},(_,i)=>({...ref('frame',i,`external-${i}`),role:'parameter' as const}))
 const data=catalog([...Array.from({length:5},(_,i)=>allocation(i,`external-${i}`,`vendor.T${i}`,'JDK')),{...base(5),type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'app.Main',methodName:'run',locals},{...base(6),type:'EXIT_METHOD',frameId:'frame'},end(7)])
 const plan=planFor(data,'MEDIUM');expect(plan.entities.get('frame')?.mode).toBe('detailed')
 for(let i=0;i<4;i++)expect(plan.entities.get(`external-${i}`)).toMatchObject({mode:'detailed',pinned:false,pickable:true})
 expect([...plan.pinned]).toEqual([])
 expect(plan.entities.has('external-4')).toBe(false)
 const focused=planFor(data,'MEDIUM','frame','frame');expect(focused.entities.get('frame')?.detail).toBe('CLOSE')
 expect(focused.entities.get('external-4')?.pinned).toBe(true)
})
it('admits optional sources together with their dependencies without manufacturing mandatory overflow',()=>{
 const events:TraceEvent[]=Array.from({length:20},(_,i)=>allocation(i,`external-${i}`,`vendor.T${i}`,'LIBRARY'))
 for(let i=0;i<5;i++)events.push(allocation(20+i,`source-${i}`,`app.Source${i}`,'PROJECT',Array.from({length:4},(_,j)=>ref(`source-${i}`,j,`external-${i*4+j}`))))
 events.push(end(25));const data=catalog(events),plan=planFor(data,'MEDIUM')
 expect(plan.accounting.detailed).toBe(15);expect(plan.accounting.quiet).toBe(2);expect(plan.accounting.clustered).toBe(8)
 expect(plan.accounting.total).toBe(25);expect(plan.budgetOverflow).toEqual([])
 for(const [id,entity]of plan.entities)if(id.startsWith('source-')&&entity.mode==='detailed')for(const row of faceRows(data.at().entities[id],entity).visible)if(row.value.kind==='reference')expect(plan.entities.get(row.value.targetId)).toMatchObject({mode:'detailed',pinned:false,pickable:true})
 expect([...plan.pinned]).toEqual([])
 expect(new Set([...plan.entities.keys(),...plan.clusters.flatMap(c=>c.memberIds)]).size).toBe(25)
})
it('retains genuine executing-reference overflow and admits no optional object detail beyond it',()=>{
 const locals=Array.from({length:20},(_,i)=>({...ref('frame',i,`external-${i}`),role:'parameter' as const}))
 const data=catalog([...Array.from({length:20},(_,i)=>allocation(i,`external-${i}`,`vendor.T${i}`,'JDK')),allocation(20,'optional','app.Optional','PROJECT'),{...base(21),type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'app.Main',methodName:'run',locals},{...base(22),source:{fileId:'Unit.java',line:1},type:'LINE_EXECUTE',frameId:'frame'}])
 const plan=planPresentation({scene:data.at(undefined,false),layout:data.layout.state,detailLevel:'MEDIUM',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}}),overflow=plan.budgetOverflow.find(entry=>entry.category==='objects')!
 expect(overflow).toMatchObject({nominal:16,actual:20});expect(overflow.mandatoryIds.length).toBe(20)
 expect(overflow.reasons).toContain('direct executing-frame reference')
 for(let i=0;i<20;i++)expect(plan.entities.get(`external-${i}`)).toMatchObject({mode:'detailed',pinned:true,pickable:true})
 expect(plan.entities.get('optional')?.mode).toBe('quiet')
})
it('tentative Hero proxy cuts match actual residual cuts through every coarsening level and reverse query order',()=>{
 const data=catalog([...Array.from({length:24},(_,i)=>allocation(i,`object-${i}`,`app.package${i%4}.T${i}`,'PROJECT')),...Array.from({length:4},(_,i)=>allocation(24+i,`external-${i}`,`vendor.T${i}`,i%2?'JDK':'LIBRARY')),end(28)]),scene=data.at(),ids=scene.order.objects,hierarchy=clusterHierarchy(scene,data.layout.state)
 for(const detail of ['FAR','MEDIUM','CLOSE'] as const)for(const limit of [1,3,8,40]){
  const clearance=prepareClusterClearance(scene,data.layout.state,ids,detail,limit,hierarchy)
  for(const count of [...Array.from({length:ids.length+1},(_,i)=>i),...Array.from({length:ids.length+1},(_,i)=>ids.length-i)]){
   const represented=new Set(ids.filter((_,index)=>index<count)),residual=ids.filter(id=>!represented.has(id))
   expect(clearance(represented)).toEqual(presentationClusters(scene,data.layout.state,residual,detail,limit,null,false,hierarchy).map(cluster=>cluster.anchor))
  }
 }
})
it('queries warmed tentative cuts without reading every scene entity again',()=>{
 const data=catalog([...Array.from({length:1000},(_,i)=>allocation(i,`object-${i}`,`app.p${i%4}.T${i}`,'PROJECT')),end(1000)]),scene=data.at(),ids=scene.order.objects,hierarchy=clusterHierarchy(scene,data.layout.state)
 let reads=0
 const observed={...scene,entities:new Proxy(scene.entities,{get(target,key,receiver){reads++;return Reflect.get(target,key,receiver)}})}
 const clearance=prepareClusterClearance(observed,data.layout.state,ids,'MEDIUM',1,hierarchy)
 clearance(new Set());expect(reads).toBeGreaterThanOrEqual(ids.length);reads=0
 for(let count=1;count<=100;count++)expect(clearance(new Set(ids.slice(0,count)))).toHaveLength(1)
 expect(reads).toBe(0)
})
it('keeps an unadmitted large Hero group whole while ordinary exploration retains its quiet-volume budget',()=>{
 const data=catalog([...Array.from({length:1000},(_,i)=>allocation(i,`object-${i}`,'app.Entry','PROJECT')),{...base(1000),type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'app.Main',methodName:'run',locals:[]},{...base(1001),source:{fileId:'Unit.java',line:1},type:'LINE_EXECUTE',frameId:'frame'}])
 const scene=data.at(undefined,false),input={scene,layout:data.layout.state,detailLevel:'MEDIUM' as const,selection:null,focusTargetId:null,trace:{active:false,scope:'relevant' as const}}
 const hero=planPresentation({...input,hero:{safeFrame:{x:388.8,y:90,width:1029.6,height:675},viewport:{width:1440,height:900}}})
 expect(hero.accounting).toEqual({detailed:1,quiet:0,clustered:1000,total:1001})
 expect(hero.entities.get('frame')).toMatchObject({pinned:true,pickable:true})
 expect(hero.clusters.flatMap(cluster=>cluster.memberIds)).toEqual(scene.order.objects)
 expect(planPresentation(input).accounting.quiet).toBe(512)
})
