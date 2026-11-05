import {expect,it} from 'vitest'
import type {TraceDocument,TraceEvent,RuntimeValue} from '../contracts/runtime'
import {arrayElementSlotId} from '../contracts/runtime'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import {buildSolidBatch} from './SolidBatch'
import {referenceChipPorts} from './referenceChipPorts'
import {arrayCellTextGeometry} from '../world/arrayCellGeometry'

const reference=(objectId:string):RuntimeValue=>({kind:'reference',javaType:'Unit.Item',objectId})
const integer=(value:number):RuntimeValue=>({kind:'primitive',javaType:'int',value})
const absent:RuntimeValue={kind:'unavailable',reason:'Explicit unit capture bound'}
const metadata={ownership:'PROJECT' as const,runtimeType:'Unit.Item',packageName:'unit'}
function fixture(focusTargetId:string|null=null){
 // Explicit normalized unit records; these are not claimed as JVM evidence.
 const records=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId:'unit/main',callerFrameId:null,className:'Unit',methodName:'main',locals:[]},
  ...['first','second'].map(objectId=>({type:'ALLOCATE_OBJECT',objectId,displayId:objectId==='first'?1:2,className:'Unit.Item',fields:[],metadata})),
  {type:'ALLOCATE_ARRAY',objectId:'array',displayId:3,elementType:'Unit.Item',length:5,truncated:true,elements:[reference('first'),reference('second'),reference('first'),{kind:'null'}],metadata:{...metadata,runtimeType:'Unit.Item[]'}},
  {type:'ALLOCATE_OBJECT',objectId:'list',displayId:4,className:'java.util.ArrayList',fields:[],metadata},
  {type:'OBJECT_OBSERVE',objectId:'list',library:{kind:'LIST',size:5,items:[reference('first'),integer(7),{kind:'null'},reference('first'),absent]}},
  {type:'ALLOCATE_OBJECT',objectId:'map',displayId:5,className:'java.util.LinkedHashMap',fields:[],metadata},
  {type:'OBJECT_OBSERVE',objectId:'map',library:{kind:'MAP',size:4,entries:[{key:reference('first'),value:reference('second')},{key:integer(7),value:reference('first')},{key:{kind:'null'},value:{kind:'null'}},{key:absent,value:absent}] }},
  {type:'EXIT_METHOD',frameId:'unit/main'},{type:'PROGRAM_END'}]
 const trace:TraceDocument={schemaVersion:2,demoId:'unit/structure-reference-chips',sourceFiles:[],events:records.map((record,seq)=>({...record,seq,eventId:`unit/structure/${seq}`,source:null,label:'Explicit normalized chip unit',importance:'normal'}))as TraceEvent[]}
 const projection=projectTrace(trace),scene=projection.project(trace.events.length)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:null,focusTargetId,trace:{active:false,scope:'relevant'}})
 return{scene,plan,layout:projection.layout}
}

it('gives every visible captured array/List/Map reference a chip and port even without a curve',()=>{
 const{scene,plan,layout}=fixture(),before=JSON.stringify({scene,layout})
 const withoutCurves={...plan,curves:[],bundles:[]}
 const references=scene.references.filter(ref=>['array','list','map'].includes(ref.sourceId))
 expect(references).toHaveLength(8)
 const chips=buildSolidBatch(scene,withoutCurves).filter(part=>part.part==='reference-chip')
 const ports=referenceChipPorts(scene,withoutCurves)
 expect(chips.map(chip=>chip.pick.id).sort()).toEqual(references.map(ref=>ref.sourceSlotId).sort())
 expect(ports.map(port=>port.id).sort()).toEqual(references.map(ref=>ref.sourceSlotId).sort())
 for(const chip of chips){
  const port=ports.find(port=>port.id===chip.pick.id)!,[x,y,z]=chip.anchor.position,[w,,d]=chip.anchor.size
  expect(port.point[0]).toBeCloseTo(x+w/2,10);expect(port.point[1]).toBe(y);expect(port.point[2]).toBeCloseTo(z+d/2,10)
  expect(chip.pick).toEqual({kind:'slot',id:chip.pick.id});expect(chip.pickable).toBe(true)
  const curve=plan.curves.find(curve=>curve.id===references.find(ref=>ref.sourceSlotId===chip.pick.id)!.id)
  if(curve)expect(curve.points[0]).toEqual(port.point)
 }
 for(const id of [arrayElementSlotId('array',3),arrayElementSlotId('array',4),'list:summary:item:1','list:summary:item:2','list:summary:item:4','map:summary:entry:1:key','map:summary:entry:2:key','map:summary:entry:2:value','map:summary:entry:3:key','map:summary:entry:3:value']){
  expect(chips.some(chip=>chip.pick.id===id)).toBe(false);expect(ports.some(port=>port.id===id)).toBe(false)
 }
 expect(JSON.stringify({scene,layout})).toBe(before)
})

it('keeps nonfocused array chips and their independent ports inside the exact cell Focus cap',()=>{
 const focused=arrayElementSlotId('array',0),{scene,plan}=fixture(focused)
 const chips=buildSolidBatch(scene,plan).filter(part=>part.part==='reference-chip'&&part.pick.id.startsWith('array:element:'))
 const ports=referenceChipPorts(scene,{...plan,curves:[],bundles:[]}).filter(port=>port.id.startsWith('array:element:'))
 expect(chips).toHaveLength(3);expect(ports).toHaveLength(3)
 expect(chips.find(chip=>chip.pick.id===focused)!.opacity).toBe(1)
 expect(ports.find(port=>port.id===focused)!.opacity).toBe(1)
 for(const item of chips.filter(chip=>chip.pick.id!==focused))expect(item.opacity).toBeLessThanOrEqual(.25)
 for(const item of ports.filter(port=>port.id!==focused))expect(item.opacity).toBeLessThanOrEqual(.25)
})

it('keeps array values centred and ahead of the actual inset front with the existing glyph font plane',()=>{
 const{scene,plan}=fixture(),chips=buildSolidBatch(scene,plan).filter(part=>part.part==='reference-chip'&&part.pick.id.startsWith('array:element:'))
 expect(chips).toHaveLength(3)
 for(const chip of chips){
  const cell=plan.cellWindows.get('array')!.mapping.get(chip.pick.id)!,text=arrayCellTextGeometry(cell.anchor).value
  expect(text[0]).toBe(cell.anchor.position[0]);expect(text[1]).toBe(cell.anchor.position[1])
  expect(text[2]-(chip.anchor.position[2]+chip.anchor.size[2]/2)).toBeCloseTo(.019,10)
 }
})
