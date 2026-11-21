import { afterEach, expect, it, vi } from 'vitest'
import { HalfFloatType, PerspectiveCamera, Scene, UnsignedByteType, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { createCinematicPass, CinematicOcclusionPass } from './cinematicPasses'
import { interactivePipeline } from './interactivePipeline'
import { SelectiveBloomPass } from './SelectiveBloomPass'

function fixture(hdr: boolean, decode = async () => {}) {
  vi.stubGlobal('Image', class { decode() { return decode() } })
  const context = { isContextLost: vi.fn(() => false) }
  const renderer = {
    extensions: { has: vi.fn(() => hdr) }, getPixelRatio: () => 1,
    getRenderTarget: () => null, setRenderTarget: vi.fn(), autoClear: true,
    getContext: () => context,
  } as unknown as WebGLRenderer
  const pipeline = interactivePipeline(renderer, new Scene(), new PerspectiveCamera())
  return { renderer, pipeline, context }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('settles without half-float colour attachments with the same SMAA and protected output path', async () => {
  const { pipeline } = fixture(false)
  try {
    await pipeline.ready
    const render = vi.spyOn(EffectComposer.prototype, 'render').mockImplementation(function (this: EffectComposer) {
      expect(this.renderTarget1.texture.type).toBe(UnsignedByteType)
      const bloom = this.passes.find(pass => pass instanceof SelectiveBloomPass)!
      expect(bloom.protectionTexture.type).toBe(UnsignedByteType)
      expect(bloom.needsSwap).toBe(false)
      const [smaa, output] = this.passes.slice(-2)
      expect(smaa).toBeInstanceOf(SMAAPass)
      expect(smaa.enabled).toBe(true)
      expect(output).toBeInstanceOf(OutputPass)
      const { _edgesRT, _weightsRT } = smaa as unknown as { _edgesRT: WebGLRenderTarget; _weightsRT: WebGLRenderTarget }
      expect([_edgesRT.texture.type, _weightsRT.texture.type]).toEqual([UnsignedByteType, UnsignedByteType])
      expect((output as OutputPass).uniforms.runtimeUnlitMask.value).toBe(bloom.protectionTexture)
    })
    expect(pipeline.hdr).toBe(false)
    expect(pipeline.renderTargets).toBe(5)
    expect(() => pipeline.addCinematic(createCinematicPass)).toThrow('Half-float colour attachments are unavailable')
    expect(pipeline.render(0, false)).toBeNull()
    expect(render).toHaveBeenCalledOnce()
  } finally {
    pipeline.dispose()
  }
  expect(pipeline.renderTargets).toBe(0)
})

it('reuses the composer across quality changes and retires failed Cinematic targets before retrying or reselection', async () => {
  const { pipeline } = fixture(true)
  try {
    await pipeline.ready
    const visited = new Set<EffectComposer>()
    const render = vi.spyOn(EffectComposer.prototype, 'render').mockImplementation(function (this: EffectComposer) {
      visited.add(this)
      const cinematic = this.passes.find(pass => pass instanceof CinematicOcclusionPass)
      expect(this.renderTarget1.texture.type).toBe(HalfFloatType)
      if (cinematic) {
        const bloom = this.passes.find(pass => pass instanceof SelectiveBloomPass)!
        expect(this.passes.indexOf(cinematic)).toBe(this.passes.indexOf(bloom) + 1)
        if (cinematic.enabled) throw new Error('hardware draw failed')
      }
    })
    const disposed = vi.spyOn(CinematicOcclusionPass.prototype, 'dispose')
    expect(pipeline.renderTargets).toBe(8)
    pipeline.resize(1439, 901, 1.25)
    pipeline.addCinematic(createCinematicPass)
    expect(pipeline.hasCinematic).toBe(true)
    expect(pipeline.renderTargets).toBe(11)
    expect(pipeline.render(0, false)).toBeNull()
    expect(pipeline.render(0, true)).toBe('Cinematic effects could not render: hardware draw failed')
    expect(pipeline.hasCinematic).toBe(false)
    expect(pipeline.renderTargets).toBe(8)
    expect(disposed).toHaveBeenCalledOnce()
    expect(render).toHaveBeenCalledTimes(3)
    expect(visited.size).toBe(1)
    pipeline.addCinematic(createCinematicPass)
    expect(pipeline.renderTargets).toBe(11)
    pipeline.removeCinematic()
    expect(disposed).toHaveBeenCalledTimes(2)
    expect(pipeline.renderTargets).toBe(8)
    pipeline.addCinematic(createCinematicPass)
    pipeline.dispose()
    expect(disposed).toHaveBeenCalledTimes(3)
  } finally {
    pipeline.dispose()
  }
  expect(pipeline.renderTargets).toBe(0)
})

it('does not retry as Interactive or dispose the optional pass during an actual context loss', async () => {
  const { pipeline, context } = fixture(true)
  try {
    await pipeline.ready
    pipeline.addCinematic(createCinematicPass)
    context.isContextLost.mockReturnValue(true)
    const render = vi.spyOn(EffectComposer.prototype, 'render').mockImplementation(() => { throw new Error('lost') })
    expect(() => pipeline.render(0, true)).toThrow('lost')
    expect(pipeline.hasCinematic).toBe(true)
    expect(render).toHaveBeenCalledOnce()
  } finally {
    pipeline.dispose()
  }
})

it('retains protected output when the SMAA lookup image fails to decode', async () => {
  const { pipeline } = fixture(true, async () => { throw new Error('unavailable lookup image') })
  try {
    await expect(pipeline.ready).rejects.toThrow('unavailable lookup image')
    vi.spyOn(EffectComposer.prototype, 'render').mockImplementation(function (this: EffectComposer) {
      const [smaa, output] = this.passes.slice(-2)
      expect(smaa.enabled).toBe(false)
      expect(output.enabled).toBe(true)
      expect((output as OutputPass).uniforms.runtimeUnlitMask.value).toBeDefined()
    })
    expect(pipeline.render(0, false)).toBeNull()
  } finally {
    pipeline.dispose()
  }
})
