export interface GpuCapabilities {
  webgl2: boolean
  halfFloatColorBuffer: boolean
  maxSamples: number
  maxTextureSize: number
  renderer: string
  softwareRasterizer: boolean
}

export type CinematicAvailability = { enabled: true } | { enabled: false; reason: string }
export const unsupportedGpuReason = 'This GPU does not support Cinematic rendering'

/** Reads the existing renderer's context; never creates a competing WebGL context. */
export function detectGpuCapabilities(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuCapabilities {
  const version = String(gl.getParameter(gl.VERSION) ?? '')
  const webgl2 = /^WebGL 2(?:\.|\s)/i.test(version)
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? '')
  return {
    webgl2,
    halfFloatColorBuffer: webgl2 && !!gl.getExtension('EXT_color_buffer_float'),
    maxSamples: webgl2 ? Number(gl.getParameter((gl as WebGL2RenderingContext).MAX_SAMPLES)) : 0,
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    renderer,
    softwareRasterizer: /swiftshader|llvmpipe|softpipe|swrast|software raster|microsoft basic render|lavapipe/i.test(renderer),
  }
}

export function cinematicAvailability(capabilities: GpuCapabilities): CinematicAvailability {
  return capabilities.webgl2 && capabilities.halfFloatColorBuffer && capabilities.maxSamples >= 4 &&
    capabilities.maxTextureSize >= 4096 && !capabilities.softwareRasterizer
    ? { enabled: true } : { enabled: false, reason: unsupportedGpuReason }
}
