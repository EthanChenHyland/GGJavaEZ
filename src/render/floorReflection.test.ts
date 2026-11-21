import { expect, it, vi } from 'vitest'
import { Color, DirectionalLight, Line, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene, ShaderLib, WebGLRenderTarget } from 'three'
import type { Camera, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three'
import { floorStyle } from './floorModel'
import { createFloorReflection, updateReflectionCamera } from './floorReflection'

function world() {
  const floor = new Mesh(new PlaneGeometry(80, 80))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -6
  const camera = new PerspectiveCamera(36, 16 / 9, .05, 1000)
  camera.position.set(4, 8, 20)
  camera.lookAt(0, -3, 0)
  return { floor, camera }
}

function captureFixture() {
  const scene = new Scene()
  const { floor, camera } = world()
  const parent = new Mesh(), reflector = new Mesh(), glyph = new Mesh(), overlay = new Mesh(), line = new Line()
  const light = new DirectionalLight()
  reflector.userData.runtimeReflector = glyph.userData.runtimeReflector = overlay.userData.runtimeReflector = line.userData.runtimeReflector = true
  glyph.userData.runtimeText = true
  overlay.userData.runtimeFloorOverlay = true
  parent.add(reflector)
  parent.layers.enable(2)
  const hidden = new Mesh()
  hidden.visible = false
  hidden.userData.runtimeReflector = true
  scene.add(floor, parent, glyph, overlay, line, light, hidden)
  const background = new Color('#110033')
  scene.background = background
  const previous = new WebGLRenderTarget(10, 12)
  const previousColor = new Color('#220044')
  const renderer = {
    getRenderTarget: () => previous, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 1,
    getClearColor: (out: Color) => out.copy(previousColor), getClearAlpha: () => .4,
    setRenderTarget: vi.fn(), setClearColor: vi.fn(), clear: vi.fn(), render: vi.fn(),
    xr: { enabled: true }, shadowMap: { autoUpdate: true, needsUpdate: true }, autoClear: true,
  }
  const pass = createFloorReflection(renderer as unknown as WebGLRenderer)
  return { pass, scene, camera, floor, parent, reflector, glyph, overlay, line, light, hidden, renderer, previous, previousColor, background }
}

it('reflects the actual camera and rejects camera poses at or below the plane', () => {
  const { floor, camera } = world()
  const reflection = new PerspectiveCamera(), matrix = new Matrix4()
  expect(updateReflectionCamera(floor, camera, reflection, matrix)).toBe(true)
  expect(reflection.position.y).toBeCloseTo(-20, 8)
  expect(matrix.elements.every(Number.isFinite)).toBe(true)
  camera.position.y = -6
  expect(updateReflectionCamera(floor, camera, reflection, matrix)).toBe(false)
  camera.position.y = -8
  expect(updateReflectionCamera(floor, camera, reflection, matrix)).toBe(false)
  floor.geometry.dispose()
})

it('captures only marked bodies, guards reentrant work, and restores renderer and scene state', () => {
  const { pass, scene, camera, floor, parent, reflector, glyph, overlay, line, light, hidden, renderer, previous, previousColor, background } = captureFixture()
  const original = new MeshPhysicalMaterial({ transmission: .3 })
  original.onBeforeCompile = vi.fn()
  reflector.material = original
  const disposeVariant = vi.fn()
  renderer.render.mockImplementation((drawn: Scene, reflected: Camera) => {
    expect(drawn).toBe(scene)
    const layers = [parent, reflector, glyph, overlay, line, light, floor].map(object => reflected.layers.test(object.layers))
    expect(layers).toEqual([false, true, false, false, false, true, false])
    expect(hidden.visible).toBe(false)
    expect(scene.background).toBeNull()
    expect(renderer.xr.enabled).toBe(false)
    expect(renderer.shadowMap.needsUpdate).toBe(false)
    const variant = reflector.material as MeshPhysicalMaterial
    expect(variant).not.toBe(original)
    expect(variant.transmission).toBe(0)
    const shader = { ...ShaderLib.physical, uniforms: {} } as WebGLProgramParametersWithUniforms
    variant.onBeforeCompile(shader, renderer as unknown as WebGLRenderer)
    expect(original.onBeforeCompile).toHaveBeenCalled()
    expect(shader.uniforms.runtimeReflectingFloorY.value).toBe(-6)
    expect(shader.fragmentShader).toContain('smoothstep(0.45, 3.5, reflectionHeight)')
    variant.addEventListener('dispose', disposeVariant)
    expect(pass.render(scene, camera, floor)).toBe(false)
  })
  expect(pass.render(scene, camera, floor)).toBe(true)
  expect(pass.stats).toEqual({ meshes: 1, materials: 1, captures: 1, resolution: 384, failed: false })
  expect(reflector.material).toBe(original)
  expect(original.transmission).toBe(.3)
  expect(pass.strength.value).toBe(floorStyle.reflectionStrength)
  expect(parent.layers.mask).toBe(5)
  expect(glyph.layers.mask).toBe(1)
  expect(scene.background).toBe(background)
  expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previous, 2, 1)
  expect(renderer.setClearColor).toHaveBeenLastCalledWith(previousColor, .4)
  expect(renderer.xr.enabled && renderer.shadowMap.autoUpdate && renderer.shadowMap.needsUpdate && renderer.autoClear).toBe(true)
  const disposed = vi.fn()
  pass.target.addEventListener('dispose', disposed)
  pass.dispose()
  pass.dispose()
  expect(disposed).toHaveBeenCalledTimes(1)
  expect(disposeVariant).toHaveBeenCalledTimes(1)
  expect(pass.strength.value).toBe(0)
  expect(pass.render(scene, camera, floor)).toBe(false)
  original.dispose()
})

it('skips foreign material passes, empty selections and retried failures while preserving the base floor', () => {
  const { pass, scene, camera, floor, renderer, reflector, glyph, background } = captureFixture()
  scene.overrideMaterial = new MeshBasicMaterial()
  expect(pass.render(scene, camera, floor)).toBe(false)
  scene.overrideMaterial.dispose()
  scene.overrideMaterial = null
  reflector.userData.runtimeReflector = false
  expect(pass.render(scene, camera, floor)).toBe(false)
  expect(renderer.render).not.toHaveBeenCalled()
  reflector.userData.runtimeReflector = true
  renderer.render.mockImplementation(() => { throw new Error('failed target') })
  expect(pass.render(scene, camera, floor)).toBe(false)
  expect(glyph.layers.mask).toBe(1)
  expect(scene.background).toBe(background)
  expect(pass.strength.value).toBe(0)
  expect(pass.stats.failed).toBe(true)
  expect(pass.render(scene, camera, floor)).toBe(false)
  expect(renderer.render).toHaveBeenCalledTimes(1)
  pass.dispose()
})
