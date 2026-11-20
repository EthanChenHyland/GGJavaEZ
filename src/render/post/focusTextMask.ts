import { Color, InstancedMesh, MeshBasicMaterial, Object3D, Scene, Vector2, WebGLRenderTarget, type Camera, type Material, type WebGLRenderer } from 'three'
import type { WorldAnchor } from '../../contracts/world'
import { applyRoundedBoxMaterial, unitRoundedBox } from '../geometry/roundedBox'

/** One renderer-owned silhouette, used only to keep faded foreground glyphs
 * off the actual Focus target. Geometry, glyphs and picking stay in place. */
export class FocusTextMask {
  readonly uniforms = {
    runtimeFocusTextMask: { value: null as WebGLRenderTarget['texture'] | null },
    runtimeFocusTextSize: { value: new Vector2(1, 1) },
    runtimeFocusTextEnabled: { value: 0 },
  }
  private target: WebGLRenderTarget | null = null
  private scene = new Scene()
  private material = applyRoundedBoxMaterial(new MeshBasicMaterial({ color: 'white', toneMapped: false }))
  private solid = new InstancedMesh(unitRoundedBox, this.material, 1)
  private transform = new Object3D()
  private clear = new Color()
  private maskCamera: Camera | null = null
  anchor: WorldAnchor | null = null

  constructor() { this.solid.frustumCulled = false; this.scene.add(this.solid) }

  /** Reflection and shadow cameras must never sample a main-view silhouette. */
  prepareText(camera: Camera): void {
    this.uniforms.runtimeFocusTextEnabled.value = this.anchor && camera === this.maskCamera ? 1 : 0
  }

  apply(material: Material): void {
    const previous = material.onBeforeCompile, cacheKey = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer)
      Object.assign(shader.uniforms, this.uniforms)
      const end = shader.fragmentShader.lastIndexOf('}')
      // Troika promotes this semantic opacity to a per-text varying in its
      // derived batch shader. Do not classify antialiased glyph-edge alpha.
      shader.fragmentShader = 'uniform sampler2D runtimeFocusTextMask;\nuniform vec2 runtimeFocusTextSize;\nuniform float runtimeFocusTextEnabled;\n' +
        shader.fragmentShader.slice(0, end) + '\nif (runtimeFocusTextEnabled > 0.5 && uTroikaFillOpacity <= 0.25 && texture2D(runtimeFocusTextMask, gl_FragCoord.xy / runtimeFocusTextSize).r > 0.5) discard;\n' + shader.fragmentShader.slice(end)
    }
    material.customProgramCacheKey = () => `${cacheKey}:runtime-focus-text-mask-v1`
  }

  render(renderer: WebGLRenderer, camera: Camera): void {
    this.maskCamera = null
    this.uniforms.runtimeFocusTextEnabled.value = 0
    if (!this.anchor) return
    const size = renderer.getDrawingBufferSize(this.uniforms.runtimeFocusTextSize.value)
    this.target ??= new WebGLRenderTarget(size.x, size.y)
    this.target.setSize(size.x, size.y)
    this.uniforms.runtimeFocusTextMask.value = this.target.texture
    this.transform.position.set(...this.anchor.position); this.transform.scale.set(...this.anchor.size); this.transform.updateMatrix()
    this.solid.setMatrixAt(0, this.transform.matrix); this.solid.instanceMatrix.needsUpdate = true
    const target = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), autoClear = renderer.autoClear
    const shadow = renderer.shadowMap.autoUpdate
    renderer.getClearColor(this.clear)
    try {
      renderer.shadowMap.autoUpdate = false; renderer.autoClear = true
      renderer.setRenderTarget(this.target); renderer.setClearColor(0, 1); renderer.clear(); renderer.render(this.scene, camera)
      this.maskCamera = camera; this.prepareText(camera)
    } finally {
      renderer.setClearColor(this.clear, alpha); renderer.autoClear = autoClear; renderer.shadowMap.autoUpdate = shadow; renderer.setRenderTarget(target)
    }
  }

  dispose(): void {
    this.maskCamera = null
    this.uniforms.runtimeFocusTextEnabled.value = 0; this.uniforms.runtimeFocusTextMask.value = null
    this.target?.dispose(); this.target = null; this.material.dispose(); this.solid.dispose()
  }
}
