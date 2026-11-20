import {expect,it} from 'vitest'
import {PerspectiveCamera,OrthographicCamera,Vector3} from 'three'
import type {SceneExceptionPath,WorldAnchor} from '../contracts/world'
import {buildExceptionPanelModel,layoutExceptionPanel} from './exceptionPanelModel'
import {exceptionPanelMinimumPixels,projectExceptionPanel} from './exceptionPanelPresentation'
import {projectedFontPixels} from './text/textSystem'
import {projectionCamera,fitToSafeFrame,screenPoint} from '../camera/projection'
import {anchorCorners} from '../world/anchorGeometry'
import {fitForensicFraming} from '../camera/forensicFraming'
const observed={kind:'observed' as const,introducedSeq:0,changedSeq:0,eventIds:['throw']}
const content:SceneExceptionPath={exceptionId:'failure',className:'java.lang.IllegalStateException',simpleName:'IllegalStateException',message:'failed shipment',throwFrameId:'throwing',unwound:['throwing'],catchFrameId:null,uncaught:true,causes:[],complete:true,throwLine:null,stack:[],stackEvidence:observed,causeEvidence:observed,evidence:observed}
const layout=layoutExceptionPanel(buildExceptionPanelModel(content,'FULL'))
const anchor:WorldAnchor={entityId:'structural:exception-panel',region:'stack',position:[-5,-3,1],size:layout.size,ports:{},bodyPort:[-5,-3,1]}
function minimum(presented:ReturnType<typeof projectExceptionPanel>,camera:PerspectiveCamera,height:number){
 const {scale,anchor}=presented
 return Math.min(...layout.lines.map(line=>projectedFontPixels(line.size*scale,new Vector3(anchor.position[0]+line.position[0]*scale,anchor.position[1]+line.position[1]*scale,anchor.position[2]+line.position[2]),camera,height)))
}
it('keeps every captured line above the culling floor while preserving adjacency, depth and inputs',()=>{
 const before=JSON.stringify({anchor,layout})
 for(const height of [650,800,900,1117])for(const yawDeg of [4,8,12])for(const pitchDeg of [-10,-13,-16]){
  const view={width:1440,height},safe={x:0,y:0,width:1440,height},camera=projectionCamera({target:[0,-3,0],distance:45,yawDeg,pitchDeg},view)
  expect(minimum({anchor,scale:1},camera,height)).toBeLessThan(11)
  const presented=projectExceptionPanel(anchor,layout,camera,view,safe)
  expect(presented.scale).toBeGreaterThan(1)
  expect(minimum(presented,camera,height)).toBeCloseTo(exceptionPanelMinimumPixels,9)
  expect(presented.anchor.position[0]+presented.anchor.size[0]/2).toBeCloseTo(anchor.position[0]+anchor.size[0]/2,12)
  expect(presented.anchor.position[1]-presented.anchor.size[1]/2).toBeCloseTo(anchor.position[1]-anchor.size[1]/2,12);expect(presented.anchor.size[2]).toBe(anchor.size[2])
 }
 expect(JSON.stringify({anchor,layout})).toBe(before)
})
it('does not enlarge an already readable panel, an unsupported camera or a panel that cannot fit',()=>{
 const view={width:1440,height:900},safe={x:0,y:0,...view}
 const near=projectionCamera({target:anchor.position,distance:8,yawDeg:8,pitchDeg:-13},view)
 expect(projectExceptionPanel(anchor,layout,near,view,safe)).toEqual({anchor,scale:1})
 expect(projectExceptionPanel(anchor,layout,new OrthographicCamera(),view,safe)).toEqual({anchor,scale:1})
 const far=projectionCamera({target:anchor.position,distance:45,yawDeg:8,pitchDeg:-13},view)
 expect(projectExceptionPanel(anchor,layout,far,view,{x:0,y:0,width:10,height:10})).toEqual({anchor,scale:1})
})
it('fits the enlarged structural evidence and fixed runtime points together across the desktop targets',()=>{
 const recording={state:'FULL' as const,reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}
 const panel={position:anchor.position,content},points:readonly [number,number,number][]=[[0,0,0],[0,-8,1],[24,-5,0],[24,-8,2]]
 for(const viewport of [{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650}]){
  const safe={x:viewport.width<1024?40:viewport.width*.27,y:viewport.height*.1,width:viewport.width*(viewport.width<1024?.95:.7),height:viewport.height*.72}
  const angles={yaw:8,pitch:-13},initial=fitToSafeFrame(points,angles,safe,viewport)
  const fitted=fitForensicFraming(points,panel,recording,initial,safe,viewport,pts=>fitToSafeFrame(pts,angles,safe,viewport))
  const camera=projectionCamera(fitted.pose,viewport)
  // The helper's base is the recorded content's own deterministic panel size.
  const actualAnchor={...anchor,size:layout.size},presented=projectExceptionPanel(actualAnchor,layout,camera,viewport,safe)
  expect(minimum(presented,camera,viewport.height)).toBeGreaterThan(11)
  for(const point of [...points,...anchorCorners(presented.anchor)]){
   const p=screenPoint(point,camera,viewport)
   expect(p.x).toBeGreaterThanOrEqual(safe.x-1e-5);expect(p.y).toBeGreaterThanOrEqual(safe.y-1e-5)
   expect(p.x).toBeLessThanOrEqual(safe.x+safe.width+1e-5);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height+1e-5)
  }
 }
})
