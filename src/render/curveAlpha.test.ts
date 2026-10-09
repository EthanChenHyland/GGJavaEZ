import {expect,it} from 'vitest'
import {LineMaterial} from 'three/addons/lines/LineMaterial.js'
import {curveAlphaShaders} from './curveAlpha'
it('the installed LineMaterial supports per-curve alpha after antialiasing, without tinting text/faces',()=>{
 const material=new LineMaterial(),shader=curveAlphaShaders(material.vertexShader,material.fragmentShader)
 expect(shader.vertexShader).toContain('attribute float instanceCurveOpacity;')
 expect(shader.fragmentShader).toContain('alpha * vCurveOpacity')
 expect(shader.fragmentShader).toContain('#include <clipping_planes_fragment>')
 expect(shader.fragmentShader).toContain('#include <logdepthbuf_fragment>')
 material.dispose()
})
