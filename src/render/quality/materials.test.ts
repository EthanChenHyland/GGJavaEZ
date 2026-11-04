import { afterEach, expect, it, vi } from 'vitest'
import { Color, MeshPhysicalMaterial, ShaderLib } from 'three'
import { faceMaterial, glassMaterial, disposeRuntimeMaterials } from '../RuntimeMaterials'
import { createCinematicBody } from './cinematicMaterials'
import { color } from '../../theme/tokens'
import { qualityStore } from './qualityStore'
afterEach(()=>{disposeRuntimeMaterials();qualityStore.setState({cinematicModule:null})})

it('shares face-band material identity and releases each once with the renderer',()=>{
  const surface=faceMaterial(1,false),inset=faceMaterial(1,true),dimmed=faceMaterial(.25,true)
  const materials=[surface,inset,dimmed],disposed=materials.map(()=>vi.fn())
  materials.forEach((material,index)=>material.addEventListener('dispose',disposed[index]))
  for(let transition=0;transition<50;transition++){
    expect(faceMaterial(1,false)).toBe(surface);expect(faceMaterial(1,true)).toBe(inset);expect(faceMaterial(.25,true)).toBe(dimmed)
  }
  expect(surface).toMatchObject({opacity:1,transparent:false,depthWrite:true,toneMapped:false})
  expect(inset).toMatchObject({opacity:1,transparent:false,depthWrite:false,toneMapped:false})
  expect(dimmed).toMatchObject({opacity:.25,transparent:true,depthWrite:false,toneMapped:false})
  expect(surface.customProgramCacheKey()).not.toContain('runtime-rounded-value-chip')
  expect(inset.customProgramCacheKey()).toContain('runtime-rounded-value-chip')
  for(const listener of disposed)expect(listener).not.toHaveBeenCalled()
  disposeRuntimeMaterials();disposeRuntimeMaterials()
  for(const listener of disposed)expect(listener).toHaveBeenCalledOnce()
  expect(faceMaterial(1,true)).not.toBe(inset)
})

it('Interactive uses reflected acrylic rim shading without physical transmission', () => {
  const material = glassMaterial('stack')
  expect(material).toMatchObject({ opacity: .78, roughness: .22, depthWrite: true, transparent: true })
  expect(material).not.toBeInstanceOf(MeshPhysicalMaterial)
  const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} }
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as Parameters<typeof material.onBeforeCompile>[1])
  expect(shader.fragmentShader).toContain('runtimeEdgeTint * acrylicRim')
  expect(shader.fragmentShader).toContain('#include <opaque_fragment>')
  expect(material).toBe(glassMaterial('stack'))
  disposeRuntimeMaterials()
})
it('only faded Focus context stops writing depth, preserving ordinary historical and Trace bands in both tiers', () => {
  qualityStore.setState({cinematicModule:{createCinematicBody}})
  for (const role of ['stack', 'heap', 'class'] as const) {
    for (const tier of ['INTERACTIVE','CINEMATIC'] as const) for (const emphasis of [.25, .4, .45, .55, 1]) {
      const ordinary=glassMaterial(role,emphasis,tier),focused=glassMaterial(role,emphasis,tier,true)
      const opacity=(tier==='INTERACTIVE'?.78:1)*emphasis
      expect(ordinary).toMatchObject({opacity,depthTest:true,depthWrite:true})
      expect(focused).toMatchObject({opacity,depthTest:true,depthWrite:emphasis>.25})
      expect(glassMaterial(role,emphasis,tier,true)).toBe(focused)
      if(emphasis>.25)expect(focused).toBe(ordinary)
      else expect(focused).not.toBe(ordinary)
    }
  }
})
it('Cinematic has the specified physical transmission and semantic attenuation colour for every body role', () => {
  for (const role of ['stack', 'heap', 'class'] as const) {
    const material = createCinematicBody(role, 1)
    expect(material).toMatchObject({ transmission: .75, thickness: 1, ior: 1.45, roughness: .22, depthWrite: true })
    expect(material.attenuationColor.equals(new Color(color[role].core))).toBe(true)
    material.dispose()
  }
})
