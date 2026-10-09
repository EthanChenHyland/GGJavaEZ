import { expect, it, vi } from 'vitest'
import { MeshPhysicalMaterial } from 'three'
import { createQualityStore } from './qualityStore'
import type { GpuCapabilities } from './gpuCapabilities'

const capable: GpuCapabilities = { webgl2: true, halfFloatColorBuffer: true, maxSamples: 8, maxTextureSize: 16384, renderer: 'hardware', softwareRasterizer: false }
const materialModule = { createCinematicBody: () => new MeshPhysicalMaterial() }
it('does not load a Cinematic chunk at startup, after probing or after selecting Interactive', async () => {
  const load = vi.fn(async () => materialModule), store = createQualityStore(load)
  store.getState().initialize(capable)
  await store.getState().selectQuality('INTERACTIVE')
  expect(load).not.toHaveBeenCalled()
  expect(store.getState()).toMatchObject({ setting: 'INTERACTIVE', active: 'INTERACTIVE', cinematicAvailable: { enabled: true } })
  await store.getState().selectQuality('CINEMATIC')
  expect(load).toHaveBeenCalledTimes(1)
  store.getState().frame(0, 16, false)
  expect(store.getState().active).toBe('INTERACTIVE')
  store.getState().setCompiled(true); store.getState().frame(1, 16, false)
  expect(store.getState().active).toBe('CINEMATIC')
  store.getState().frame(2, 16, true)
  expect(store.getState()).toMatchObject({ setting: 'CINEMATIC', active: 'INTERACTIVE' })
  store.getState().frame(3, 16, false); store.getState().frame(502, 16, false)
  expect(store.getState().active).toBe('INTERACTIVE')
  store.getState().frame(503, 16, false); expect(store.getState().active).toBe('CINEMATIC')
  await store.getState().selectQuality('INTERACTIVE'); await store.getState().selectQuality('CINEMATIC')
  expect(load).toHaveBeenCalledTimes(1)
})
it('unsupported actual capabilities refuse a request without importing, and a load failure is not labelled unsupported', async () => {
  const load = vi.fn(async () => { throw new Error('network failure') }), store = createQualityStore(load)
  store.getState().initialize({ ...capable, softwareRasterizer: true })
  await store.getState().selectQuality('CINEMATIC'); expect(load).not.toHaveBeenCalled()
  store.getState().initialize(capable); await store.getState().selectQuality('CINEMATIC')
  expect(store.getState()).toMatchObject({ setting: 'INTERACTIVE', active: 'INTERACTIVE', cinematicStatus: 'failed', cinematicAvailable: { enabled: true } })
  expect(store.getState().notice).toContain('network failure')
})
it('retains Interactive after an automatic downgrade until the user explicitly reselects Cinematic', async () => {
  const store = createQualityStore(async () => materialModule)
  store.getState().initialize(capable); await store.getState().selectQuality('CINEMATIC'); store.getState().setCompiled(true)
  for (let time = 0; time <= 2000; time += 50) store.getState().frame(time, 50, false)
  expect(store.getState()).toMatchObject({ setting: 'INTERACTIVE', active: 'INTERACTIVE' })
  expect(store.getState().notice).toContain('33 ms')
  store.getState().frame(3000, 16, false); expect(store.getState().active).toBe('INTERACTIVE')
  await store.getState().selectQuality('CINEMATIC'); store.getState().frame(3016, 16, false)
  expect(store.getState().active).toBe('CINEMATIC')
})
it('keeps the selected tier through context recovery but waits for actual shader preparation', async () => {
  const store = createQualityStore(async () => materialModule)
  store.getState().initialize(capable); await store.getState().selectQuality('CINEMATIC'); store.getState().setCompiled(true)
  store.getState().setContextLost(true); store.getState().frame(0, 16, false)
  expect(store.getState()).toMatchObject({ contextLost: true, setting: 'CINEMATIC', active: 'INTERACTIVE', compiled: false })
  store.getState().initialize(capable); store.getState().frame(16, 16, false)
  expect(store.getState().active).toBe('INTERACTIVE')
  store.getState().setCompiled(true); store.getState().frame(32, 16, false)
  expect(store.getState().active).toBe('CINEMATIC')
})
