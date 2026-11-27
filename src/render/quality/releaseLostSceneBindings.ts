import { BufferGeometry, InstancedMesh, Material, Texture, type Scene, type WebGLRenderer } from 'three'

/** Release old renderer listeners while its context still owns them. The
 * mounted scene keeps its CPU data and the restored context uploads it again. */
export function releaseLostSceneBindings(scene: Scene, renderer: Pick<WebGLRenderer, 'properties'>): void {
  const geometries = new Set<BufferGeometry>()
  const textures = new Set<Texture>()
  const materials = new Set<Material>()
  const addTexture = (value: unknown) => { if (value instanceof Texture) textures.add(value) }
  addTexture(scene.background)
  addTexture(scene.environment)
  scene.traverse(object => {
    if (object instanceof InstancedMesh) object.dispose()
    if ('geometry' in object && object.geometry instanceof BufferGeometry) geometries.add(object.geometry)
    if ('material' in object) {
      const assigned = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of assigned) if (material instanceof Material) materials.add(material)
    }
  })
  for (const material of materials) {
    for (const value of Object.values(material)) addTexture(value)
    if (!renderer.properties.has(material)) continue
    // The renderer supplies additional sampler textures such as its shared
    // DFG lookup table through the compiled uniforms.
    const compiled = renderer.properties.get(material) as { uniforms?: Record<string, { value: unknown }> }
    for (const uniform of Object.values(compiled.uniforms ?? {})) addTexture(uniform.value)
  }
  for (const geometry of geometries) geometry.dispose()
  for (const texture of textures) texture.dispose()
}
