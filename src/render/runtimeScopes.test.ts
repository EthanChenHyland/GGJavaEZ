import {describe,expect,it} from 'vitest'
import {loadControlTrace} from '../examples/traces'
import {projectTrace} from '../testing/projectTrace'
import {seek} from '../runtime'
import type {RuntimeSlot,TraceDocument,TraceEvent} from '../contracts/runtime'
import {planPresentation} from '../world/presentationPlanner'
import {faceRows,faceRowPort} from '../world/faceRows'
import {inspectorRows,inspectorEntity} from './inspection'
import {accessibleEntities} from '../interaction/accessibleEntities'
import {buildSolidBatch} from './SolidBatch'
import {useCameraStore} from '../camera/cameraStore'
import {world} from '../theme/tokens'
const int=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
const local=(id:string,scopeId:string):RuntimeSlot=>({id,scopeId,name:id,javaType:'int',value:int(7)})
const slots=[local('input','entry'),local('sum','entry'),local('index','loop'),local('sample','body'),local('accepted','body'),local('argument','call-root'),local('adjusted','branch'),local('alternative','else-branch')]
const enter=(frameId:string,scopeId:string,parentId:string|null,labelScope:string)=>({type:'ENTER_SCOPE',frameId,scopeId,parentId,labelScope})
const declare=(frameId:string,slot:RuntimeSlot)=>({type:'DECLARE_LOCAL',frameId,slot})
const payloads:object[]=[{type:'PROGRAM_START'},{type:'ALLOCATE_OBJECT',objectId:'reader',displayId:1,className:'java.util.Scanner',fields:[]},{type:'ENTER_METHOD',frameId:'entry-frame',callerFrameId:null,className:'Example',methodName:'run',locals:[]},
 enter('entry-frame','entry',null,'method body'),...slots.slice(0,2).map(slot=>declare('entry-frame',slot)),enter('entry-frame','loop','entry','repeat'),declare('entry-frame',slots[2]),enter('entry-frame','body','loop','iteration body'),...slots.slice(3,5).map(slot=>declare('entry-frame',slot)),
 declare('entry-frame',{id:'reader-slot',name:'reader',scopeId:'body',javaType:'java.util.Scanner',value:{kind:'reference',javaType:'java.util.Scanner',objectId:'reader'}}),
 {type:'INPUT_READ',frameId:'entry-frame',readerObjectId:'reader',method:'nextInt',inputIndex:0,destinationSlotId:'sample',text:'7',value:int(7)},
 {type:'ENTER_METHOD',frameId:'call-frame',callerFrameId:'entry-frame',className:'Example',methodName:'normalize',locals:[],returnType:'int'},enter('call-frame','call-root',null,'method body'),declare('call-frame',slots[5]),enter('call-frame','branch','call-root','negative branch'),declare('call-frame',slots[6]),{type:'EXIT_SCOPE',frameId:'call-frame',scopeId:'branch'},enter('call-frame','else-branch','call-root','fallback branch'),declare('call-frame',slots[7]),{type:'EXIT_SCOPE',frameId:'call-frame',scopeId:'else-branch'},enter('call-frame','empty','call-root','empty block'),{type:'EXIT_SCOPE',frameId:'call-frame',scopeId:'empty'},
 {type:'RETURN_VALUE',frameId:'call-frame',value:int(7),destination:{frameId:'entry-frame',slotId:'accepted'}},{type:'EXIT_METHOD',frameId:'call-frame'},
 {type:'EXIT_SCOPE',frameId:'entry-frame',scopeId:'body'},{type:'EXIT_SCOPE',frameId:'entry-frame',scopeId:'loop'},{type:'EXIT_SCOPE',frameId:'entry-frame',scopeId:'entry'},{type:'EXIT_METHOD',frameId:'entry-frame'},{type:'PROGRAM_END'}]
const trace:TraceDocument={schemaVersion:2,demoId:'captured-scope-unit',sourceFiles:[],events:payloads.map((payload,seq)=>({...payload,eventId:`scope-unit/${seq}`,seq,source:null,label:'Recorded operation',importance:'normal'} as TraceEvent))},projection=projectTrace(trace),layout=projection.layout
const cut=(cursor:number,slotId?:string)=>{const scene=projection.project(cursor),plan=planPresentation({scene,layout,detailLevel:'CLOSE',selection:slotId?{kind:'slot',id:slotId}:null,focusTargetId:null,trace:{active:false,scope:'relevant'}});return{scene,plan}}
const position=(cursor:number,id:string,slotId:string)=>{const {scene,plan}=cut(cursor,slotId);return faceRowPort(scene.entities[id],plan.entities.get(id)!,slotId)}

