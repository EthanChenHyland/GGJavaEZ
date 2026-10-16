import { Material, MeshBasicMaterial, type Object3D, type WebGLRenderer } from 'three'

export type BloomRole = 'emitter' | 'protected'
type Renderable = Object3D & { material: Material | Material[] }
type Derived = Material & { isDerivedMaterial?: boolean }

/** Preserve the original vertex program, instancing and Troika SDF discard path.
 * Replacing those with a generic black material would mask the wrong pixels. */
export function createMaskMaterial(original: Material, ink: 0 | 1): Material {
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
  if ('transmission' in mask) Object.defineProperty(mask, 'transmission', { value: 0 })
  // Do not inherit the source material's cache identity or disposal ownership.
  mask.customProgramCacheKey = () => `${original.customProgramCacheKey()}|runtime-mask-${ink}-unlit-${!original.toneMapped}-v2`
  const patch: Material['onBeforeCompile'] = shader => {
    const end = shader.fragmentShader.lastIndexOf('}')
    shader.fragmentShader = shader.fragmentShader.slice(0, end) +
      // R/G remain the hard bloom exclusion, even for dim/antialiased ink.
      // B carries visible unlit coverage for the final output transform. Lit
      // acrylic remains protected from bloom without bypassing tone mapping.
      `\nif (gl_FragColor.a <= 0.0001) discard;\ngl_FragColor = vec4(${ink.toFixed(1)}, ${ink.toFixed(1)}, ${ink && !original.toneMapped ? 'clamp(gl_FragColor.a, 0.0, 1.0)' : '0.0'}, 1.0);\n` + shader.fragmentShader.slice(end)
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
  private cache = new Map<Material, { black: Material; white: Material }>()
  render(renderer: WebGLRenderer, scene: Object3D, mode: 'emitters' | 'protection' | 'text', draw: () => void): void {
    const changed: Array<[Renderable, Material | Material[]]> = []
    const used = new Set<Material>()
    const substitute = (original: Material, white: boolean) => {
      used.add(original)
      let pair = this.cache.get(original)
      if (!pair) {
        pair = { black: createMaskMaterial(original, 0), white: createMaskMaterial(original, 1) }
        this.cache.set(original, pair)
      }
      return white ? pair.white : pair.black
    }
    // Shadows are already prepared by the base pass. Mask materials must not
    // regenerate or replace its shadow map or Physical transmission subpass.
    const previousShadow = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    try {
      scene.traverse(object => {
        if (!('material' in object)) return
        const renderable = object as Renderable, original = renderable.material
        if (!original) return
        const role = object.userData.runtimeBloomRole as BloomRole | undefined
        if (mode === 'emitters' && role === 'emitter') {
          for (const material of Array.isArray(original) ? original : [original]) used.add(material)
          return
        }
        changed.push([renderable, original])
        const white = mode === 'text' ? object.userData.runtimeText === true : mode === 'protection' && role !== 'emitter'
        renderable.material = Array.isArray(original) ? original.map(material => substitute(material, white)) : substitute(original, white)
      })
      draw()
    } finally {
      for (const [object, original] of changed) object.material = original
      renderer.shadowMap.autoUpdate = previousShadow
      for (const [original, pair] of this.cache) if (!used.has(original)) {
        pair.black.dispose(); pair.white.dispose(); this.cache.delete(original)
      }
    }
  }
  dispose(): void {
    for (const pair of this.cache.values()) { pair.black.dispose(); pair.white.dispose() }
    this.cache.clear()
  }
}
