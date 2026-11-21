import { Color, MeshNormalMaterial, ShaderMaterial, type Camera, type Material, type Mesh, type Object3D, type Scene, type Texture, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { applyRoundedBoxMaterial, unitRoundedBox } from '../geometry/roundedBox'

/** Preserve the rounded envelope and omit depthless ink from the normal/depth pass. */
class RuntimeGTAO extends GTAOPass {
  declare normalRenderTarget: WebGLRenderTarget
  private rounded = applyRoundedBoxMaterial(new MeshNormalMaterial())
  private savedClear = new Color()

  get targets() { return [this.normalRenderTarget, this.gtaoRenderTarget, this.pdRenderTarget] }

  setSize(width: number, height: number): void {
    super.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)))
  }

  _renderOverride(renderer: WebGLRenderer, normal: MeshNormalMaterial, target: WebGLRenderTarget): void {
    const replaced: Array<[Mesh, Material | Material[]]> = []
    const hidden: Object3D[] = []
    const originalTarget = renderer.getRenderTarget(), originalBackground = this.scene.background
    const originalOverride = this.scene.overrideMaterial, alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.savedClear)
    try {
      this.scene.background = null
      this.scene.overrideMaterial = null
      this.scene.traverseVisible(object => {
        const mesh = object as Mesh
        const material = mesh.material
        const ink = object.userData.runtimeAtmosphere || object.userData.runtimeText ||
          object.userData.runtimeBloomRole === 'emitter' || object.userData.runtimeFloorOverlay
        if (ink || (mesh.isMesh && (Array.isArray(material) ? material : [material]).every(item => !item.visible || !item.depthWrite))) {
          hidden.push(object)
          object.visible = false
        } else if (mesh.isMesh) {
          replaced.push([mesh, material])
          mesh.material = mesh.geometry === unitRoundedBox ? this.rounded : normal
        }
      })
      renderer.setClearColor(0x7777ff, 1)
      renderer.setRenderTarget(target)
      renderer.clear()
      renderer.render(this.scene, this.camera)
    } finally {
      for (const [mesh, material] of replaced) mesh.material = material
      for (const object of hidden) object.visible = true
      this.scene.background = originalBackground
      this.scene.overrideMaterial = originalOverride
      renderer.setClearColor(this.savedClear, alpha)
      renderer.setRenderTarget(originalTarget)
    }
  }

  restoreInkVisibility() {
    // The installed GTAO normal pass temporarily hides line/point geometry.
    // Its normal-path restoration is skipped when its scene draw throws.
    Reflect.get(GTAOPass.prototype, '_restoreVisibility').call(this)
  }

  dispose(): void {
    this.rounded.dispose()
    // Three 0.186 leaves the calculation and blend programs to the caller.
    this.gtaoMaterial.dispose()
    this.blendMaterial.dispose()
    super.dispose()
  }
}

/** One half-res normal/depth draw and two half-res AO draws. Reuse the
 * full-resolution protection texture's G channel to keep text crisp. */
export class CinematicOcclusionPass extends Pass {
  private ao: RuntimeGTAO
  private savedClear = new Color()
  private framebufferChecked = false
  private material = new ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { base: { value: null }, occlusion: { value: null }, depth: { value: null }, protectedPixels: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D base, occlusion, depth, protectedPixels;
      void main() {
        vec4 image = texture2D(base, vUv);
        float ao = texture2D(occlusion, vUv).r;
        float sharp = step(.001, texture2D(protectedPixels, vUv).g);
        float surface = 1. - step(1., texture2D(depth, vUv).r);
        float shade = min(.20, max(0., 1. - ao - .04) * .48);
        gl_FragColor = vec4(image.rgb * (1. - shade * surface * (1. - sharp)), image.a);
      }
    `,
  })
  private quad = new FullScreenQuad(this.material)

  constructor(scene: Scene, camera: Camera, protectionTexture: Texture) {
    super()
    this.needsSwap = true
    this.ao = new RuntimeGTAO(scene, camera, 1, 1)
    this.ao.output = GTAOPass.OUTPUT.Off
    this.ao.updateGtaoMaterial({ radius: .52, thickness: .36, distanceExponent: 1.4, screenSpaceRadius: false })
    this.ao.updatePdMaterial({ radius: 4, depthPhi: .8, normalPhi: 6 })
    this.material.uniforms.occlusion.value = this.ao.gtaoMap
    this.material.uniforms.depth.value = this.ao.depthTexture
    this.material.uniforms.protectedPixels.value = protectionTexture
  }

  get targetCount() { return this.ao.targets.length }

  setSize(width: number, height: number): void {
    const previousWidth = this.ao.width, previousHeight = this.ao.height
    this.ao.setSize(width, height)
    if (previousWidth !== this.ao.width || previousHeight !== this.ao.height) this.framebufferChecked = false
  }

  render(renderer: WebGLRenderer, write: WebGLRenderTarget, read: WebGLRenderTarget): void {
    const target = renderer.getRenderTarget(), shadow = renderer.shadowMap.autoUpdate
    const alpha = renderer.getClearAlpha(), autoClear = renderer.autoClear
    const onShaderError = renderer.debug.onShaderError
    renderer.getClearColor(this.savedClear)

    // Three reports link failures via a callback, even when render() returns.
    let shaderFailure: string | null = null
    renderer.debug.onShaderError = (gl, program) => {
      shaderFailure ??= gl.getProgramInfoLog(program) || 'Cinematic shader linking failed'
    }
    try {
      renderer.shadowMap.autoUpdate = false
      renderer.autoClear = false
      if (!this.framebufferChecked) {
        const gl = renderer.getContext()
        for (const buffer of this.ao.targets) {
          renderer.setRenderTarget(buffer)
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('Cinematic occlusion framebuffer is incomplete')
          }
        }
        this.framebufferChecked = true
      }
      this.ao.render(renderer, write, read, 0, false)
      if (shaderFailure !== null) throw new Error(shaderFailure)
      this.material.uniforms.base.value = read.texture
      renderer.setRenderTarget(this.renderToScreen ? null : write)
      this.quad.render(renderer)
      if (shaderFailure !== null) throw new Error(shaderFailure)
    } catch (error) {
      this.ao.restoreInkVisibility()
      throw error
    } finally {
      renderer.debug.onShaderError = onShaderError
      renderer.setClearColor(this.savedClear, alpha)
      renderer.autoClear = autoClear
      renderer.shadowMap.autoUpdate = shadow
      renderer.setRenderTarget(target)
    }
  }

  dispose(): void {
    this.ao.dispose()
    this.material.dispose()
    this.quad.dispose()
  }
}

export function createCinematicPass(scene: Scene, camera: Camera, protectionTexture: Texture): CinematicOcclusionPass {
  return new CinematicOcclusionPass(scene, camera, protectionTexture)
}
