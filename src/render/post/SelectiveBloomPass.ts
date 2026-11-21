import { Color, HalfFloatType, NearestFilter, ShaderMaterial, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { BloomMaskMaterials } from './maskMaterials'
import { emitterHighPass } from './emitterHighPass'

const fullscreenVertex = 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}'
const fullscreen = { depthTest: false, depthWrite: false, toneMapped: false, vertexShader: fullscreenVertex }

function createGlowResources() {
  const emitters = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
  const horizontal = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })
  const glow = horizontal.clone()
  const extract = new ShaderMaterial({
    ...fullscreen, uniforms: { emitters: { value: emitters.texture } }, fragmentShader: emitterHighPass,
  })
  const soften = new ShaderMaterial({
    ...fullscreen,
    uniforms: { horizontal: { value: horizontal.texture }, offset: { value: 0 } },
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D horizontal;
      uniform float offset;
      void main() {
        vec2 tap = vec2(0., offset);
        vec3 halo = texture2D(horizontal, vUv).rgb * .5
          + (texture2D(horizontal, vUv - tap).rgb + texture2D(horizontal, vUv + tap).rgb) * .25;
        gl_FragColor = vec4(halo, 1.);
      }
    `,
  })
  return { emitters, horizontal, glow, extract, soften }
}

/** Depth-tested emitter and protection masks at display resolution. Only the
 * compact halo is blurred. The scene colour and glyphs bypass both blur draws. */
export class SelectiveBloomPass extends Pass {
  private protection = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private masks = new BloomMaskMaterials()
  private glow: ReturnType<typeof createGlowResources> | null
  private savedClear = new Color()
  strength = .34

  get protectionTexture() { return this.protection.texture }
  get targetCount() { return this.glow ? 4 : 1 }

  private material = new ShaderMaterial({
    ...fullscreen,
    uniforms: { base: { value: null }, glow: { value: null }, protectedPixels: { value: null }, strength: { value: 0 } },
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D base, glow, protectedPixels;
      uniform float strength;
      void main() {
        vec4 image = texture2D(base, vUv);
        #ifdef RUNTIME_HDR_BLOOM
          vec2 mask = texture2D(protectedPixels, vUv).rg;
          vec3 halo = texture2D(glow, vUv).rgb;
          float peak = max(halo.r, max(halo.g, halo.b));
          float visible = (1. - mask.r) * (1. - step(.001, mask.g));
          image.rgb += halo * (strength * visible / (1. + peak));
        #endif
        gl_FragColor = image;
      }
    `,
  })
  private quad = new FullScreenQuad(this.material)

  constructor(private scene: Scene, private camera: Camera, hdr = true) {
    super()
    this.needsSwap = hdr
    this.glow = hdr ? createGlowResources() : null
    if (this.glow) {
      this.material.defines.RUNTIME_HDR_BLOOM = 1
      this.material.uniforms.glow.value = this.glow.glow.texture
      this.material.uniforms.protectedPixels.value = this.protection.texture
    }
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height))
    this.protection.setSize(w, h)
    if (!this.glow) return
    this.glow.emitters.setSize(w, h)
    this.glow.horizontal.setSize(Math.ceil(w / 2), Math.ceil(h / 2))
    this.glow.glow.setSize(this.glow.horizontal.width, this.glow.horizontal.height)
    this.glow.soften.uniforms.offset.value = 1.25 / this.glow.glow.height
  }

  render(renderer: WebGLRenderer, write: WebGLRenderTarget, read: WebGLRenderTarget): void {
    const target = renderer.getRenderTarget(), background = this.scene.background
    const alpha = renderer.getClearAlpha(), autoClear = renderer.autoClear
    renderer.getClearColor(this.savedClear)
    try {
      this.scene.background = null
      renderer.setClearColor(0, 1)
      renderer.autoClear = true
      this.masks.render(renderer, this.scene, 'protection', () => {
        renderer.setRenderTarget(this.protection)
        renderer.render(this.scene, this.camera)
      })
      const glow = this.glow
      if (!glow) return
      this.masks.render(renderer, this.scene, 'emitters', () => {
        renderer.setRenderTarget(glow.emitters)
        renderer.render(this.scene, this.camera)
      })
      this.quad.material = glow.extract
      renderer.setRenderTarget(glow.horizontal)
      this.quad.render(renderer)
      this.quad.material = glow.soften
      renderer.setRenderTarget(glow.glow)
      this.quad.render(renderer)
      this.quad.material = this.material
      this.material.uniforms.base.value = read.texture
      this.material.uniforms.strength.value = this.strength
      renderer.setRenderTarget(this.renderToScreen ? null : write)
      this.quad.render(renderer)
    } finally {
      this.scene.background = background
      renderer.setClearColor(this.savedClear, alpha)
      renderer.autoClear = autoClear
      renderer.setRenderTarget(target)
    }
  }

  dispose(): void {
    this.protection.dispose()
    this.masks.dispose()
    if (this.glow) {
      const { emitters, horizontal, glow, extract, soften } = this.glow
      emitters.dispose()
      horizontal.dispose()
      glow.dispose()
      extract.dispose()
      soften.dispose()
    }
    this.material.dispose()
    this.quad.dispose()
  }
}
