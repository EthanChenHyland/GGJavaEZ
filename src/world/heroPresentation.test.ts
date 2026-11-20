import {expect,it} from 'vitest'
import {heroTrace} from '../testing/heroTrace'
import {projectTrace} from '../testing/projectTrace'
import {seek} from '../runtime'
import {planPresentation} from './presentationPlanner'
import {heroFraming} from '../camera/heroFraming'
import {projectionCamera} from '../camera/projection'
import {buildSolidBatch} from '../render/SolidBatch'
import {projectBodies} from '../qa/worldProjection'
import {placeStructuralLabels,projectStructuralObstacle,regionHeadingSpec} from '../render/text/structuralLabelLayout'
import {projectedPlaneFontPixels} from '../render/text/textSystem'
import {faceHeading} from '../render/text/faceTypography'
import {Vector3} from 'three'
const {trace,cursor}=heroTrace(),projection=projectTrace(trace),scene=projection.project(cursor),layout=projection.layout
const input={scene,layout,detailLevel:'MEDIUM' as const,selection:null,focusTargetId:null,trace:{active:false,scope:'relevant' as const}}
it('does not promote optional context or its JDK field targets into semantic mandatory camera evidence',()=>{
 const plan=planPresentation(input)
 expect([...plan.pinned].sort()).toEqual(['entry','first-record','setter'])
 expect(scene.entities['first-list']).toMatchObject({kind:'collection',ownership:'JDK'})
 expect(layout.anchors['first-list'].region).toBe('heap')
 expect(layout.anchors['first-list'].size).toEqual([5.2,9.93,2.3])
})
it('keeps actual selection and its bounded one-hop context mandatory independently of the optional viewport cut',()=>{
 const plan=planPresentation({...input,selection:{kind:'object',id:'second-list'},focusTargetId:'second-list'})
 expect(plan.pinned.has('second-list')).toBe(true)
 expect(plan.pinned.has('second-record')).toBe(true)
 for(const id of plan.pinned)expect(plan.entities.get(id)).toMatchObject({pinned:true,pickable:true,mode:'detailed'})
})
it('coarsens optional far columns at narrow Hero framing before their extent hides all live face text',()=>{
 const viewport={width:760,height:900},safeFrame={x:40,y:90,width:708.6,height:675}
 const plan=planPresentation({...input,hero:{safeFrame,viewport}}),camera=projectionCamera(heroFraming(scene,plan,safeFrame,viewport),viewport)
 expect(plan.entities.has('first-list')).toBe(false)
 expect(plan.clusters.flatMap(cluster=>cluster.memberIds)).toContain('first-list')
 for(const id of scene.liveStack){
  expect(plan.pinned.has(id)).toBe(true)
  const title=faceHeading(scene.entities[id]).title
  expect(projectedPlaneFontPixels(title.size,new Vector3(...title.position),camera,viewport)).toBeGreaterThanOrEqual(11)
 }
})
for(const viewport of[{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650},{width:1672,height:941}]){
 it(`fits the live Hero bands with truthful optional clustering and immutable runtime geometry at ${viewport.width}x${viewport.height}`,()=>{
  const {width:w,height:h}=viewport,left=w<1024?40:w*.27,safe={x:left,y:h*.1,width:w*.985-left,height:h*.75}
  const before=JSON.stringify(scene),anchors=JSON.stringify(layout),semantic=JSON.stringify(seek(trace,cursor))
  const plan=planPresentation({...input,hero:{safeFrame:safe,viewport}}),pose=heroFraming(scene,plan,safe,viewport),camera=projectionCamera(pose,viewport)
  const bodies=buildSolidBatch(scene,plan).filter(solid=>solid.role!=='face').map(solid=>({anchor:solid.anchor,live:scene.entities[solid.anchor.entityId]?.kind==='frame'&&scene.liveStack.includes(solid.anchor.entityId),structural:solid.pick.kind==='cluster'}))
  const projected=projectBodies(bodies,camera,viewport)
  const obstacles=bodies.flatMap(body=>{const obstacle=projectStructuralObstacle(body.anchor,camera,viewport);return obstacle?[obstacle]:[]})
  const headings=placeStructuralLabels(plan.headings.slice(0,2).map(heading=>regionHeadingSpec(heading.id,heading.position)),camera,viewport,safe,obstacles)
  for(const heading of headings){expect(heading.visible,`${heading.id} must actually render`).toBe(true);expect(heading.minimumFontPixels).toBeGreaterThanOrEqual(12)}
  if(w>=1024){
   expect(Math.abs(projected.liveStack!.x-.30*w)).toBeLessThanOrEqual(.03*w)
   expect(Math.abs(projected.liveStack!.x+projected.liveStack!.width-.49*w)).toBeLessThanOrEqual(.03*w)
   expect(Math.abs(projected.heap!.x-.55*w)).toBeLessThanOrEqual(.03*w)
   expect(projected.heap!.x+projected.heap!.width).toBeLessThanOrEqual(1.01*w)
  }
  expect(plan.accounting.total).toBe(Object.keys(scene.entities).length)
  expect(new Set([...plan.entities.keys(),...plan.clusters.flatMap(cluster=>cluster.memberIds)]).size).toBe(plan.accounting.total)
  expect(JSON.stringify(scene)).toBe(before);expect(JSON.stringify(layout)).toBe(anchors);expect(JSON.stringify(seek(trace,cursor))).toBe(semantic)
 })
}
