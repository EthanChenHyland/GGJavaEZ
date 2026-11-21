import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { interactivePipeline } from './interactivePipeline'
import { qualityStore, useQualityStore } from '../quality/qualityStore'
import { renderActivity } from '../renderActivity'
import { createFramePerformanceProbe, type FramePerformanceProbe } from '../../qa/framePerformance'
import { renderAuxiliaryPasses } from './auxiliaryPasses'

export const postReadiness = {
  ready: false, frames: 0, revision: 0, failure: '', cinematic: false,
  buffer: 'direct' as 'hdr' | 'ldr' | 'direct',
  renderTargets: 0,
}
export let postPerformance: FramePerformanceProbe | null = null

/** Single render owner; effects never alter semantic data or the camera. */
export function PostPipeline() {
  const { gl, scene, camera, size, viewport, invalidate } = useThree()
  const tier = useQualityStore(state => state.active)
  const contextLost = useQualityStore(state => state.contextLost)
  const setting = useQualityStore(state => state.setting)
  const capability = useQualityStore(state => state.cinematicAvailable.enabled)
  const cinematicStatus = useQualityStore(state => state.cinematicStatus)
  const compiled = useQualityStore(state => state.compiled)
  const resources = useRef<ReturnType<typeof interactivePipeline> | null>(null)
  const texturesReady = useRef(false)
  const performanceProbe = useRef<FramePerformanceProbe | null>(null)

  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_QA === '1') || new URLSearchParams(window.location.search).get('perf') !== '1') return
    const probe = createFramePerformanceProbe(gl)
    performanceProbe.current = probe
    postPerformance = probe
    return () => {
      probe.dispose()
      if (performanceProbe.current === probe) performanceProbe.current = null
      if (postPerformance === probe) postPerformance = null
    }
  }, [gl])

  useEffect(() => {
    Object.assign(postReadiness, { ready: false, frames: 0, failure: '', cinematic: false, buffer: 'direct', renderTargets: 0 })
    postReadiness.revision++
    texturesReady.current = false
    if (contextLost) return
    let pipeline: ReturnType<typeof interactivePipeline>
    try {
      pipeline = interactivePipeline(gl, scene, camera)
    } catch (error) {
      postReadiness.failure = `Post-processing unavailable: ${String(error)}`
      postReadiness.ready = true
      qualityStore.setState({ notice: postReadiness.failure })
      invalidate()
      return
    }
    resources.current = pipeline
    postReadiness.buffer = pipeline.hdr ? 'hdr' : 'ldr'
    postReadiness.renderTargets = pipeline.renderTargets
    const prepared = () => {
      if (resources.current !== pipeline) return
      texturesReady.current = true
      postReadiness.revision++
      invalidate()
    }
    void pipeline.ready.then(prepared, error => {
      if (resources.current !== pipeline) return
      postReadiness.failure = `SMAA unavailable: ${String(error)}`
      qualityStore.setState({ notice: postReadiness.failure })
      prepared()
    })
    return () => {
      pipeline.dispose()
      resources.current = null
      Object.assign(postReadiness, { ready: false, cinematic: false, buffer: 'direct', renderTargets: 0 })
    }
  }, [gl, scene, camera, contextLost, invalidate])

  useEffect(() => {
    const pipeline = resources.current
    if (contextLost || !pipeline) return
    pipeline.resize(size.width, size.height, viewport.dpr)
    postReadiness.frames = 0
    postReadiness.revision++
    invalidate()
  }, [gl, scene, camera, contextLost, invalidate, size.width, size.height, viewport.dpr])

  useEffect(() => {
    if (setting !== 'CINEMATIC' || !capability || cinematicStatus !== 'ready' || contextLost) return
    const pipeline = resources.current
    const unavailable = (reason: string) => {
      postReadiness.failure = reason
      postReadiness.revision++
      qualityStore.getState().reportFailure(reason)
      invalidate()
    }
    if (!pipeline?.hdr) {
      unavailable('Cinematic effects require a working half-float post-processing pipeline')
      return
    }
    let retired = false
    void import('./cinematicPasses').then(module => {
      if (retired || resources.current !== pipeline) return
      pipeline.addCinematic(module.createCinematicPass)
      postReadiness.renderTargets = pipeline.renderTargets
      postReadiness.revision++
      invalidate()
    }).catch(error => {
      if (!retired && resources.current === pipeline) unavailable(`Cinematic effects could not be prepared: ${String(error)}`)
    })
    return () => {
      retired = true
      if (resources.current !== pipeline) return
      pipeline.removeCinematic()
      postReadiness.cinematic = false
      postReadiness.renderTargets = pipeline.renderTargets
      postReadiness.revision++
      invalidate()
    }
  }, [gl, scene, camera, invalidate, setting, capability, cinematicStatus, contextLost])

  // The material compile can complete after the last demand-rendered frame.
  // Wake the governor even when the optional effects were already loaded.
  useEffect(() => {
    if (compiled && setting === 'CINEMATIC' && !contextLost) invalidate()
  }, [compiled, setting, contextLost, invalidate])

  // Include world, reflection, shadow, mask and screen draws in one frame.
  useFrame(() => {
    performanceProbe.current?.startFrame()
    renderActivity.continuous = renderActivity.nextRequested
    renderActivity.nextRequested = false
    gl.info.autoReset = false
    gl.info.reset()
  }, -100)

  useFrame((_state, delta) => {
    if (contextLost) return
    const pipeline = resources.current
    const probe = performanceProbe.current
    probe?.beginSubmission()
    try {
      renderAuxiliaryPasses(gl)
      if (!pipeline) {
        gl.setRenderTarget(null)
        gl.render(scene, camera)
        postReadiness.frames++
        return
      }
      const cinematicActive = tier === 'CINEMATIC' && pipeline.hasCinematic
      const quality = qualityStore.getState()
      postReadiness.ready = texturesReady.current && (quality.setting !== 'CINEMATIC' || !quality.cinematicAvailable.enabled || pipeline.hasCinematic)
      try {
        const failure = pipeline.render(delta, cinematicActive)
        postReadiness.cinematic = cinematicActive && !failure
        if (failure) {
          postReadiness.failure = failure
          postReadiness.renderTargets = pipeline.renderTargets
          postReadiness.revision++
          qualityStore.getState().reportFailure(failure)
          invalidate()
        } else if (cinematicActive && postReadiness.failure.startsWith('Cinematic ')) {
          postReadiness.failure = ''
        }
      } catch (error) {
        if (gl.getContext().isContextLost()) return
        pipeline.dispose()
        resources.current = null
        postReadiness.failure = `Post-processing disabled: ${String(error)}`
        Object.assign(postReadiness, { ready: true, cinematic: false, buffer: 'direct', renderTargets: 0 })
        postReadiness.revision++
        if (quality.setting === 'CINEMATIC') qualityStore.getState().reportFailure(postReadiness.failure)
        else qualityStore.setState({ notice: postReadiness.failure })
        gl.setRenderTarget(null)
        gl.render(scene, camera)
        invalidate()
      }
      postReadiness.frames++
    } finally {
      probe?.endSubmission({ tier, continuous: renderActivity.continuous })
    }
  }, 1)

  useEffect(() => () => { gl.info.autoReset = true }, [gl])
  return null
}
