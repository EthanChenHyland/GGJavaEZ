import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js'
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js'
import { Camera, Mesh, MeshDepthMaterial, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UniformsUtils, WebGLRenderTarget } from 'three'
import type { Group, Object3D, WebGLRenderer } from 'three'
import {applyRoundedBoxMaterial} from './geometry/roundedBox'
import { floorCaptureState } from './floorReflection'
import type { FloorModel } from './floorModel'

/** Managed version of the zwei-pass drei ContactShadows technique.
 * Only actual shadow-casting runtime solids enter the depth map. Structural floor,
 * grid, labels, references and the contact receiver cannot shadow themselves.
 */
export function createFloorContact(gl: WebGLRenderer, model: Pick<FloorModel, 'position' | 'extent'>, worldHeight: number) {
  const target = new WebGLRenderTarget(512, 512), intermediate = new WebGLRenderTarget(512, 512, { depthBuffer: false })
  target.texture.generateMipmaps = intermediate.texture.generateMipmaps = false
  const camera = new OrthographicCamera(-model.extent / 2, model.extent / 2, model.extent / 2, -model.extent / 2, 0, Math.max(12, worldHeight + 1))
  camera.position.set(model.position[0], model.position[1] + .001, model.position[2])
  camera.up.set(0, 0, 1); camera.lookAt(model.position[0], model.position[1] + 1, model.position[2]); camera.updateMatrixWorld()
  const depth = new MeshDepthMaterial({ depthTest: true, depthWrite: true })
  depth.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'vec4( vec3(0.0), (1.0 - fragCoordZ) * opacity );')
  }
  depth.customProgramCacheKey = () => 'runtime-contact-depth-v1'
  applyRoundedBoxMaterial(depth)
  const horizontal = new ShaderMaterial({ uniforms: UniformsUtils.clone(HorizontalBlurShader.uniforms),
    vertexShader: HorizontalBlurShader.vertexShader, fragmentShader: HorizontalBlurShader.fragmentShader, depthTest: false, depthWrite: false })
  const vertical = new ShaderMaterial({ uniforms: UniformsUtils.clone(VerticalBlurShader.uniforms),
    vertexShader: VerticalBlurShader.vertexShader, fragmentShader: VerticalBlurShader.fragmentShader, depthTest: false, depthWrite: false })
  horizontal.uniforms.h.value = 2 / 512; vertical.uniforms.v.value = 2 / 512
  const quadGeometry = new PlaneGeometry(2, 2), quad = new Mesh(quadGeometry, horizontal), quadScene = new Scene(), quadCamera = new Camera()
  quad.frustumCulled = false; quadScene.add(quad)
  return {
    target,
    render(scene: Scene, floorGroup: Group) {
      const restoreRenderer = floorCaptureState(gl)
      const background = scene.background, override = scene.overrideMaterial, floorVisible = floorGroup.visible
      const hidden: [Object3D, boolean][] = []
      try {
        floorGroup.visible = false
        scene.traverse(object => {
          const renderable = object as Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean }
          if ((renderable.isMesh || renderable.isLine || renderable.isPoints || renderable.isSprite) && !object.castShadow) {
            hidden.push([object, object.visible]); object.visible = false
          }
        })
        scene.background = null; scene.overrideMaterial = depth
        gl.xr.enabled = false; gl.shadowMap.autoUpdate = false
        gl.setRenderTarget(target); gl.setScissorTest(false); gl.setClearColor(0, 0)
        gl.state.buffers.depth.setMask(true); gl.clear(); gl.render(scene, camera)
        horizontal.uniforms.tDiffuse.value = target.texture
        quad.material = horizontal; gl.setRenderTarget(intermediate); gl.clear(); gl.render(quadScene, quadCamera)
        vertical.uniforms.tDiffuse.value = intermediate.texture
        quad.material = vertical; gl.setRenderTarget(target); gl.clear(); gl.render(quadScene, quadCamera)
      } finally {
        hidden.forEach(([object, visibility]) => { object.visible = visibility })
        floorGroup.visible = floorVisible; scene.background = background; scene.overrideMaterial = override
        restoreRenderer()
      }
    },
    dispose() {
      target.dispose(); intermediate.dispose(); depth.dispose(); horizontal.dispose(); vertical.dispose(); quadGeometry.dispose(); quadScene.clear()
    },
  }
}
