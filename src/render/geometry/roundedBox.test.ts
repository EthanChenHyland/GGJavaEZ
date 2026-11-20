import { expect, it } from 'vitest'
import { MeshStandardMaterial, ShaderLib, Vector3 } from 'three'
import fc from 'fast-check'
import { applyRoundedBoxMaterial, expandRoundedBoxVertex, physicalBoxBevel, roundedBoxBevel, unitRoundedBox } from './roundedBox'

it('keeps a physical 0.10-unit bevel under independent instance dimensions and stays inside canonical bounds', () => {
  const vertices=unitRoundedBox.getAttribute('position'),normals=unitRoundedBox.getAttribute('normal')
  fc.assert(fc.property(fc.tuple(fc.double({min:.12,max:100,noNaN:true}),fc.double({min:.12,max:100,noNaN:true}),fc.double({min:.12,max:100,noNaN:true})),size=>{
    const radius=physicalBoxBevel(size),expanded=new Vector3()
    expect(radius).toBe(Math.min(.1,Math.min(...size)*.4))
    for(let i=0;i<vertices.count;i++){
      const position=new Vector3().fromBufferAttribute(vertices,i),normal=new Vector3().fromBufferAttribute(normals,i)
      expandRoundedBoxVertex(position,normal,size,expanded)
      for(let axis=0;axis<3;axis++)expect(Math.abs(expanded.getComponent(axis))).toBeLessThanOrEqual(size[axis]/2+1e-5)
      // Radius is measured from the unrounded core in actual world units.
      const core=position.clone().addScaledVector(normal,-roundedBoxBevel).divideScalar(.5-roundedBoxBevel)
      for(let axis=0;axis<3;axis++)core.setComponent(axis,core.getComponent(axis)*(size[axis]/2-radius))
      expect(expanded.distanceTo(core)).toBeCloseTo(radius,5)
    }
  }),{numRuns:100})
})
it('composes the rounded position/normal patch with the original acrylic shader',()=>{
  const material=new MeshStandardMaterial();material.onBeforeCompile=shader=>{shader.fragmentShader+='\n// acrylic'}
  applyRoundedBoxMaterial(material)
  const shader={...ShaderLib.standard,uniforms:{}}
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],{} as Parameters<typeof material.onBeforeCompile>[1])
  expect(shader.vertexShader).toContain('objectNormal *= runtimeRoundedSize()')
  expect(shader.vertexShader).toContain('runtimeRoundedPosition(position, normal, runtimeRoundedSize())')
  expect(shader.fragmentShader).toContain('// acrylic')
  material.dispose()
})
