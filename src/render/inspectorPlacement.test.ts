import {expect,it} from 'vitest'
import {loadArrayTrace,loadPersonTrace} from '../examples/traces'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import {anchorCorners} from '../world/anchorGeometry'
import {facePlate} from '../world/facePlate'
import {projectionCamera,screenPoint} from '../camera/projection'
import {inspectorSideForTarget,inspectorTargetPoints} from './inspectorPlacement'
const viewport={width:1440,height:900},pose={target:[8,-3,0] as const,distance:36,yawDeg:8,pitchDeg:-13}
const projection=projectTrace(loadPersonTrace()),scene=projection.project(18)
const plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
it('places the card opposite the projected frame and heap bounds',()=>{
 expect(inspectorSideForTarget(scene,plan,{kind:'frame',id:'frame:main:1'},pose,viewport)).toBe('right')
 expect(inspectorSideForTarget(scene,plan,{kind:'object',id:'object:person:17'},pose,viewport)).toBe('left')
})
it('uses projected body bounds rather than the anchor centre for a deep oblique body',()=>{
 const node=scene.entities['object:person:17'],anchor={...node.anchor,position:[.05,0,0] as const,size:[16,2,16] as const},changed={...scene,entities:{...scene.entities,[node.id]:{...node,anchor}}}
 const oblique={target:[0,0,0] as const,distance:20,yawDeg:30,pitchDeg:0}
 expect(screenPoint(anchor.position,projectionCamera(oblique,viewport),viewport).x).toBeGreaterThan(viewport.width/2)
 expect(inspectorSideForTarget(changed,plan,{kind:'object',id:node.id},oblique,viewport)).toBe('right')
})
it('resolves real storage chip and array-cell volumes instead of their owner envelopes',()=>{
 const frame=scene.entities['frame:main:1'],slot=frame.kind==='frame'?frame.rows.find(row=>row.name==='p')!.slotId:''
 const selected=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:{kind:'slot',id:slot},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(inspectorTargetPoints(scene,selected,{kind:'slot',id:slot})).toEqual(anchorCorners(facePlate(frame,selected.entities.get(frame.id)!,slot)!))
 const trace=loadArrayTrace(),arrayProjection=projectTrace(trace),arrayScene=arrayProjection.project(12),id=arrayScene.order.objects.find(id=>arrayScene.entities[id].kind==='array')!,cell=`${id}:element:1`
 const arrayPlan=planPresentation({scene:arrayScene,layout:arrayProjection.layout,detailLevel:'CLOSE',selection:{kind:'slot',id:cell},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(inspectorTargetPoints(arrayScene,arrayPlan,{kind:'slot',id:cell})).toEqual(anchorCorners(arrayPlan.cellWindows.get(id)!.mapping.get(cell)!.anchor))
})
it('uses actual presented curves and leaves absent or unsupported targets unplaced',()=>{
 const curve=plan.curves[0];expect(curve).toBeDefined()
 expect(inspectorTargetPoints(scene,plan,{kind:'reference',id:curve.id})).toBe(curve.points)
 for(const selection of [{kind:'object' as const,id:'future'},{kind:'slot' as const,id:'retired'},{kind:'flow' as const,id:'recorded-without-ports'}])expect(inspectorSideForTarget(scene,plan,selection,pose,viewport)).toBeNull()
})
