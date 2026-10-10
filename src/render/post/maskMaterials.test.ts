import { expect, it, vi } from 'vitest'
import { Group, Mesh, MeshBasicMaterial, ShaderLib, type WebGLRenderer } from 'three'
import { BatchedText } from 'troika-three-text'
import { BloomMaskMaterials, createMaskMaterial } from './maskMaterials'

const renderer = { shadowMap: { autoUpdate: true } } as WebGLRenderer
it('keeps vertex transforms and discard paths while fully excluding even dim protected pixels', () => {
  const source = new MeshBasicMaterial({ transparent: true, opacity: .25 })
  source.onBeforeCompile = shader => { shader.vertexShader += '\n// canonical instance transform' }
  const mask = createMaskMaterial(source, 1), shader = { ...ShaderLib.basic, uniforms: {} }
  mask.onBeforeCompile(shader as Parameters<typeof mask.onBeforeCompile>[0], renderer)
  expect(shader.vertexShader).toContain('canonical instance transform')
  expect(shader.fragmentShader).toContain('gl_FragColor = vec4(vec3(1.0), 1.0)')
  expect(shader.fragmentShader).toContain('if (gl_FragColor.a <= 0.0001) discard')
  expect(mask.opacity).toBe(.25)
  expect(mask.uuid).not.toBe(source.uuid)
  const disposed = vi.fn(); source.addEventListener('dispose', disposed)
  mask.dispose(); expect(disposed).not.toHaveBeenCalled(); source.dispose()
})
it('retains Troika batching and SDF discard without recursively deriving the mask', () => {
  const text = new BatchedText(), source = text.material
  const mask = createMaskMaterial(source, 0), shader = { ...ShaderLib.basic, uniforms: {} }
  mask.onBeforeCompile(shader as Parameters<typeof mask.onBeforeCompile>[0], renderer)
  expect(Reflect.get(mask, 'isTroikaTextMaterial')).toBe(true)
  expect(shader.fragmentShader).toContain('troika')
  expect(shader.fragmentShader).toContain('gl_FragColor = vec4(vec3(0.0), 1.0)')
  expect(shader.fragmentShader.lastIndexOf('gl_FragColor =')).toBeGreaterThan(shader.fragmentShader.lastIndexOf('troikaOrigMain'))
  expect(Reflect.get(mask, 'uniforms')).toBe(Reflect.get(source, 'uniforms'))
  mask.dispose(); text.dispose()
})
it('emits only explicit roles, protects all remaining surfaces, and restores materials after a failed draw', () => {
  const scene = new Group(), face = new Mesh(), text = new Mesh(), edge = new Mesh()
  face.userData.runtimeBloomRole = 'protected'; edge.userData.runtimeBloomRole = 'emitter'
  scene.add(face, text, edge)
  const original = [face.material, text.material, edge.material], masks = new BloomMaskMaterials()
  expect(() => masks.render(renderer, scene, 'emitters', () => {
    expect(face.material).not.toBe(original[0]); expect(text.material).not.toBe(original[1]); expect(edge.material).toBe(original[2])
    expect(renderer.shadowMap.autoUpdate).toBe(false)
    throw new Error('context interruption')
  })).toThrow('context interruption')
  expect([face.material, text.material, edge.material]).toEqual(original)
  expect(renderer.shadowMap.autoUpdate).toBe(true)
  masks.render(renderer, scene, 'protection', () => {
    expect(edge.material).not.toBe(original[2]); expect(face.material).not.toBe(original[0])
  })
  expect([face.material, text.material, edge.material]).toEqual(original)
  masks.dispose()
})
