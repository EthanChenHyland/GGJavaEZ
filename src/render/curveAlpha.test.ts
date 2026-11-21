import {expect,it} from 'vitest'
import {LineMaterial} from 'three/addons/lines/LineMaterial.js'
import {curveAlphaShaders} from './curveAlpha'
import {connectorMaterial} from './RuntimeMaterials'
it('the installed LineMaterial supports per-curve alpha after antialiasing, without tinting text/faces',()=>{
 const material=new LineMaterial(),shader=curveAlphaShaders(material.vertexShader,material.fragmentShader)
 expect(shader.vertexShader).toContain('attribute float instanceCurveOpacity;')
 expect(shader.fragmentShader).toContain('alpha * vCurveOpacity')
 expect(shader.fragmentShader).toContain('#include <clipping_planes_fragment>')
 expect(shader.fragmentShader).toContain('#include <logdepthbuf_fragment>')
 material.dispose()
})
it('connector bands keep their specified emphasis and independent disposal ownership',()=>{
 const core=connectorMaterial(false,2.5),selected=connectorMaterial(false,3.5),halo=connectorMaterial(true,2.5)
 expect(core).toMatchObject({linewidth:2.5,opacity:1,transparent:true,depthTest:true,depthWrite:false,toneMapped:false})
 expect(selected.linewidth).toBe(3.5);expect(halo).toMatchObject({linewidth:8,opacity:.065})
 expect(core.vertexShader).toContain('instanceCurveOpacity');expect(core.fragmentShader).toContain('alpha * vCurveOpacity')
 expect(core).not.toBe(selected);expect(core).not.toBe(halo)
 core.dispose();selected.dispose();halo.dispose()
})
