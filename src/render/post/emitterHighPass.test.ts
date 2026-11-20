import {expect,it} from 'vitest'
import {LuminosityHighPassShader} from 'three/addons/shaders/LuminosityHighPassShader.js'
import {emitterHighPass} from './emitterHighPass'
it('uses peak HDR radiance for explicitly masked emitters without changing the 1.0 threshold or their colour',()=>{
 const shader=emitterHighPass(LuminosityHighPassShader.fragmentShader)
 expect(shader).toContain('float v = max(texel.r, max(texel.g, texel.b))')
 expect(shader).toContain('smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v )')
 expect(shader).toContain('mix( outputColor, texel, alpha )')
})