describe('production lexical scope successors',()=>{
 it('preserves every actual control-fixture variable and active scope through all forward/backward prefixes',()=>{
  const actual=loadControlTrace(),view=projectTrace(actual),cursors=Array.from({length:actual.events.length+1},(_,i)=>i),saved=JSON.stringify(view.layout)
  for(const cursor of[...cursors,...cursors.reverse()]){
   const state=seek(actual,cursor),scene=view.project(cursor)
   for(const id of scene.order.frames){const node=scene.entities[id];if(node.kind!=='frame')continue;expect(node.anchor).toBe(view.layout.anchors[id]);for(const row of node.rows){const slot=state.frames[id].locals[row.slotId];expect(slot).toBeDefined();if(slot.scopeId){expect(state.scopes[slot.scopeId].status).toBe('active');expect(row.scopeDepth).toBe(state.scopes[slot.scopeId].depth)}}}
   for(const id of Object.keys(state.scopes))expect(view.layout.anchors[id]).toBeUndefined()
  }
  expect(JSON.stringify(view.layout)).toBe(saved)
 })
 it('fits captured scope dividers and selected live rows inside separate canonical invocation bodies',()=>{
  const {scene}=cut(18),entry=scene.entities['entry-frame'],call=scene.entities['call-frame']
  expect(call.anchor.position[2]-call.anchor.size[2]/2).toBeGreaterThan(entry.anchor.position[2]+entry.anchor.size[2]/2)
  for(const slot of slots.slice(0,7)){
   const id=slot.scopeId?.startsWith('call-')||slot.scopeId==='branch'?'call-frame':'entry-frame',{scene,plan}=cut(18,slot.id),node=scene.entities[id],presented=plan.entities.get(id)!,model=faceRows(node,presented)
   expect(model.visible.some(row=>row.slotId===slot.id)).toBe(true)
   const ys=model.visible.map(row=>faceRowPort(node,presented,row.slotId)![1])
   for(let i=1;i<ys.length;i++)expect(ys[i-1]-ys[i]).toBeGreaterThanOrEqual(model.pitch-1e-8)
   for(const y of ys){expect(y).toBeLessThan(node.anchor.position[1]+node.anchor.size[1]/2-world.frame.header);expect(y).toBeGreaterThan(node.anchor.position[1]-node.anchor.size[1]/2+world.frame.pad)}
   for(const divider of model.scopes?.dividers??[])expect(divider.depth).toBeGreaterThan(0)
  }
 })
 it('retires closed lexical rows and restores reverse replay without moving bodies or permanent ports',()=>{
  const original=JSON.stringify(layout),open=cut(11,'sample'),originalPort=position(11,'entry-frame','sample'),closed=cut(27)
  expect(inspectorRows(open.scene.entities['entry-frame']).count).toBe(5)
  const remaining=closed.scene.entities['entry-frame'];if(remaining.kind!=='frame')throw new Error('Expected frame')
  expect(remaining.rows.map(row=>row.slotId)).toEqual(['input','sum','index'])
  expect(inspectorEntity(closed.scene,{kind:'slot',id:'sample'})).toBeNull()
  expect(position(27,'entry-frame','sample')).toBeNull()
  expect(buildSolidBatch(closed.scene,closed.plan).some(solid=>solid.pick.id==='sample')).toBe(false)
  expect(position(11,'entry-frame','sample')).toEqual(originalPort)
  expect(JSON.stringify(layout)).toBe(original)
 })
 it('reuses the bounded sibling row window and preserves an active empty block without invented locals',()=>{
  const before=cut(18,'adjusted'),after=cut(21,'alternative'),empty=cut(23)
  expect(position(18,'call-frame','adjusted')).toEqual(position(21,'call-frame','alternative'))
  expect(before.scene.entities['call-frame'].anchor).toBe(after.scene.entities['call-frame'].anchor)
  expect(seek(trace,23).scopes.empty).toMatchObject({status:'active',label:'empty block'})
  expect(empty.scene.entities['call-frame']).toMatchObject({rows:[{slotId:'argument'}]})
  expect(layout.anchors.empty).toBeUndefined()
  expect(buildSolidBatch(empty.scene,empty.plan).some(solid=>solid.pick.id==='adjusted'||solid.pick.id==='alternative')).toBe(false)
 })
 it('retains captured scope truth, typed values and keyboard entity selection with camera guidance disabled',()=>{
  const saved=useCameraStore.getState().follow
  try{
   useCameraStore.getState().enableFollow();const guided=cut(18,'adjusted')
   useCameraStore.getState().userInput();const plain=cut(18,'adjusted')
   expect({...plain.scene,revision:guided.scene.revision}).toEqual(guided.scene);expect(plain.plan.entities).toEqual(guided.plan.entities)
   const catalog=accessibleEntities(plain.scene,plain.plan,point=>({x:point[0],y:-point[1],visible:true}))
   expect(catalog.some(item=>item.id==='call-frame'&&item.selection.kind==='frame')).toBe(true)
   expect(inspectorRows(plain.scene.entities['call-frame']).at(1)).toMatchObject({name:'adjusted',type:'int',value:{exact:'7'}})
  }finally{useCameraStore.setState({follow:saved})}
 })
 it('keeps the exact recorded input destination and value visible while unrelated camera guidance is absent',()=>{
  const {scene,plan}=cut(13,'sample'),state=seek(trace,13)
  expect(trace.events[12]).toMatchObject({type:'INPUT_READ',destinationSlotId:'sample',text:'7',value:int(7)})
  expect(state.frames['entry-frame'].locals.sample.value).toEqual(int(7))
  expect(scene.cursorEvent?.subjects).toContain('entry-frame')
  const node=scene.entities['entry-frame'],model=faceRows(node,plan.entities.get(node.id)!)
  expect(model.visible.find(row=>row.slotId==='sample')?.value.exact).toBe('7')
  expect(faceRowPort(node,plan.entities.get(node.id)!,'sample')).not.toBeNull()
 })
 it('preserves exact recorded caller return facts through matching exit and later history without a graphless Flow',()=>{
  const transfer=seek(trace,25).returns.at(-1)!
  expect(transfer).toMatchObject({frameId:'call-frame',value:int(7),destination:{frameId:'entry-frame',slotId:'accepted'}})
  expect(seek(trace,25).frames['entry-frame'].locals.accepted.value).toEqual(int(7))
  for(const cursor of[24,25,26,27,31]){const {scene,plan}=cut(cursor);expect(scene.returnFlows).toEqual([]);expect(plan.curves.filter(curve=>curve.kind==='return')).toEqual([])}
  expect(seek(trace,31).returns.at(-1)).toEqual(transfer)
  expect(projection.project(27).entities['call-frame']).toMatchObject({live:false,status:{kind:'returned',value:{exact:'7'}}})
 })
})
