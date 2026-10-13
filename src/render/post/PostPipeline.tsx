import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { interactivePipeline } from './interactivePipeline'
import { qualityStore, useQualityStore } from '../quality/qualityStore'
import {renderActivity} from '../renderActivity'
import {createFramePerformanceProbe,type FramePerformanceProbe} from '../../qa/framePerformance'
import {renderAuxiliaryPasses} from './auxiliaryPasses'
export const postReadiness = { ready: false, frames: 0, revision: 0, failure: '', cinematic:false }
export let postPerformance:FramePerformanceProbe|null=null

/** Single render owner; effects never alter semantic data or the camera. */
export function PostPipeline() {
  const { gl, scene, camera, size, invalidate } = useThree()
  const tier = useQualityStore(state => state.active), contextLost = useQualityStore(state => state.contextLost)
  const setting=useQualityStore(state=>state.setting)
  const [cinematic,setCinematic]=useState<typeof import('./cinematicPasses')|null>(null)
  const requested=useRef(false),mounted=useRef(true),texturesReady=useRef(false)
  const performanceProbe=useRef<FramePerformanceProbe|null>(null)
  useEffect(()=>{
    if(!(import.meta.env.DEV||import.meta.env.VITE_QA==='1')||new URLSearchParams(window.location.search).get('perf')!=='1')return
    const probe=createFramePerformanceProbe(gl);performanceProbe.current=probe;postPerformance=probe
    return()=>{probe.dispose();if(performanceProbe.current===probe)performanceProbe.current=null;if(postPerformance===probe)postPerformance=null}
  },[gl])
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{
    if(setting!=='CINEMATIC'||requested.current)return
    requested.current=true
    void import('./cinematicPasses').then(module=>{if(mounted.current)setCinematic(module)},error=>{
      if(mounted.current)qualityStore.getState().reportFailure(`Cinematic effects could not be loaded: ${String(error)}`)
    })
  },[setting])
  const resources = useMemo(() => contextLost ? null : interactivePipeline(gl, scene, camera,cinematic?.createCinematicPass), [gl, scene, camera, contextLost,cinematic])
  const failed = useRef(false)
  useEffect(() => {
    postReadiness.ready = false; postReadiness.frames = 0; postReadiness.revision++; postReadiness.failure=''; failed.current = false; texturesReady.current=false
    if (!resources) return
    let retired = false
    void resources.ready.then(() => { if (!retired) { texturesReady.current = true; postReadiness.revision++; invalidate() } }, error => {
      if (!retired) { postReadiness.failure = `SMAA preparation failed: ${String(error)}`; failed.current = true; postReadiness.ready = true; qualityStore.setState({notice:postReadiness.failure}) }
    })
    return () => { retired = true; resources.dispose(); postReadiness.ready = false }
  }, [resources,invalidate])
  useEffect(() => {
    if (!resources) return
    resources.composer.setPixelRatio(gl.getPixelRatio()); resources.composer.setSize(size.width, size.height)
    postReadiness.frames = 0; postReadiness.revision++
  }, [resources, size.width, size.height, tier, gl])
  // Count all world, reflection, shadow, mask and screen passes for this display
  // frame; renderer.render's default reset would hide most of that work.
  useFrame(() => { performanceProbe.current?.startFrame();renderActivity.continuous=renderActivity.nextRequested;renderActivity.nextRequested=false; gl.info.autoReset = false; gl.info.reset() }, -100)
  useFrame((_state, delta) => {
    if (contextLost) return
    const probe=performanceProbe.current
    probe?.beginSubmission()
    try{
    renderAuxiliaryPasses(gl)
    if (!resources || failed.current) { gl.setRenderTarget(null); gl.render(scene, camera); postReadiness.frames++; return }
    resources.bloom.bloom.strength = tier === 'CINEMATIC' ? .65 : .55
    if(resources.cinematic)resources.cinematic.enabled=tier==='CINEMATIC'
    postReadiness.cinematic=tier==='CINEMATIC'&&!!resources.cinematic
    postReadiness.ready=texturesReady.current&&(setting!=='CINEMATIC'||!!cinematic)
    try { resources.composer.render(delta); postReadiness.frames++ }
    catch (error) {
      failed.current = true; postReadiness.failure = `Post-processing disabled: ${String(error)}`
      postReadiness.ready = true; qualityStore.setState({notice:postReadiness.failure}); gl.setRenderTarget(null); gl.render(scene, camera)
    }
    }finally{probe?.endSubmission({tier,continuous:renderActivity.continuous})}
  }, 1)
  useEffect(() => () => { gl.info.autoReset = true }, [gl])
  return null
}
