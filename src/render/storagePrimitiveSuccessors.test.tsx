// Current storage-face successors use normalized unit records and the production
// projector/planner/batch. They are not JVM/browser or visual acceptance evidence.
import {renderToStaticMarkup} from 'react-dom/server'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {RuntimeSlot,TraceDocument,TraceEvent} from '../contracts/runtime'
import type {SceneEntity,DetailLevel,SceneModel,PresentationPlan} from '../contracts/world'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import {faceRows,faceRowPort} from '../world/faceRows'
import {presentedFlowPorts} from '../world/flowTopology'
import {buildSolidBatch} from './SolidBatch'
import {inspectorEntity,inspectorRows} from './inspection'
const captured=vi.hoisted(()=>({labels:[]as {children:string;size?:number;weight?:number;position:readonly number[];heading?:{entityId:string;kind:string};frameText?:{kind:string;slotId?:string}}[]}))
vi.mock('./FaceText',()=>({WorldText:(props:typeof captured.labels[number])=>{captured.labels.push(props);return null}}))
import {RuntimeSolid} from './RuntimeSolid'
const int=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
const slot=(owner:string,index:number):RuntimeSlot=>({id:`${owner}/captured/${index}`,name:`value${index}`,javaType:'int',value:int(index)})
function fixture(count=20){
 const inputs:object[]=[{type:'PROGRAM_START'},
  {type:'CLASS_OBSERVE',classId:'jvm:class:pkg.Registry',className:'pkg.Registry',initialization:'observed',fields:Array.from({length:count},(_,i)=>slot('class',i))},
  {type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'pkg.Main',methodName:'run',returnType:'void',locals:Array.from({length:count},(_,i)=>slot('frame',i))},
  {type:'ALLOCATE_OBJECT',objectId:'object',displayId:41,className:'pkg.Account',metadata:{ownership:'PROJECT',runtimeType:'pkg.Account',packageName:'pkg'},fields:Array.from({length:count},(_,i)=>slot('object',i))},
  ...Array.from({length:count},(_,i)=>({type:'SET_STATIC',classId:'jvm:class:pkg.Registry',slotId:`class/captured/${i}`,value:int(i)}))]
 const trace:TraceDocument={schemaVersion:2,demoId:'storage-primitive-unit',sourceFiles:[],events:inputs.map((input,seq)=>({...input,seq,eventId:`storage/${seq}`,source:null,label:'Captured unit storage',importance:'normal'}as TraceEvent))}
 const projection=projectTrace(trace),scene=projection.project(trace.events.length),plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 return{trace,projection,scene,plan}
}
function render(node:SceneEntity,plan:PresentationPlan,detail:DetailLevel='CLOSE'){
 const presented={...plan.entities.get(node.id)!,mode:'detailed' as const,detail}
 renderToStaticMarkup(<RuntimeSolid node={node} presented={presented} plan={plan}/>)
 return presented
}
const texts=()=>captured.labels.map(label=>label.children)
beforeEach(()=>{captured.labels.length=0;vi.spyOn(console,'error').mockImplementation(()=>{})})
afterEach(()=>vi.restoreAllMocks())
it.each([8,9,20])('bounds %s captured frame rows and its exact disclosure without synthetic return storage or larger geometry',count=>{
 const {scene,plan}=fixture(count),node=scene.entities.frame,before=JSON.stringify(node),presented=render(node,plan),model=faceRows(node,presented)
 expect(model.visible.length).toBeLessThanOrEqual(10);expect(inspectorRows(node).count).toBe(count)
 const hidden=count-model.visible.length
 if(hidden)expect(texts()).toContain(`+${hidden} more`)
 else expect(texts().some(text=>/^\+\d+ more$/.test(text))).toBe(false)
 for(const row of model.visible){
  const port=faceRowPort(node,presented,row.slotId)!
  expect(port[1]).toBeLessThan(node.anchor.position[1]+node.anchor.size[1]/2-model.header)
  expect(port[1]).toBeGreaterThan(node.anchor.position[1]-node.anchor.size[1]/2)
  expect(model.rows.some(item=>item.slotId===row.slotId)).toBe(true)
 }
 expect(buildSolidBatch(scene,plan).find(solid=>solid.role==='stack')!.anchor).toBe(node.anchor)
 expect(model.rows.map(row=>row.slotId)).toEqual(Array.from({length:count},(_,index)=>`frame/captured/${index}`));expect(JSON.stringify(node)).toBe(before)
})
it.each(['frame','object','class']as const)('keeps surviving canonical %s row ports and row plates fixed when earlier rows are absent',kind=>{
 const {scene,plan}=fixture(3),node=scene.entities[kind==='class'?'jvm:class:pkg.Registry':kind],presented={detail:'CLOSE' as const},original=faceRows(node,presented),before=JSON.stringify(node)
 const changed=node.kind==='object'?{...node,groups:node.groups.map(group=>({...group,rows:group.rows.slice(1)}))}:node.kind==='frame'||node.kind==='class'?{...node,rows:node.rows.slice(1)}:null
 if(!changed)throw new Error('Expected captured storage')
 for(const row of faceRows(changed,presented).visible){expect(faceRowPort(changed,presented,row.slotId)).toEqual(faceRowPort(node,presented,row.slotId));expect(original.rows.some(item=>item.slotId===row.slotId)).toBe(true)}
 const modified:SceneModel={...scene,entities:{...scene.entities,[node.id]:changed}},detailed={...plan,entities:new Map([...plan.entities].map(([id,cut])=>[id,{...cut,mode:'detailed' as const,detail:'CLOSE' as const}]))},oldPlates=buildSolidBatch(scene,detailed),newPlates=buildSolidBatch(modified,detailed)
 for(const plate of newPlates.filter(item=>item.role==='face'&&!item.part&&item.pick.kind==='slot'&&item.pick.id.startsWith(kind+'/')))expect(plate.anchor).toEqual(oldPlates.find(item=>item.pick.id===plate.pick.id&&!item.part)!.anchor)
 // Value insets follow the existing measured column grid; the canonical row
 // hit/mutation plate and Port remain fixed when that grid gains/removes rows.
 for(const inset of newPlates.filter(item=>item.part==='primitive-chip')){
  const row=newPlates.find(item=>item.role==='face'&&!item.part&&item.pick.id===inset.pick.id)!
  expect(inset.anchor.position[1]).toBe(row.anchor.position[1])
  expect(inset.anchor.position[0]-inset.anchor.size[0]/2).toBeGreaterThan(row.anchor.position[0]-row.anchor.size[0]/2)
  expect(inset.anchor.position[0]+inset.anchor.size[0]/2).toBeLessThan(row.anchor.position[0]+row.anchor.size[0]/2)
 }
 expect(JSON.stringify(node)).toBe(before)
})
it.each(['object','class']as const)('keeps real %s values distinguishable without fabricating canonical ports or duplicate fallback chips',kind=>{
 const {scene,plan}=fixture(6),original=scene.entities[kind==='class'?'jvm:class:pkg.Registry':kind],node={...original,anchor:{...original.anchor,ports:{}}},modified:SceneModel={...scene,entities:{...scene.entities,[node.id]:node}},before=JSON.stringify(node)
 const presented=render(node,plan),rows=faceRows(node,presented),all=buildSolidBatch(modified,plan).filter(item=>item.role==='face'&&item.pick.kind==='slot'&&item.pick.id.startsWith(kind+'/')),plates=all.filter(item=>!item.part)
 expect(plates).toHaveLength(rows.visible.length);expect(new Set(plates.map(plate=>plate.anchor.position.join(','))).size).toBe(plates.length)
 expect(all.filter(item=>item.part==='primitive-chip')).toHaveLength(rows.visible.length)
 expect(all.filter(item=>item.part==='primitive-chip-rim')).toHaveLength(rows.visible.length)
 for(const row of rows.visible){expect(faceRowPort(node,presented,row.slotId)).toBeNull();expect(presentedFlowPorts(modified,plan.entities,plan.cellWindows)({kind:'slot',id:row.slotId})).toBeNull();expect(inspectorEntity(modified,{kind:'slot',id:row.slotId})).toBe(node)}
 expect(inspectorRows(node).count).toBe(6);expect(inspectorRows(node).at(5).value.exact).toBe('5');expect(JSON.stringify(node)).toBe(before)
})
it('presents actual static storage as a class shelf without an instance identity or fabricated object',()=>{
 const {scene,plan}=fixture(6),node=scene.entities['jvm:class:pkg.Registry']
 if(node.kind!=='class')throw new Error('Expected static class')
 render(node,plan)
 expect(captured.labels.find(label=>label.heading?.kind==='title')!.children).toBe(node.title)
 expect(captured.labels.some(label=>label.heading?.kind==='identity')).toBe(false)
 expect(texts()).toContain('static · observed')
 const body=buildSolidBatch(scene,plan).find(solid=>solid.role==='class')!
 expect(body.pick).toEqual({kind:'class',id:node.id});expect(body.anchor).toBe(node.anchor);expect(scene.order.objects).not.toContain(node.id)
})
it.each(['FAR','MEDIUM','CLOSE']as const)('uses current %s row/type policy with fixed fonts and unchanged cuboids',detail=>{
 const {scene,plan}=fixture(),node=scene.entities.frame,before=JSON.stringify(node),presented=render(node,plan,detail),model=faceRows(node,presented)
 expect(model.visible.length).toBeLessThanOrEqual(detail==='FAR'?0:detail==='MEDIUM'?4:10)
 expect(captured.labels.find(label=>label.heading?.kind==='title')).toMatchObject({size:.4,weight:600})
 const names=captured.labels.filter(label=>label.frameText?.kind==='name')
 expect(names).toHaveLength(model.visible.length);expect(names.every(label=>label.size===.32&&label.weight===500)).toBe(true)
 if(detail==='MEDIUM'){expect(names.every(label=>label.children.endsWith(' →'))).toBe(true);expect(captured.labels.some(label=>label.size===.27)).toBe(false)}
 expect(JSON.stringify(node)).toBe(before)
})
it('promotes a selected captured late local into a real bounded row shared by text, picking and Flow endpoint lookup',()=>{
 const {scene,projection}=fixture(),id='frame/captured/19',node=scene.entities.frame,saved=JSON.stringify(node.anchor)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:{kind:'slot',id},focusTargetId:null,trace:{active:false,scope:'relevant'}}),presented=render(node,plan),model=faceRows(node,presented)
 expect(model.visible.some(row=>row.slotId===id)).toBe(true)
 const port=faceRowPort(node,presented,id)!
 expect(presentedFlowPorts(scene,plan.entities,plan.cellWindows)({kind:'slot',id})?.point).toEqual(port)
 expect(buildSolidBatch(scene,plan).some(solid=>solid.pick.id===id&&solid.pick.kind==='slot')).toBe(true)
 expect(captured.labels.find(label=>label.frameText?.kind==='value'&&label.frameText.slotId===id)!.children).toBe('19')
 expect(node.anchor.ports[id]).toBeUndefined();expect(JSON.stringify(node.anchor)).toBe(saved)
})
it.each(['object','class']as const)('bounds 100 captured %s fields, discloses the exact hidden count and retains every Inspector value',kind=>{
 const {scene,plan}=fixture(100),node=scene.entities[kind==='class'?'jvm:class:pkg.Registry':kind],before=JSON.stringify(node),presented=render(node,plan),model=faceRows(node,presented)
 expect(model.rows).toHaveLength(100);expect(model.visible.length).toBeGreaterThan(0);expect(model.visible.length).toBeLessThanOrEqual(12)
 expect(texts()).toContain(`+${100-model.visible.length} more`)
 for(const row of model.visible){const point=faceRowPort(node,presented,row.slotId)!;expect(point[1]).toBeLessThan(node.anchor.position[1]+node.anchor.size[1]/2-model.header);expect(point[1]).toBeGreaterThan(node.anchor.position[1]-node.anchor.size[1]/2)}
 const rows=inspectorRows(node);expect(rows.count).toBe(100)
 for(let index=0;index<rows.count;index++)expect(rows.at(index)).toMatchObject({slotId:`${kind}/captured/${index}`,value:{exact:String(index)}})
 expect(JSON.stringify(node)).toBe(before)
})
it.each(['object','class']as const)('retains actual %s identity at FAR detail without hidden rows or fabricated instance IDs',kind=>{
 const {scene,plan}=fixture(6),node=scene.entities[kind==='class'?'jvm:class:pkg.Registry':kind],before=JSON.stringify(node),presented=render(node,plan,'FAR')
 expect(faceRows(node,presented).visible).toEqual([])
 expect(captured.labels.filter(label=>label.heading?.kind==='title')).toHaveLength(1)
 expect(captured.labels.filter(label=>label.heading?.kind==='identity').map(label=>label.children)).toEqual(kind==='object'?['#41']:[])
 expect(inspectorRows(node).count).toBe(6);expect(JSON.stringify(node)).toBe(before)
})
it.each(['object','class']as const)('keeps an off-face captured %s selection exact in the Inspector without a false visible endpoint',kind=>{
 const {scene,projection}=fixture(100),id=`${kind}/captured/99`,node=scene.entities[kind==='class'?'jvm:class:pkg.Registry':kind],before=JSON.stringify(node)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:{kind:'slot',id},focusTargetId:null,trace:{active:false,scope:'relevant'}}),presented=render(node,plan)
 expect(inspectorEntity(scene,{kind:'slot',id})).toBe(node);expect(inspectorRows(node).at(99)).toMatchObject({name:'value99',value:{exact:'99'}})
 expect(faceRows(node,presented).visible.some(row=>row.slotId===id)).toBe(false)
 expect(faceRowPort(node,presented,id)).toBeNull();expect(presentedFlowPorts(scene,plan.entities,plan.cellWindows)({kind:'slot',id})).toBeNull()
 expect(buildSolidBatch(scene,plan).some(solid=>solid.pick.id===id)).toBe(false);expect(JSON.stringify(node)).toBe(before)
})

