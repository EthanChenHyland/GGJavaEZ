import {expect,it} from 'vitest'
import fc from 'fast-check'
import {BoxGeometry,Group,InstancedMesh,Matrix4,MeshBasicMaterial,PerspectiveCamera} from 'three'
import {projectBodies,projectInstancedBody,projectRect} from './worldProjection'
it('measures actual rendered face and body corners in CSS pixels without moving the camera (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100}),fc.integer({min:650,max:1117}),fc.double({min:.1,max:5,noNaN:true}),(distance,height,size)=>{
  const camera=new PerspectiveCamera(36,16/9,.05,1000);camera.position.z=distance+5;camera.updateMatrixWorld()
  const viewport={width:height*16/9,height},position=camera.position.clone(),rotation=camera.quaternion.clone()
  const result=projectBodies([{anchor:{entityId:'actual-frame',region:'stack',position:[0,0,0],size:[size,size,1],ports:{},bodyPort:[0,0,.5]},live:true}],camera,viewport)
  const face=result.entities[0].face!
  expect(face.height).toBeCloseTo(size*height/(2*Math.tan(Math.PI/10)*(camera.position.z-.5)),8)
  expect(face.x+face.width/2).toBeCloseTo(viewport.width/2,8);expect(result.liveStack).toEqual(result.stack)
  expect(result.heap).toBeNull();expect(result.entities[0].bounds!.height).toBeGreaterThanOrEqual(face.height)
  expect(camera.position.toArray()).toEqual(position.toArray());expect(camera.quaternion.toArray()).toEqual(rotation.toArray())
 }),{numRuns:100})
})
it('does not report an entity behind the camera as visible geometry',()=>{
 const camera=new PerspectiveCamera(36,1,.05,1000);camera.updateMatrixWorld()
 expect(projectRect([[0,0,4],[1,1,4]],camera,{width:900,height:900})).toBeNull()
})
it('observes a rendered instance and its parent rather than substituting planned dimensions',()=>{
 const geometry=new BoxGeometry(),material=new MeshBasicMaterial(),mesh=new InstancedMesh(geometry,material,1),parent=new Group()
 parent.position.set(3,-2,0);parent.add(mesh)
 const camera=new PerspectiveCamera(36,1,.05,1000);camera.position.z=20;camera.updateMatrixWorld()
 const viewport={width:900,height:900},unit=projectInstancedBody(mesh,0,camera,viewport)!
 mesh.setMatrixAt(0,new Matrix4().makeScale(5.2,6.75,.9))
 const actual=projectInstancedBody(mesh,0,camera,viewport)!
 expect(actual.height).toBeGreaterThan(unit.height*6)
 const focal=viewport.height/(2*Math.tan(Math.PI/10))
 expect(actual.width).toBeCloseTo(focal*(5.6/(20-.45)-.4/(20+.45)),4)
 expect(actual.x+actual.width/2).toBeGreaterThan(viewport.width/2)
 expect(actual.y+actual.height/2).toBeGreaterThan(viewport.height/2)
 expect(projectInstancedBody(mesh,1,camera,viewport)).toBeNull()
 mesh.dispose();geometry.dispose();material.dispose()
})
it('keeps structural heap proxies observable without counting them as semantic Heap_Object bounds',()=>{
 const camera=new PerspectiveCamera(36,1,.05,1000);camera.position.z=20;camera.updateMatrixWorld()
 const anchor={entityId:'object',region:'heap' as const,position:[3,0,0] as const,size:[5.2,4,2.3] as const,ports:{},bodyPort:[3,0,1.15] as const},viewport={width:900,height:900}
 const actual=projectBodies([{anchor,live:false}],camera,viewport)
 const withProxy=projectBodies([{anchor,live:false},{anchor:{...anchor,entityId:'proxy',position:[100,8,0]},live:false,structural:true}],camera,viewport)
 expect(withProxy.entities).toHaveLength(2);expect(withProxy.entities[1]).toMatchObject({id:'proxy',structural:true})
 expect(withProxy.heap).toEqual(actual.heap)
 expect(withProxy.entities[1].bounds!.x).toBeGreaterThan(viewport.width)
})
it('includes a represented live-depth proxy in the live tower union',()=>{
 const camera=new PerspectiveCamera(36,1,.05,1000);camera.position.z=20;camera.updateMatrixWorld()
 const anchor={entityId:'live depth',region:'stack' as const,position:[-3,0,0] as const,size:[2.4,1.2,.8] as const,ports:{},bodyPort:[-3,0,.4] as const}
 const actual=projectBodies([{anchor,live:true,structural:true}],camera,{width:900,height:900})
 expect(actual.entities[0]).toMatchObject({id:'live depth',live:true,structural:true})
 expect(actual.liveStack).toEqual(actual.entities[0].bounds)
})
