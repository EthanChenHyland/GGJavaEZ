import { expect, it, vi } from 'vitest'
import { BoxGeometry, InstancedMesh, Mesh, MeshStandardMaterial, Scene, Texture } from 'three'
import { releaseLostSceneBindings } from './releaseLostSceneBindings'

it('releases shared GPU bindings without replacing the mounted scene data', () => {
  const scene = new Scene()
  const geometry = new BoxGeometry()
  const atlas = new Texture()
  const rendererLookup = new Texture()
  const material = new MeshStandardMaterial({ map: atlas })
  const instanced = new InstancedMesh(geometry, material, 2)
  const ordinary = new Mesh(geometry, material)
  scene.add(instanced, ordinary)
  scene.background = atlas
  const onGeometry = vi.fn(), onInstances = vi.fn(), onAtlas = vi.fn(), onLookup = vi.fn()
  geometry.addEventListener('dispose', onGeometry)
  instanced.addEventListener('dispose', onInstances)
  atlas.addEventListener('dispose', onAtlas)
  rendererLookup.addEventListener('dispose', onLookup)
  const properties = {
    has: (object: unknown) => object === material,
    get: () => ({ uniforms: { map: { value: atlas }, dfgLUT: { value: rendererLookup } } }),
    update: vi.fn(), remove: vi.fn(), dispose: vi.fn(),
  }

  releaseLostSceneBindings(scene, { properties })

  for (const released of [onGeometry, onInstances, onAtlas, onLookup]) expect(released).toHaveBeenCalledOnce()
  expect(scene.children).toEqual([instanced, ordinary])
  expect(instanced.geometry).toBe(geometry)
  expect(instanced.count).toBe(2)
  expect(material.map).toBe(atlas)
})