it.each(['MEDIUM','CLOSE']as const)('contains captured null, unavailable and String-summary Frame values in %s chips without inventing reference ports',detail=>{
 const {scene,plan}=fixture(3),original=scene.entities.frame
 if(original.kind!=='frame')throw new Error('Expected captured Frame')
 const values=[{kind:'null' as const,text:'null',exact:'null',observation:'OBSERVED' as const},{kind:'not-recorded' as const,text:'⟨not recorded⟩' as const,exact:'⟨not recorded⟩' as const,observation:'UNAVAILABLE' as const,reason:'Recorder could not capture local'},{kind:'string' as const,text:'"captured"',exact:'"captured"',observation:'OBSERVED' as const}]
 const node={...original,rows:original.rows.map((row,index)=>({...row,value:values[index]}))},modified={...scene,entities:{...scene.entities,[node.id]:node}},presented=render(node,plan,detail),cut={...plan,entities:new Map([...plan.entities].map(([id,item])=>[id,id===node.id?presented:item]))},before=JSON.stringify(modified),solids=buildSolidBatch(modified,cut)
 for(const row of faceRows(node,presented).visible){
  const parts=solids.filter(item=>item.pick.kind==='slot'&&item.pick.id===row.slotId),plate=parts.find(item=>!item.part)!,rim=parts.find(item=>item.part==='value-chip-rim')!,fill=parts.find(item=>item.part==='value-chip')!
  expect(parts.map(item=>item.part)).toEqual([undefined,'value-chip-rim','value-chip'])
  expect(fill.anchor.position[1]).toBe(plate.anchor.position[1]);expect(fill.anchor.size[0]).toBeLessThan(rim.anchor.size[0]);expect(fill.anchor.ports).toEqual({});expect(fill.tint).toBe('#081538')
  expect(fill.anchor.position[0]-fill.anchor.size[0]/2).toBeGreaterThan(plate.anchor.position[0]-plate.anchor.size[0]/2)
  expect(fill.anchor.position[0]+fill.anchor.size[0]/2).toBeLessThan(plate.anchor.position[0]+plate.anchor.size[0]/2)
  expect(captured.labels.find(label=>label.frameText?.kind==='value'&&label.frameText.slotId===row.slotId)?.children).toBe(row.value.text)
  expect(inspectorRows(node).at(node.rows.findIndex(item=>item.slotId===row.slotId)).value.exact).toBe(row.value.exact)
 }
 expect(modified.references).toBe(scene.references);expect(JSON.stringify(modified)).toBe(before)
})
