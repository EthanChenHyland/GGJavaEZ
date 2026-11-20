import { expect, it, vi } from 'vitest'
import { cinematicAvailability, detectGpuCapabilities, unsupportedGpuReason, type GpuCapabilities } from './gpuCapabilities'

const capable: GpuCapabilities = { webgl2: true, halfFloatColorBuffer: true, maxSamples: 4, maxTextureSize: 4096, renderer: 'ANGLE (Apple, Apple M3)', softwareRasterizer: false }
it('every required GPU capability independently gates Cinematic with an honest reason', () => {
  expect(cinematicAvailability(capable)).toEqual({ enabled: true })
  for (const missing of [{ webgl2: false }, { halfFloatColorBuffer: false }, { maxSamples: 2 }, { maxTextureSize: 2048 }, { softwareRasterizer: true }])
    expect(cinematicAvailability({ ...capable, ...missing })).toEqual({ enabled: false, reason: unsupportedGpuReason })
})
it('reads the supplied context and identifies software renderers from its actual driver string', () => {
  const parameters = new Map<number,number|string>([[1, 'WebGL 2.0 (OpenGL ES 3.0 Chromium)'], [2, 'WebKit WebGL'], [3, 8], [4, 16384], [5, 'ANGLE (Google, Vulkan SwiftShader Device)']])
  const gl = { VERSION: 1, RENDERER: 2, MAX_SAMPLES: 3, MAX_TEXTURE_SIZE: 4,
    getParameter: vi.fn((key: number) => parameters.get(key)),
    getExtension: vi.fn((name: string) => name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 5 } : {}) }
  expect(detectGpuCapabilities(gl as unknown as WebGL2RenderingContext)).toEqual({ webgl2: true, halfFloatColorBuffer: true, maxSamples: 8, maxTextureSize: 16384, renderer: parameters.get(5), softwareRasterizer: true })
  parameters.set(1, 'WebGL 1.0')
  expect(detectGpuCapabilities(gl as unknown as WebGLRenderingContext)).toMatchObject({ webgl2: false, maxSamples: 0, halfFloatColorBuffer: false })
})
