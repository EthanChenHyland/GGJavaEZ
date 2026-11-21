import { Color, LinearFilter, Matrix4, MeshPhysicalMaterial, PerspectiveCamera, Plane, Vector3, Vector4, WebGLRenderTarget } from 'three'
import type { Camera, Material, Mesh, Object3D, Scene, WebGLRenderer } from 'three'
import { floorStyle } from './floorModel'

/** Same oblique clipping construction as drei, with an explicit facing-away result. */
export function updateReflectionCamera(mesh: Mesh, camera: Camera, reflection: PerspectiveCamera, textureMatrix: Matrix4): boolean {
  mesh.updateWorldMatrix(true, false)
  camera.updateWorldMatrix(true, false)
  const origin = new Vector3().setFromMatrixPosition(mesh.matrixWorld)
  const cameraPosition = new Vector3().setFromMatrixPosition(camera.matrixWorld)
  const rotation = new Matrix4().extractRotation(mesh.matrixWorld)
  const normal = new Vector3(0, 0, 1).applyMatrix4(rotation)
  const view = new Vector3().subVectors(origin, cameraPosition)
  if (view.dot(normal) > -.001) return false
  reflection.position.copy(view.reflect(normal).negate().add(origin))
  rotation.extractRotation(camera.matrixWorld)
  const lookAt = new Vector3(0, 0, -1).applyMatrix4(rotation).add(cameraPosition)
  const target = new Vector3().subVectors(origin, lookAt).reflect(normal).negate().add(origin)
  reflection.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal)
  reflection.lookAt(target)
  reflection.far = 'far' in camera && typeof camera.far === 'number' ? camera.far : 10000
  reflection.updateMatrixWorld()
  reflection.projectionMatrix.copy(camera.projectionMatrix)
  textureMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
    .multiply(reflection.projectionMatrix).multiply(reflection.matrixWorldInverse).multiply(mesh.matrixWorld)
  const plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin).applyMatrix4(reflection.matrixWorldInverse)
  const clip = new Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
  const projection = reflection.projectionMatrix.elements
  const q = new Vector4((Math.sign(clip.x) + projection[8]) / projection[0],
    (Math.sign(clip.y) + projection[9]) / projection[5], -1, (1 + projection[10]) / projection[14])
  const denominator = clip.dot(q)
  if (Math.abs(denominator) < 1e-6 || !Number.isFinite(denominator)) return false
  clip.multiplyScalar(2 / denominator)
  projection[2] = clip.x; projection[6] = clip.y; projection[10] = clip.z + 1; projection[14] = clip.w
  reflection.projectionMatrixInverse.copy(reflection.projectionMatrix).invert()
  return true
}

type CaptureObject = Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean }

/** Use layers so an unmarked parent mesh cannot hide its opted-in child. */
function reflectionMask(scene: Scene, camera: Camera) {
  const hidden: [Object3D, number][] = []
  const meshes: Mesh[] = []
  scene.traverseVisible((object: CaptureObject) => {
    if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite)) return
    const tags = object.userData
    const reflect = object.isMesh && tags.runtimeReflector === true
      && !tags.runtimeText && !tags.runtimeFloorOverlay && !tags.runtimeAtmosphere
    if (reflect && camera.layers.test(object.layers)) meshes.push(object as Mesh)
    if (!reflect && object.layers.mask !== 0) {
      hidden.push([object, object.layers.mask])
      object.layers.mask = 0
    }
  })
  return {
    meshes,
    restore() {
      for (const [object, mask] of hidden) object.layers.mask = mask
    },
  }
}

