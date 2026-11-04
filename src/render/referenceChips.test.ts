import {expect,it} from 'vitest'
import {heroTrace} from '../testing/heroTrace'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import {facePlate} from '../world/facePlate'
import {buildSolidBatch} from './SolidBatch'
import {inspectorEntity} from './inspection'
import {motionSubjects} from '../motion/overlayGeometry'
import type {DetailLevel,SceneModel} from '../contracts/world'
import {faceRows,faceRowPort} from '../world/faceRows'
import {referenceChipPorts,connectorPortMarkers} from './referenceChipPorts'
function fixture(detail:DetailLevel='CLOSE'){
 const {trace}=heroTrace(),projection=projectTrace(trace),scene=projection.project(trace.events.length)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel:detail,selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 return{scene,plan:{...plan,entities:new Map([...plan.entities].map(([id,item])=>[id,{...item,mode:'detailed' as const,detail}]))}}
}
it.each(['MEDIUM','CLOSE'] as const)('gives observed references distinct inset value chips at %s without changing row picks or runtime evidence',detail=>{
 const {scene,plan}=fixture(detail),before=JSON.stringify(scene),node=scene.entities['first-record'],slot='first-record/label'
 const row=facePlate(node,plan.entities.get(node.id)!,slot)!,solids=buildSolidBatch(scene,plan).filter(item=>item.pick.kind==='slot'&&item.pick.id===slot)
 expect(solids).toHaveLength(3)
 expect(solids[0].anchor).toEqual(row)
 expect(motionSubjects(scene,plan).get(slot)?.anchor).toEqual(row)
 const [rim,fill]=solids.slice(1)
 expect(rim.anchor.size[0]).toBeLessThan(row.size[0]*.75)
 expect(fill.anchor.size[0]).toBeLessThan(rim.anchor.size[0])
 expect(fill.anchor.position[0]).toBeGreaterThan(node.anchor.position[0])
 expect(fill.anchor.position[2]+fill.anchor.size[2]/2).toBeLessThan(node.anchor.position[2]+node.anchor.size[2]/2+.1)
 for(const solid of solids){expect(solid.pick).toEqual({kind:'slot',id:slot});expect(inspectorEntity(scene,solid.pick)).toBe(node)}
 expect(JSON.stringify(scene)).toBe(before)
})
it('leaves null, primitive and unavailable values as ordinary row surfaces without reference chips',()=>{
 const {scene,plan}=fixture(),node=scene.entities['first-record'];if(node.kind!=='object')throw new Error('Object fixture')
 const groups=node.groups.map(group=>({...group,rows:group.rows.map(row=>row.name==='label'?{...row,value:{kind:'not-recorded' as const,text:'⟨not recorded⟩' as const,exact:'⟨not recorded⟩' as const,observation:'UNAVAILABLE' as const}}:['tags','related'].includes(row.name)?{...row,value:{kind:'null' as const,text:'null',exact:'null',observation:'OBSERVED' as const}}:row)}))
 const absent:SceneModel={...scene,entities:{...scene.entities,[node.id]:{...node,groups}}},solids=buildSolidBatch(absent,plan)
 for(const name of ['label','quantity','tags','related']){
  const row=solids.filter(item=>item.pick.kind==='slot'&&item.pick.id===`${node.id}/${name}`)
  expect(row.filter(item=>!item.part)).toHaveLength(1)
  expect(row.filter(item=>item.part?.startsWith('reference-chip'))).toHaveLength(0)
  expect(row.filter(item=>item.part?.startsWith('primitive-chip'))).toHaveLength(name==='quantity'?2:0)
  expect(row.filter(item=>item.part?.startsWith('value-chip'))).toHaveLength(0)
  expect(referenceChipPorts(absent,plan).some(port=>port.id===`${node.id}/${name}`)).toBe(false)
 }
})
it('does not turn a reference to an absent target into a visible chip',()=>{
 const {scene,plan}=fixture(),entities={...scene.entities};delete entities['first-label']
 const shown={...plan,entities:new Map([...plan.entities].filter(([id])=>id!=='first-label'))}
 const solids=buildSolidBatch({...scene,entities},shown)
 expect(solids.filter(item=>item.pick.kind==='slot'&&item.pick.id==='first-record/label')).toHaveLength(1)
 expect(referenceChipPorts({...scene,entities},shown).some(port=>port.id==='first-record/label')).toBe(false)
})

