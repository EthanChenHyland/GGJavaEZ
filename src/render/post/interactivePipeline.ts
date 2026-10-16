import { HalfFloatType, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { SelectiveBloomPass } from './SelectiveBloomPass'
import {preserveUnlitOutput} from './unlitOutput'
import type {Pass} from 'three/addons/postprocessing/Pass.js'

export function interactivePipeline(renderer: WebGLRenderer, scene: Scene, camera: Camera, createCinematic?: (scene:Scene,camera:Camera)=>Pass) {
  const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: HalfFloatType }))
  const base = new RenderPass(scene, camera), bloom = new SelectiveBloomPass(scene, camera)
  const fog = new ShaderPass({ uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse;
void main(){vec4 image=texture2D(tDiffuse,vUv); float corner=pow(abs(vUv.x-.5)*2.,4.)*pow(1.-vUv.y,5.);
gl_FragColor=vec4(mix(image.rgb,vec3(.002,.006,.018),corner*.18),image.a);}` })
  const smaa = new SMAAPass(), output = new OutputPass()
  preserveUnlitOutput(output,bloom.protectionTexture)
  const cinematic=createCinematic?.(scene,camera)??null
  // Three 0.186 SMAAPass explicitly consumes linear-sRGB. OutputPass therefore
  // comes last; applying SMAA to encoded output violates this installed API.
  for (const pass of [base, ...(cinematic?[cinematic]:[]), bloom, fog, smaa, output]) composer.addPass(pass)
  const localTextures = smaa as unknown as { _areaTexture: { image: HTMLImageElement }; _searchTexture: { image: HTMLImageElement } }
  const ready = Promise.all([localTextures._areaTexture.image.decode(), localTextures._searchTexture.image.decode()])
  return { composer, bloom, cinematic, ready,
    dispose() { for (const pass of composer.passes) pass.dispose(); composer.dispose() },
  }
}
