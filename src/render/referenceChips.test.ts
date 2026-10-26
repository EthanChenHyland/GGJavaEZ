import {expect,it} from 'vitest'
import {heroTrace} from '../testing/heroTrace'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import {facePlate} from '../world/facePlate'
import {buildSolidBatch} from './SolidBatch'
import {inspectorEntity} from './inspection'
import {motionSubjects} from '../motion/overlayGeometry'
import type {DetailLevel,SceneModel} from '../contracts/world'
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
 }
})
it('does not turn a reference to an absent target into a visible chip',()=>{
 const {scene,plan}=fixture(),entities={...scene.entities};delete entities['first-label']
 const shown={...plan,entities:new Map([...plan.entities].filter(([id])=>id!=='first-label'))}
 const solids=buildSolidBatch({...scene,entities},shown)
 expect(solids.filter(item=>item.pick.kind==='slot'&&item.pick.id==='first-record/label')).toHaveLength(1)
})
