import {expect,it} from 'vitest'
import {Texture} from 'three'
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js'
import {preserveUnlitOutput} from './unlitOutput'

it('protects unlit linear colour between the installed tone mapper and output transfer',()=>{
 const output=new OutputPass(),mask=new Texture(),original=output.material.fragmentShader
 preserveUnlitOutput(output,mask)
 expect(output.uniforms.runtimeUnlitMask.value).toBe(mask)
 expect(output.material.uniforms).toBe(output.uniforms)
 const shader=output.material.fragmentShader
 expect(shader.indexOf('vec3 runtimeLinearColour')).toBeLessThan(shader.indexOf('// tone mapping'))
 expect(shader.indexOf('mix(gl_FragColor.rgb, runtimeLinearColour')).toBeGreaterThan(shader.indexOf('ACESFilmicToneMapping( gl_FragColor.rgb )'))
 expect(shader.indexOf('mix(gl_FragColor.rgb, runtimeLinearColour')).toBeLessThan(shader.indexOf('sRGBTransferOETF'))
 expect(shader).toContain('texture2D(runtimeUnlitMask, vUv).b')
 // Preserve all installed mappings and output defines instead of reimplementing
 // Three's colour management or applying sRGB twice.
 expect(shader.replace('uniform sampler2D runtimeUnlitMask;','').replace('vec3 runtimeLinearColour = gl_FragColor.rgb;','').replace('gl_FragColor.rgb = mix(gl_FragColor.rgb, runtimeLinearColour, clamp(texture2D(runtimeUnlitMask, vUv).b, 0.0, 1.0));','').replace(/\s/g,'')).toBe(original.replace(/\s/g,''))
 output.dispose();mask.dispose()
})
it('fails explicitly when installed output shader anchors no longer match',()=>{
 const output=new OutputPass(),mask=new Texture();output.material.fragmentShader='void main(){}'
 expect(()=>preserveUnlitOutput(output,mask)).toThrow('Unsupported Three OutputPass shader')
 expect(output.uniforms.runtimeUnlitMask).toBeUndefined()
 output.dispose();mask.dispose()
})
