import { expect, it, vi } from 'vitest'
import { CustomBlending, MaxEquation, Group, Mesh, MeshBasicMaterial, ShaderLib, Sprite, SpriteMaterial, type WebGLRenderer } from 'three'
import { BatchedText } from 'troika-three-text'
import { BloomMaskMaterials, createMaskMaterial } from './maskMaterials'

const renderer = { shadowMap: { autoUpdate: true } } as WebGLRenderer
it('keeps vertex transforms and discard paths while fully excluding even dim protected pixels', () => {
  const source = new MeshBasicMaterial({ transparent: true, opacity: .25 })
  source.onBeforeCompile = shader => { shader.vertexShader += '\n// canonical instance transform' }
  const mask = createMaskMaterial(source, 1), shader = { ...ShaderLib.basic, uniforms: {} }
  mask.onBeforeCompile(shader as Parameters<typeof mask.onBeforeCompile>[0], renderer)
  expect(shader.vertexShader).toContain('canonical instance transform')
  expect(shader.fragmentShader).toContain('gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0)')
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
  expect(shader.fragmentShader).toContain('gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0)')
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

it('separates unlit coverage from hard bloom exclusion without transferring source ownership', () => {
  for(const toneMapped of [true,false]){
    const source=new MeshBasicMaterial({toneMapped,opacity:.25,transparent:true})
    const mask=createMaskMaterial(source,1),shader={...ShaderLib.basic,uniforms:{}}
    mask.onBeforeCompile(shader as Parameters<typeof mask.onBeforeCompile>[0],renderer)
    expect(shader.fragmentShader).toContain(`vec4(1.0, 1.0, ${toneMapped?'0.0':'clamp(gl_FragColor.a, 0.0, 1.0)'}, 1.0)`)
    expect(mask.customProgramCacheKey()).toContain(`unlit-${!toneMapped}-v2`)
    expect(source.toneMapped).toBe(toneMapped)
    mask.dispose();source.dispose()
  }
})

it('excludes soft atmosphere from every mask without suppressing emitters or changing its visibility after interrupted draws',()=>{
 const scene=new Group(),material=new SpriteMaterial({opacity:.58,depthWrite:false}),haze=new Sprite(material),edge=new Mesh()
 haze.userData.runtimeAtmosphere='HEAP';edge.userData.runtimeBloomRole='emitter';scene.add(haze,edge)
 const masks=new BloomMaskMaterials(),original=edge.material,disposed=vi.fn();material.addEventListener('dispose',disposed)
 for(const mode of ['emitters','protection','text'] as const)for(const visible of [true,false]){
  haze.visible=visible
  expect(()=>masks.render(renderer,scene,mode,()=>{
   expect(haze.visible).toBe(false);expect(haze.material).toBe(material)
   if(mode==='emitters')expect(edge.material).toBe(original)
   throw new Error('interrupted mask')
  })).toThrow('interrupted mask')
  expect(haze.visible).toBe(visible);expect(edge.material).toBe(original);expect(renderer.shadowMap.autoUpdate).toBe(true)
 }
 masks.dispose();expect(disposed).not.toHaveBeenCalled();material.dispose()
})

it('accumulates unlit Troika protection while leaving source, black and ordinary masks unchanged', () => {
  const text = new BatchedText()
  text.material = new MeshBasicMaterial({ color: 'white', transparent: true, depthWrite: false, toneMapped: false })
  const source = text.material, originalBlend = source.blending, originalEquation = source.blendEquation
  const white = createMaskMaterial(source, 1), black = createMaskMaterial(source, 0)
  expect(white.blending).toBe(CustomBlending); expect(white.blendEquation).toBe(MaxEquation)
  expect(black.blending).toBe(originalBlend); expect(black.blendEquation).toBe(originalEquation)
  expect(source.blending).toBe(originalBlend); expect(source.blendEquation).toBe(originalEquation)
  const ordinary = new MeshBasicMaterial({ toneMapped: false }), ordinaryMask = createMaskMaterial(ordinary, 1)
  expect(ordinaryMask.blending).toBe(ordinary.blending); expect(ordinaryMask.blendEquation).toBe(ordinary.blendEquation)
  white.dispose(); black.dispose(); ordinaryMask.dispose(); ordinary.dispose(); text.dispose()
})