it('attaches each visible reference port to the actual value-chip right edge',()=>{
 const {scene,plan}=fixture(),solids=buildSolidBatch(scene,plan)
 const chips=solids.filter(solid=>solid.part==='reference-chip')
 expect(chips.length).toBeGreaterThan(0)
 for(const chip of chips){
  const node=inspectorEntity(scene,chip.pick)!,presented=plan.entities.get(node.id)!
  const port=faceRowPort(node,presented,chip.pick.id)!
  const [x,y,z]=chip.anchor.position,[w,,d]=chip.anchor.size
  expect(port[0]).toBeCloseTo(x+w/2,10)
  expect(port[1]).toBe(y)
  expect(port[2]).toBeCloseTo(z+d/2,10)
 }
})

it('keeps primitive transfer terminals on the owning frame boundary, separate from chip ports',()=>{
 const {scene,plan}=fixture(),solids=buildSolidBatch(scene,plan)
 let count=0
 for(const[id,presented]of plan.entities){
  const node=scene.entities[id];if(node.kind!=='frame')continue
  for(const row of faceRows(node,presented).visible){
   if(row.value.kind!=='primitive')continue
   const chip=solids.find(solid=>solid.pick.id===row.slotId&&solid.part==='primitive-chip')!
   const port=faceRowPort(node,presented,row.slotId)!
   expect(chip).toBeTruthy();expect(port[0]).toBe(node.anchor.position[0]+node.anchor.size[0]/2)
   expect(port[0]-(chip.anchor.position[0]+chip.anchor.size[0]/2)).toBeGreaterThan(.16)
   count++
  }
 }
 expect(count).toBeGreaterThan(0)
})

it('retains exactly the visible captured reference ports when the curve budget supplies no connectors',()=>{
 const{scene,plan}=fixture(),before=JSON.stringify(scene),withoutCurves={...plan,curves:[],bundles:[]}
 const chips=buildSolidBatch(scene,plan).filter(solid=>solid.part==='reference-chip')
 const ports=referenceChipPorts(scene,withoutCurves)
 expect(ports.map(port=>port.id).sort()).toEqual(chips.map(chip=>chip.pick.id).sort())
 expect(ports.length).toBeGreaterThan(0)
 for(const port of ports){
  const chip=chips.find(chip=>chip.pick.id===port.id)!,[x,y,z]=chip.anchor.position,[w,,d]=chip.anchor.size
  expect(port.point[0]).toBeCloseTo(x+w/2,10);expect(port.point[1]).toBe(y);expect(port.point[2]).toBeCloseTo(z+d/2,10)
 }
 expect(referenceChipPorts(scene,{...withoutCurves,entities:new Map()})).toEqual([])
 expect(JSON.stringify(scene)).toBe(before)
})

it('does not double-blend a chip port and its curve terminal, and restores hover alpha',()=>{
 const{scene,plan}=fixture(),ports=referenceChipPorts(scene,plan),port={...ports[0],opacity:.25}
 const curve={id:'observed-attachment',kind:'connector' as const,points:[port.point,[100,20,3]as const],colorRole:'reference' as const,opacity:.25,widthPx:2.5 as const,arrow:false}
 const saved=JSON.stringify({port,curve}),ordinary=connectorPortMarkers([curve],[port])
 expect(ordinary).toHaveLength(2);expect(ordinary[0]).toMatchObject({opacity:.25,hovered:false})
 const hovered=connectorPortMarkers([curve],[port],curve.id)
 expect(hovered).toHaveLength(2);expect(hovered.every(marker=>marker.hovered&&marker.opacity===1)).toBe(true)
 expect(connectorPortMarkers([curve],[port])).toEqual(ordinary)
 expect(JSON.stringify({port,curve})).toBe(saved)
})
