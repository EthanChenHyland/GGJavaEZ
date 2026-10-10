import { Color, HalfFloatType, ShaderMaterial, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { BloomMaskMaterials } from './maskMaterials'
import {emitterHighPass} from './emitterHighPass'

export class SelectiveBloomPass extends Pass {
  private emitters = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
  private protection = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
  private masks = new BloomMaskMaterials()
  readonly bloom = new UnrealBloomPass(new Vector2(1, 1), .55, .35, 1)
  private material = new ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { base: { value: null }, glow: { value: null }, protectedPixels: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D base,glow,protectedPixels;
void main(){vec4 image=texture2D(base,vUv); float excluded=clamp(texture2D(protectedPixels,vUv).r,0.,1.);
gl_FragColor=vec4(image.rgb+texture2D(glow,vUv).rgb*(1.-excluded),image.a);}` })
  private quad = new FullScreenQuad(this.material)
  constructor(private scene: Scene, private camera: Camera) {
    super(); this.needsSwap = true
    this.bloom.materialHighPassFilter.fragmentShader=emitterHighPass(this.bloom.materialHighPassFilter.fragmentShader)
  }
  setSize(width: number, height: number): void {
    this.emitters.setSize(width, height); this.protection.setSize(width, height)
    // UnrealBloomPass internally allocates its first mip at half resolution.
    this.bloom.setSize(width, height)
  }
  render(renderer: WebGLRenderer, write: WebGLRenderTarget, read: WebGLRenderTarget): void {
    const target = renderer.getRenderTarget(), background = this.scene.background
    const clear = renderer.getClearColor(new Color()), alpha = renderer.getClearAlpha(), autoClear = renderer.autoClear
    try {
      this.scene.background = null
      renderer.setClearColor(0, 1); renderer.autoClear = true
      this.masks.render(renderer, this.scene, 'emitters', () => {
        renderer.setRenderTarget(this.emitters); renderer.clear(); renderer.render(this.scene, this.camera)
      })
      this.masks.render(renderer, this.scene, 'protection', () => {
        renderer.setRenderTarget(this.protection); renderer.clear(); renderer.render(this.scene, this.camera)
      })
      this.bloom.render(renderer, write, this.emitters, 0, false)
      this.material.uniforms.base.value = read.texture
      this.material.uniforms.glow.value = this.bloom.renderTargetsHorizontal[0].texture
      this.material.uniforms.protectedPixels.value = this.protection.texture
      renderer.setRenderTarget(this.renderToScreen ? null : write)
      this.quad.render(renderer)
    } finally {
      this.scene.background = background
      renderer.setClearColor(clear, alpha); renderer.autoClear = autoClear; renderer.setRenderTarget(target)
    }
  }
  dispose(): void {
    this.emitters.dispose(); this.protection.dispose(); this.masks.dispose()
    this.bloom.dispose(); this.material.dispose(); this.quad.dispose()
  }
}
