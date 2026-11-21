import { expect, it } from 'vitest'
import { Matrix4, ShaderLib, Texture } from 'three'
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three'
import { createFloorSurface } from './floorGrid'
import { floorModel } from './floorModel'

function compile(surface: ReturnType<typeof createFloorSurface>) {
  const shader = { ...ShaderLib.basic, uniforms: {} } as WebGLProgramParametersWithUniforms
  surface.material.onBeforeCompile(shader, {} as WebGLRenderer)
  return shader
}

it('uses a shared, gradient-faded floor and derivative-filtered grid with no Interactive reflection sampler', () => {
  const surface = createFloorSurface(null)
  const shader = compile(surface)
  expect(shader.vertexShader).toContain('floorPosition = (modelMatrix * vec4(transformed, 1.0)).xyz')
  expect(shader.fragmentShader).toContain('fwidth(tile)')
  expect(shader.fragmentShader).toContain('diffuseColor.a *= stageEdge * grazing;')
  expect(shader.fragmentShader).toContain('0.11 * nearGrid')
  expect(shader.fragmentShader).toContain('max(nearGrid, distantGrid)')
  expect(shader.fragmentShader).not.toContain('runtimeFloorReflection')
  expect(surface.material.depthWrite).toBe(false)
  surface.update(floorModel({ bounds: null }, 'INTERACTIVE', false))
  expect(surface.material.opacity).toBe(.42)
  surface.material.dispose()
})

it('adds a clipped, soft filtered Cinematic reflection through a live strength uniform', () => {
  const texture = new Texture()
  const strength = { value: 0 }
  const surface = createFloorSurface({ target: { texture }, textureMatrix: new Matrix4(), strength })
  const shader = compile(surface)
  expect(shader.uniforms.runtimeFloorReflection.value).toBe(texture)
  expect(shader.uniforms.runtimeFloorReflectionStrength).toBe(strength)
  expect(shader.fragmentShader).toContain('floorProjection.xy / floorProjection.w')
  expect(shader.fragmentShader.match(/texture2D\(runtimeFloorReflection/g)).toHaveLength(9)
  expect(shader.fragmentShader).toContain('runtimeFloorReflectionStrength <= 0.0')
  expect(shader.fragmentShader).toContain('max(0.06, peak)')
  surface.material.dispose()
  texture.dispose()
})
