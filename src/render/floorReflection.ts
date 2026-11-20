import { MeshReflectorMaterial } from '@react-three/drei/materials/MeshReflectorMaterial'
import { BlurPass } from '@react-three/drei/materials/BlurPass'
import { Color, HalfFloatType, LinearFilter, Matrix4, PerspectiveCamera, Plane, Vector3, Vector4, WebGLRenderTarget } from 'three'
import type { Camera, Group, Mesh, WebGLProgramParametersWithUniforms, WebGLRenderer, Scene } from 'three'
import type { FloorModel } from './floorModel'
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
  if (view.dot(normal) > 0) return false
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
  clip.multiplyScalar(2 / clip.dot(q))
  projection[2] = clip.x; projection[6] = clip.y; projection[10] = clip.z + 1; projection[14] = clip.w
  reflection.projectionMatrixInverse.copy(reflection.projectionMatrix).invert()
  return true
}

/** Own the actual drei material/blur implementation, rather than its wrapper's unexposed FBOs. */
export function createFloorReflection(gl: WebGLRenderer, model: Pick<FloorModel, 'resolution' | 'blur' | 'mirror' | 'opacity'>) {
  const target = new WebGLRenderTarget(model.resolution, model.resolution, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter })
  target.texture.generateMipmaps = false
  const blurred = model.blur[0] + model.blur[1] > 0
    ? new WebGLRenderTarget(model.resolution, model.resolution, { type: HalfFloatType, depthBuffer: false, stencilBuffer: false }) : null
  const blur = blurred ? new BlurPass({ gl, resolution: model.resolution, width: model.blur[0], height: model.blur[1], depthScale: 0 }) : null
  const textureMatrix = new Matrix4(), camera = new PerspectiveCamera()
  const material = new MeshReflectorMaterial({ color: floorStyle.surface, metalness: .5, roughness: .32,
    transparent: model.opacity < 1, opacity: model.opacity })
  material.name = 'runtime-floor-reflector'
  material.userData.runtimeBloomRole = 'protected'
  material.tDiffuse = target.texture
  material.tDiffuseBlur = blurred?.texture ?? target.texture
  material.textureMatrix = textureMatrix
  material.mirror = model.mirror
  material.mixBlur = blurred ? .8 : 0
  material.hasBlur = !!blurred
  // The old .7..1.2 perspective-depth threshold reduced reflections to 0.0001.
  // No reflection clipping/fading is inferred from those unrelated depth values.
  material.depthScale = 0
  material.defines = { USE_UV: '', ...(blurred ? { USE_BLUR: '' } : {}) }
  const reflectorCompile = material.onBeforeCompile
  material.onBeforeCompile = function (shader: WebGLProgramParametersWithUniforms) {
    reflectorCompile.call(this, shader)
    shader.uniforms.runtimeReflectionStep = { value: .75 / model.resolution }
    // Keep the dark floor albedo. Blend the planar reflection into linear
    // lighting so the floor tint cannot erase the reflected hues.
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform float runtimeReflectionStep;')
      .replace('vec4 base = texture2DProj(tDiffuse, new_vUv);', `
        vec4 base = texture2DProj(tDiffuse, new_vUv);
        #ifndef USE_BLUR
          vec2 reflectedUv = new_vUv.xy / new_vUv.w;
          vec2 stepX = vec2(runtimeReflectionStep, 0.0);
          vec2 stepY = vec2(0.0, runtimeReflectionStep);
          base = 0.5 * base + 0.125 * (
            texture2D(tDiffuse, reflectedUv + stepX) + texture2D(tDiffuse, reflectedUv - stepX)
            + texture2D(tDiffuse, reflectedUv + stepY) + texture2D(tDiffuse, reflectedUv - stepY)
          );
        #endif
      `)
      .replace('diffuseColor.rgb = diffuseColor.rgb * ((1.0 - min(1.0, mirror)) + newMerge.rgb * mixStrength);', `
        diffuseColor.rgb *= 1.0 - min(1.0, mirror);
        vec3 runtimePlanarLight = max(newMerge.rgb, vec3(0.0)) * (mirror * 0.48);
        float runtimePlanarPeak = max(max(runtimePlanarLight.r, runtimePlanarLight.g), runtimePlanarLight.b);
        runtimePlanarLight *= 0.08 / max(0.08, runtimePlanarPeak);
      `)
      .replace('#include <opaque_fragment>', 'outgoingLight += runtimePlanarLight;\n#include <opaque_fragment>')
  }
  material.customProgramCacheKey = () => 'runtime-floor-planar-light-v2'
  return {
    material, target, blurred, camera, textureMatrix,
    render(scene: Scene, worldCamera: Camera, floor: Mesh, floorGroup: Group) {
      if (!updateReflectionCamera(floor, worldCamera, camera, textureMatrix)) return false
      const visibility = floorGroup.visible, previousTarget = gl.getRenderTarget()
      const xr = gl.xr.enabled, shadow = gl.shadowMap.autoUpdate
      const viewport = gl.getViewport(new Vector4()), scissor = gl.getScissor(new Vector4()), scissorTest = gl.getScissorTest()
      try {
        floorGroup.visible = false
        gl.xr.enabled = false; gl.shadowMap.autoUpdate = false
        gl.setRenderTarget(target); gl.setScissorTest(false)
        gl.state.buffers.depth.setMask(true)
        gl.clear(); gl.render(scene, camera)
        if (blur && blurred) blur.render(gl, target, blurred)
      } finally {
        floorGroup.visible = visibility
        gl.xr.enabled = xr; gl.shadowMap.autoUpdate = shadow
        gl.setRenderTarget(previousTarget); gl.setViewport(viewport); gl.setScissor(scissor); gl.setScissorTest(scissorTest)
      }
      return true
    },
    dispose() {
      material.dispose(); target.dispose(); blurred?.dispose()
      if (blur) {
        blur.renderTargetA.dispose(); blur.renderTargetB.dispose()
        blur.convolutionMaterial.dispose(); blur.screen.geometry.dispose(); blur.scene.clear()
      }
    },
  }
}

/** Restore every capture state, including the clear alpha used by contact maps. */
export function floorCaptureState(gl: WebGLRenderer) {
  const target = gl.getRenderTarget(), viewport = gl.getViewport(new Vector4()), scissor = gl.getScissor(new Vector4())
  const scissorTest = gl.getScissorTest(), clearColor = gl.getClearColor(new Color()), clearAlpha = gl.getClearAlpha()
  const xr = gl.xr.enabled, shadow = gl.shadowMap.autoUpdate
  return () => {
    gl.xr.enabled = xr; gl.shadowMap.autoUpdate = shadow
    gl.setRenderTarget(target); gl.setViewport(viewport); gl.setScissor(scissor); gl.setScissorTest(scissorTest)
    gl.setClearColor(clearColor, clearAlpha)
  }
}
