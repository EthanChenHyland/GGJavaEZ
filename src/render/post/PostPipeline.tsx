import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { interactivePipeline } from './interactivePipeline'
import { qualityStore, useQualityStore } from '../quality/qualityStore'
import {renderActivity} from '../renderActivity'
export const postReadiness = { ready: false, frames: 0, revision: 0, failure: '', cinematic:false }

/** Single render owner; effects never alter semantic data or the camera. */
export function PostPipeline() {
  const { gl, scene, camera, size, invalidate } = useThree()
  const tier = useQualityStore(state => state.active), contextLost = useQualityStore(state => state.contextLost)
  const setting=useQualityStore(state=>state.setting)
  const [cinematic,setCinematic]=useState<typeof import('./cinematicPasses')|null>(null)
  const requested=useRef(false),mounted=useRef(true),texturesReady=useRef(false)
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
  useFrame(() => { renderActivity.continuous=renderActivity.nextRequested;renderActivity.nextRequested=false; gl.info.autoReset = false; gl.info.reset() }, -100)
  useFrame((_state, delta) => {
    if (contextLost) return
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
  }, 1)
  useEffect(() => () => { gl.info.autoReset = true }, [gl])
  return null
}
