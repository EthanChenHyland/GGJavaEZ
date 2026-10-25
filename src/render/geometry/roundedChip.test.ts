import {expect,it} from 'vitest'
import fc from 'fast-check'
import {MeshBasicMaterial,Vector3} from 'three'
import {applyRoundedChipMaterial,chipVertex,physicalChipRadius,roundedChipVertexShader,unitRoundedChip} from './roundedChip'
import {createMaskMaterial} from '../post/maskMaterials'
it('keeps a real rounded XY outline independent of thin depth and a conservative canonical pick/cull envelope',()=>{
 expect(physicalChipRadius([2,.5,.012])).toBeCloseTo(.08,12)
 const positions=unitRoundedChip.getAttribute('position'),core=unitRoundedChip.getAttribute('runtimeChipCore'),corner=unitRoundedChip.getAttribute('runtimeChipCorner')
 expect(positions.count).toBe(240);expect(core.count).toBe(positions.count);expect(corner.count).toBe(positions.count)
 expect(unitRoundedChip.boundingSphere!.radius).toBe(Math.sqrt(3)/2)
 expect([...positions.array].every(Number.isFinite)).toBe(true)
 fc.assert(fc.property(fc.tuple(fc.double({min:.05,max:30,noNaN:true}),fc.double({min:.05,max:30,noNaN:true}),fc.double({min:.001,max:.1,noNaN:true})),size=>{
  const low=new Vector3(Infinity,Infinity,Infinity),high=new Vector3(-Infinity,-Infinity,-Infinity)
  for(let i=0;i<positions.count;i++){
   const p=chipVertex([core.getX(i),core.getY(i)],[corner.getX(i),corner.getY(i)],positions.getZ(i),size)
   for(let axis=0;axis<3;axis++){expect(Math.abs(p[axis])).toBeLessThanOrEqual(size[axis]/2+1e-8);low.setComponent(axis,Math.min(low.getComponent(axis),p[axis]));high.setComponent(axis,Math.max(high.getComponent(axis),p[axis]))}
  }
  for(let axis=0;axis<3;axis++){expect(low.getComponent(axis)).toBeCloseTo(-size[axis]/2,6);expect(high.getComponent(axis)).toBeCloseTo(size[axis]/2,6)}
 }),{numRuns:100})
})
it('preserves the same instanced physical outline in protected masks without changing face color, opacity or depth policy',()=>{
 const original=applyRoundedChipMaterial(new MeshBasicMaterial({color:'#081538',opacity:.45,transparent:true,depthWrite:false,toneMapped:false})),mask=createMaskMaterial(original,1)
 const source='#include <common>\nvoid main(){\n#include <begin_vertex>\n}',fragment='void main(){gl_FragColor=vec4(1.);}'
 const shader={vertexShader:source,fragmentShader:fragment,uniforms:{}}
 mask.onBeforeCompile(shader as Parameters<typeof mask.onBeforeCompile>[0],{} as Parameters<typeof mask.onBeforeCompile>[1])
 expect(shader.vertexShader).toBe(roundedChipVertexShader(source));expect(shader.vertexShader).toContain('runtimeChipCore');expect(shader.fragmentShader).toContain('gl_FragColor.a <= 0.0001')
 expect(original.color.getHexString()).toBe('081538');expect(original.opacity).toBe(.45);expect(original.depthWrite).toBe(false);expect(original.toneMapped).toBe(false)
 mask.dispose();original.dispose()
})
