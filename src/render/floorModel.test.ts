import { expect, it } from 'vitest'
import { Mesh, Matrix4, PerspectiveCamera, PlaneGeometry } from 'three'
import { floorModel } from './floorModel'
import {updateReflectionCamera} from './floorReflection'

it('keeps the floor below all reserved bodies and scales its finite extent without moving their anchors',()=>{
 const bounds={center:[5,-10,7] as const,size:[40,20,80] as const}
 const interactive=floorModel({bounds},'INTERACTIVE',true),cinematic=floorModel({bounds},'CINEMATIC',true)
 expect(interactive).toMatchObject({position:[5,-20.5,7],extent:200,resolution:256,mirror:.35,blur:[0,0]})
 expect(cinematic).toMatchObject({position:interactive.position,extent:200,resolution:1024,mirror:.5,blur:[300,100]})
 expect(floorModel({bounds:null},'INTERACTIVE',false).opacity).toBe(.45)
})
it('reflects the actual camera above the floor and rejects a camera on its back side',()=>{
 const floor=new Mesh(new PlaneGeometry(80,80));floor.rotation.x=-Math.PI/2;floor.position.y=-6
 const camera=new PerspectiveCamera(36,16/9,.05,10000),reflection=new PerspectiveCamera(),matrix=new Matrix4()
 camera.position.set(4,8,20);camera.lookAt(0,-3,0)
 expect(updateReflectionCamera(floor,camera,reflection,matrix)).toBe(true)
 expect(reflection.position.y).toBeCloseTo(-20,8)
 expect(matrix.elements.every(Number.isFinite)).toBe(true)
 camera.position.y=-8;camera.updateMatrixWorld()
 expect(updateReflectionCamera(floor,camera,reflection,matrix)).toBe(false)
 floor.geometry.dispose()
})
