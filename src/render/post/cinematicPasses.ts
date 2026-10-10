import { Color, HalfFloatType, MeshNormalMaterial, ShaderMaterial, WebGLRenderTarget, type Camera, type Material, type Mesh, type Scene, type WebGLRenderer } from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { applyRoundedBoxMaterial, unitRoundedBox } from '../geometry/roundedBox'
import { BloomMaskMaterials } from './maskMaterials'

/** The stock normal override drops custom vertex transforms and glyph discard.
 * This override honors rounded bodies, and excludes text from the AO geometry. */
class RuntimeGTAO extends GTAOPass {
  private rounded = applyRoundedBoxMaterial(new MeshNormalMaterial())
  setSize(width: number, height: number): void { super.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2))) }
  _renderOverride(renderer: WebGLRenderer, normal: MeshNormalMaterial, target: WebGLRenderTarget): void {
    const replaced: Array<[Mesh, Material | Material[], boolean]> = []
    const originalTarget = renderer.getRenderTarget(), originalBackground = this.scene.background
    const originalOverride = this.scene.overrideMaterial, clear = renderer.getClearColor(new Color()), alpha = renderer.getClearAlpha()
    try {
      this.scene.background = null; this.scene.overrideMaterial = null
      this.scene.traverse(object => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        replaced.push([mesh, mesh.material, mesh.visible])
        if (mesh.userData.runtimeText || mesh.userData.runtimeBloomRole === 'emitter' || mesh.userData.runtimeFloorOverlay) mesh.visible = false
        else mesh.material = mesh.geometry === unitRoundedBox ? this.rounded : normal
      })
      renderer.setClearColor(0x7777ff, 1); renderer.setRenderTarget(target); renderer.clear(); renderer.render(this.scene, this.camera)
    } finally {
      for (const [mesh, material, visible] of replaced) { mesh.material = material; mesh.visible = visible }
      this.scene.background = originalBackground; this.scene.overrideMaterial = originalOverride
      renderer.setClearColor(clear, alpha); renderer.setRenderTarget(originalTarget)
    }
  }
  dispose(): void { this.rounded.dispose(); super.dispose() }
}

/** Ambient occlusion is composited around an actual sharp text mask. DOF stays
 * disabled until a separate tilted-face capture can prove its readability. */
export class CinematicOcclusionPass extends Pass {
  private ao: RuntimeGTAO
  private text = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
  private masks = new BloomMaskMaterials()
  private material = new ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { base: { value: null }, occlusion: { value: null }, sharpText: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D base,occlusion,sharpText;
void main(){vec4 image=texture2D(base,vUv); float ao=texture2D(occlusion,vUv).r; float sharp=clamp(texture2D(sharpText,vUv).r,0.,1.);
gl_FragColor=vec4(image.rgb*mix(mix(1.,ao,.8),1.,sharp),image.a);}` })
  private quad = new FullScreenQuad(this.material)
  constructor(private scene: Scene, private camera: Camera) {
    super(); this.needsSwap = true
    this.ao = new RuntimeGTAO(scene, camera, 1, 1); this.ao.output = GTAOPass.OUTPUT.Off
    this.ao.updateGtaoMaterial({ radius: .6, screenSpaceRadius: false })
    this.material.uniforms.occlusion.value = this.ao.gtaoMap
  }
  setSize(width: number, height: number): void { this.ao.setSize(width, height); this.text.setSize(width, height) }
  render(renderer: WebGLRenderer, write: WebGLRenderTarget, read: WebGLRenderTarget): void {
    const target = renderer.getRenderTarget(), background = this.scene.background
    const clear = renderer.getClearColor(new Color()), alpha = renderer.getClearAlpha(), shadow = renderer.shadowMap.autoUpdate
    try {
      renderer.shadowMap.autoUpdate = false
      this.ao.render(renderer, write, read, 0, false)
      this.scene.background = null; renderer.setClearColor(0, 1)
      this.masks.render(renderer, this.scene, 'text', () => { renderer.setRenderTarget(this.text); renderer.clear(); renderer.render(this.scene, this.camera) })
      this.material.uniforms.base.value = read.texture; this.material.uniforms.sharpText.value = this.text.texture
      renderer.setRenderTarget(this.renderToScreen ? null : write); this.quad.render(renderer)
    } finally {
      this.scene.background = background; renderer.setClearColor(clear, alpha); renderer.shadowMap.autoUpdate = shadow; renderer.setRenderTarget(target)
    }
  }
  dispose(): void { this.ao.dispose(); this.text.dispose(); this.masks.dispose(); this.material.dispose(); this.quad.dispose() }
}
export function createCinematicPass(scene: Scene, camera: Camera): CinematicOcclusionPass { return new CinematicOcclusionPass(scene, camera) }
