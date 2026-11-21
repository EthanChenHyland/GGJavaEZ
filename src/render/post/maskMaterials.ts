import { CustomBlending, Material, MaxEquation, MeshBasicMaterial, type Object3D, type WebGLRenderer } from 'three'

export type BloomRole = 'emitter' | 'protected'
type Renderable = Object3D & { material: Material | Material[] }
type Derived = Material & { isDerivedMaterial?: boolean; isTroikaTextMaterial?: boolean }

/** Preserve the original vertex program, instancing and Troika SDF discard path.
 * Replacing those with a generic black material would mask the wrong pixels. */
export function createMaskMaterial(original: Material, ink: 0 | 1, coverage: 'surface' | 'text' | 'emitter' = 'surface'): Material {
  const identity = new MeshBasicMaterial()
  const mask = Object.create(original) as Derived
  Object.defineProperty(mask, 'id', { value: Reflect.get(identity, 'id') })
  Object.defineProperty(mask, 'uuid', { value: identity.uuid })
  Object.defineProperties(mask, {
    _listeners: { value: undefined, writable: true },
    _depthMaterial: { value: null, writable: true },
    _distanceMaterial: { value: null, writable: true },
  })
  mask.name = `runtime-mask:${ink}:${original.name}`
  mask.toneMapped = false
  // SDF edge alpha must not replace the opaque unlit face already in B.
  // MAX retains the face's unlit coverage through overlapping glyph ink.
  if (ink && (original as Derived).isTroikaTextMaterial && !original.toneMapped) {
    mask.blending = CustomBlending
    mask.blendEquation = MaxEquation
  }
  if ('transmission' in mask) Object.defineProperty(mask, 'transmission', { value: 0 })
  // Do not inherit the source material's cache identity or disposal ownership.
  mask.customProgramCacheKey = () => `${original.customProgramCacheKey()}|runtime-mask-${ink}-unlit-${!original.toneMapped}-${coverage}-v3`
  const patch: Material['onBeforeCompile'] = shader => {
    const end = shader.fragmentShader.lastIndexOf('}')
    shader.fragmentShader = shader.fragmentShader.slice(0, end) +
      // R excludes glow, G protects glyphs from AO, and B preserves unlit
      // colour through OutputPass. An antialiased emitter only removes its
      // own coverage so a quiet overlay cannot punch a hole in a protected face.
      `\nif (gl_FragColor.a <= 0.0001) discard;\ngl_FragColor = vec4(${ink.toFixed(1)}, ${coverage === 'text' ? '1.0' : '0.0'}, ${ink && !original.toneMapped ? 'clamp(gl_FragColor.a, 0.0, 1.0)' : '0.0'}, ${coverage === 'emitter' && original.transparent ? 'clamp(gl_FragColor.a, 0.0, 1.0)' : '1.0'});\n` + shader.fragmentShader.slice(end)
  }
  if (mask.isDerivedMaterial) {
    // DerivedMaterial's setter appends this hook after its own upgrades. Calling
    // the source hook again here would recursively invoke that same pipeline.
    mask.onBeforeCompile = patch
  } else {
    mask.onBeforeCompile = function(shader, renderer) {
      original.onBeforeCompile.call(this, shader, renderer)
      patch.call(this, shader, renderer)
    }
  }
  mask.dispose = () => Material.prototype.dispose.call(mask)
  return mask
}

/** Scene-owned materials are temporarily substituted, always restored in finally. */
export class BloomMaskMaterials {
  private cache = new Map<Material, Map<string, Material>>()
  render(renderer: WebGLRenderer, scene: Object3D, mode: 'emitters' | 'protection', draw: () => void): void {
    const changed: Array<[Renderable, Material | Material[]]> = []
    const hidden: Array<[Object3D,boolean]> = []
    const used = new Set<Material>()
    const substitute = (original: Material, ink: 0 | 1, coverage: 'surface' | 'text' | 'emitter') => {
      used.add(original)
      let variants = this.cache.get(original)
      if (!variants) {
        variants = new Map()
        this.cache.set(original, variants)
      }
      const key = `${ink}:${coverage}`
      let mask = variants.get(key)
      if (!mask) {
        mask = createMaskMaterial(original, ink, coverage)
        variants.set(key, mask)
      }
      return mask
    }
    // Shadows are already prepared by the base pass. Mask materials must not
    // regenerate or replace its shadow map or Physical transmission subpass.
    const previousShadow = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    try {
      scene.traverse(object => {
        // Soft atmosphere is neither emissive ink nor a hard protection plane.
        if(object.userData.runtimeAtmosphere){hidden.push([object,object.visible]);object.visible=false;return}
        if (!('material' in object)) return
        const renderable = object as Renderable, original = renderable.material
        if (!original) return
        const role = object.userData.runtimeBloomRole as BloomRole | undefined
        const text = object.userData.runtimeText === true
        const emitter = role === 'emitter' && !text
        if (mode === 'emitters' && emitter) {
          for (const material of Array.isArray(original) ? original : [original]) used.add(material)
          return
        }
        changed.push([renderable, original])
        const ink = mode === 'protection' && !emitter ? 1 : 0
        const coverage = mode === 'emitters' ? 'surface' : text ? 'text' : emitter ? 'emitter' : 'surface'
        const mask = (material: Material) => substitute(material, ink, coverage)
        renderable.material = Array.isArray(original) ? original.map(mask) : mask(original)
      })
      draw()
    } finally {
      for (const [object, original] of changed) object.material = original
      for(const[object,visible]of hidden)object.visible=visible
      renderer.shadowMap.autoUpdate = previousShadow
      for (const [original, variants] of this.cache) if (!used.has(original)) {
        for (const material of variants.values()) material.dispose()
        this.cache.delete(original)
      }
    }
  }
  dispose(): void {
    for (const variants of this.cache.values()) for (const material of variants.values()) material.dispose()
    this.cache.clear()
  }
}