function reflectionMaterial(original: Material, floorY: { value: number }) {
  const material = original.clone()
  // The main-view acrylic can transmit. The soft floor image needs only its
  // lighting and shape, so no second camera-owned transmission FBO is created.
  if (material instanceof MeshPhysicalMaterial) material.transmission = 0
  material.onBeforeCompile = function (shader, renderer) {
    original.onBeforeCompile.call(this, shader, renderer)
    shader.uniforms.runtimeReflectingFloorY = floorY
    shader.vertexShader = 'varying float runtimeReflectionY;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 runtimeReflectionPoint = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        runtimeReflectionPoint = instanceMatrix * runtimeReflectionPoint;
      #endif
      runtimeReflectionY = (modelMatrix * runtimeReflectionPoint).y;
    `)
    shader.fragmentShader = 'uniform float runtimeReflectingFloorY; varying float runtimeReflectionY;\n'
      + shader.fragmentShader.replace('#include <opaque_fragment>', `
        float reflectionHeight = runtimeReflectionY - runtimeReflectingFloorY;
        outgoingLight *= 1.0 - smoothstep(0.45, 3.5, reflectionHeight);
        #include <opaque_fragment>
      `)
  }
  material.customProgramCacheKey = () => original.customProgramCacheKey() + '|runtime-reflection-height'
  return material
}

export function createFloorReflection(gl: WebGLRenderer) {
  const resolution = floorStyle.reflectionResolution
  const target = new WebGLRenderTarget(resolution, resolution, { minFilter: LinearFilter, magFilter: LinearFilter })
  target.texture.generateMipmaps = false
  target.texture.name = 'runtime-floor-reflection'
  const textureMatrix = new Matrix4()
  const camera = new PerspectiveCamera()
  const strength = { value: 0 }
  const floorY = { value: 0 }
  const materials = new Map<Material, Material>()
  const stats = { captures: 0, meshes: 0, materials: 0, resolution, failed: false }
  let rendering = false, disposed = false

  function retireMaterials(used: ReadonlySet<Material>) {
    for (const [original, variant] of materials) {
      if (used.has(original)) continue
      variant.dispose()
      materials.delete(original)
    }
    stats.materials = materials.size
  }

  return {
    target, textureMatrix, strength, stats,
    render(scene: Scene, worldCamera: Camera, floor: Mesh) {
      if (rendering || disposed) return false
      strength.value = 0
      stats.meshes = 0
      if (stats.failed || scene.overrideMaterial !== null || !updateReflectionCamera(floor, worldCamera, camera, textureMatrix)) return false
      camera.layers.mask = worldCamera.layers.mask
      const background = scene.background, restoreRenderer = floorCaptureState(gl)
      const mask = reflectionMask(scene, camera)
      stats.meshes = mask.meshes.length
      const originals: [Mesh, Material | Material[]][] = []
      const used = new Set<Material>()
      const substitute = (original: Material) => {
        used.add(original)
        let material = materials.get(original)
        if (!material) {
          material = reflectionMaterial(original, floorY)
          materials.set(original, material)
        }
        return material
      }
      rendering = true
      try {
        if (!mask.meshes.length) return false
        floorY.value = floor.matrixWorld.elements[13]
        for (const mesh of mask.meshes) {
          const original = mesh.material
          originals.push([mesh, original])
          mesh.material = Array.isArray(original) ? original.map(substitute) : substitute(original)
        }
        scene.background = null
        gl.xr.enabled = false
        gl.shadowMap.autoUpdate = false
        gl.shadowMap.needsUpdate = false
        gl.autoClear = false
        gl.setRenderTarget(target)
        gl.setClearColor(0, 0)
        gl.clear(true, true, false)
        gl.render(scene, camera)
        strength.value = floorStyle.reflectionStrength
        stats.captures++
        return true
      } catch {
        // Keep the same procedural floor and contacts after a failed capture.
        // A fresh quality selection or graphics restoration recreates the pass.
        stats.failed = true
        return false
      } finally {
        scene.background = background
        for (const [mesh, original] of originals) mesh.material = original
        mask.restore()
        rendering = false
        restoreRenderer()
        retireMaterials(stats.failed ? new Set() : used)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      strength.value = 0
      retireMaterials(new Set())
      target.dispose()
    },
  }
}

/** Restore the bound target (including a cube face/mipmap), clear and pass
 * options. Target-local viewport and scissor come back with the target. */
function floorCaptureState(gl: WebGLRenderer) {
  const target = gl.getRenderTarget(), face = gl.getActiveCubeFace(), mip = gl.getActiveMipmapLevel()
  const clearColor = gl.getClearColor(new Color()), clearAlpha = gl.getClearAlpha()
  const xr = gl.xr.enabled, shadow = gl.shadowMap.autoUpdate, shadowUpdate = gl.shadowMap.needsUpdate
  const autoClear = gl.autoClear
  return () => {
    gl.setRenderTarget(target, face, mip)
    gl.setClearColor(clearColor, clearAlpha)
    gl.xr.enabled = xr
    gl.shadowMap.autoUpdate = shadow
    gl.shadowMap.needsUpdate = shadowUpdate
    gl.autoClear = autoClear
  }
}
