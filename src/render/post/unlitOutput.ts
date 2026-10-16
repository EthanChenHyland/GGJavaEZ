import type {Texture} from 'three'
import type {OutputPass} from 'three/addons/postprocessing/OutputPass.js'

/** Composer output tone mapping otherwise overrides protected unlit materials'
 * toneMapped=false. Reuse the depth-tested protection pass's B coverage, keeping
 * ACES on lit surfaces and the installed output colour-space conversion last. */
export function preserveUnlitOutput(output:OutputPass,mask:Texture):void {
 const shader=output.material.fragmentShader
 const uniform='uniform sampler2D tDiffuse;',tone='// tone mapping',space='// color space'
 if(![uniform,tone,space].every(marker=>shader.includes(marker)))throw new Error('Unsupported Three OutputPass shader: unlit colour protection unavailable')
 output.uniforms.runtimeUnlitMask={value:mask}
 output.material.fragmentShader=shader.replace(uniform,`${uniform}\nuniform sampler2D runtimeUnlitMask;`)
  .replace(tone,`vec3 runtimeLinearColour = gl_FragColor.rgb;\n${tone}`)
  .replace(space,`gl_FragColor.rgb = mix(gl_FragColor.rgb, runtimeLinearColour, clamp(texture2D(runtimeUnlitMask, vUv).b, 0.0, 1.0));\n${space}`)
 output.material.needsUpdate=true
}
