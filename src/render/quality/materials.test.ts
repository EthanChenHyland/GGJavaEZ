import { expect, it } from 'vitest'
import { Color, MeshPhysicalMaterial, ShaderLib } from 'three'
import { glassMaterial, disposeRuntimeMaterials } from '../RuntimeMaterials'
import { createCinematicBody } from './cinematicMaterials'
import { color } from '../../theme/tokens'

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
it('Cinematic has the specified physical transmission and semantic attenuation colour for every body role', () => {
  for (const role of ['stack', 'heap', 'class'] as const) {
    const material = createCinematicBody(role, 1)
    expect(material).toMatchObject({ transmission: .75, thickness: 1, ior: 1.45, roughness: .22, depthWrite: true })
    expect(material.attenuationColor.equals(new Color(color[role].core))).toBe(true)
    material.dispose()
  }
})
