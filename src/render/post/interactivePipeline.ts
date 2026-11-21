import { HalfFloatType, UnsignedByteType, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { SelectiveBloomPass } from './SelectiveBloomPass'
import { preserveUnlitOutput } from './unlitOutput'
import type { createCinematicPass } from './cinematicPasses'

export function interactivePipeline(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const hdr = renderer.extensions.has('EXT_color_buffer_float')
  const type = hdr ? HalfFloatType : UnsignedByteType
  const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type }))
  const base = new RenderPass(scene, camera), bloom = new SelectiveBloomPass(scene, camera, hdr)
  const fog = new ShaderPass({ uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse;
void main(){vec4 image=texture2D(tDiffuse,vUv); float corner=pow(abs(vUv.x-.5)*2.,4.)*pow(1.-vUv.y,5.);
gl_FragColor=vec4(mix(image.rgb,vec3(.002,.006,.018),corner*.18),image.a);}` })
  const smaa = new SMAAPass(), output = new OutputPass()
  smaa.enabled = false
  let cinematic: ReturnType<typeof createCinematicPass> | null = null
  let disposed = false
  let pixelRatio = renderer.getPixelRatio()
  // These are the installed SMAAPass's two colour buffers. In byte mode
  // its edge/weight values are in [0,1], and require no HDR attachment.
  const localSmaa = smaa as unknown as {
    _edgesRT: WebGLRenderTarget; _weightsRT: WebGLRenderTarget
    _areaTexture: { image: HTMLImageElement }; _searchTexture: { image: HTMLImageElement }
  }
  if (!hdr) {
    localSmaa._edgesRT.texture.type = type
    localSmaa._weightsRT.texture.type = type
  }
  try {
    preserveUnlitOutput(output, bloom.protectionTexture)
    // SMAA consumes linear colour. OutputPass owns the final output transfer.
    for (const pass of [base, bloom, fog, smaa, output]) composer.addPass(pass)
  } catch (error) {
    for (const pass of [base, bloom, fog, smaa, output]) pass.dispose()
    composer.dispose()
    throw error
  }
  const ready = Promise.all([localSmaa._areaTexture, localSmaa._searchTexture].map(texture =>
    Promise.resolve().then(() => texture.image.decode()),
  )).then(() => { if (!disposed) smaa.enabled = true })

  function removeCinematic() {
    if (!cinematic) return
    composer.removePass(cinematic)
    cinematic.dispose()
    cinematic = null
  }

  return {
    ready, hdr,
    resize(width: number, height: number, ratio: number) {
      if (pixelRatio !== ratio) {
        pixelRatio = ratio
        composer.setPixelRatio(ratio)
      }
      composer.setSize(Math.max(1, width), Math.max(1, height))
    },
    get renderTargets() {
      // Composer ping-pong, two SMAA attachments, and the effects' own targets.
      return disposed ? 0 : 2 + 2 + bloom.targetCount + (cinematic?.targetCount ?? 0)
    },
    get hasCinematic() { return cinematic !== null },
    addCinematic(create: typeof createCinematicPass) {
      if (!hdr) throw new Error('Half-float colour attachments are unavailable')
      if (cinematic) return
      cinematic = create(scene, camera, bloom.protectionTexture)
      cinematic.enabled = false
      try {
        composer.insertPass(cinematic, composer.passes.indexOf(bloom) + 1)
      } catch (error) {
        removeCinematic()
        throw error
      }
    },
    removeCinematic,
    render(delta: number, cinematicActive: boolean) {
      if (cinematic) cinematic.enabled = cinematicActive
      bloom.strength = cinematicActive ? .42 : .34
      const target = renderer.getRenderTarget(), autoClear = renderer.autoClear
      try {
        try {
          composer.render(delta)
          return null
        } catch (error) {
          if (!cinematic || !cinematicActive || renderer.getContext().isContextLost()) throw error
          removeCinematic()
          bloom.strength = .34
          renderer.autoClear = autoClear
          renderer.setRenderTarget(target)
          composer.render(delta)
          return `Cinematic effects could not render: ${error instanceof Error ? error.message : String(error)}`
        }
      } finally {
        renderer.autoClear = autoClear
        if (renderer.getRenderTarget() !== target) renderer.setRenderTarget(target)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const pass of composer.passes) pass.dispose()
      composer.dispose()
      cinematic = null
    },
  }
}
