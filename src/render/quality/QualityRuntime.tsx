import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, Group, InstancedMesh } from 'three'
import { disposeRuntimeMaterials, glassMaterial } from '../RuntimeMaterials'
import { unitRoundedBox } from '../geometry/roundedBox'
import { detectGpuCapabilities } from './gpuCapabilities'
import { qualityStore, useQualityStore } from './qualityStore'
import type { BodyRole } from './materialTypes'
import {renderActivity,requestAnimationFrameRender} from '../renderActivity'
import {graphicsRecovery} from '../graphicsRecovery'

/** Owns only material preparation and quality decisions, never the camera or scene model. */
export function QualityRuntime({ guidedMoving }: { guidedMoving(): boolean }) {
  const { gl, scene, camera, setDpr,invalidate } = useThree()
  const module = useQualityStore(state => state.cinematicModule)
  const status = useQualityStore(state => state.cinematicStatus)
  const contextLost = useQualityStore(state => state.contextLost)
  const active = useQualityStore(state => state.active)
  const previousPose = useRef<number[]>([])
  useEffect(() => {
    qualityStore.getState().initialize(detectGpuCapabilities(gl.getContext()))
    let recoveryTimer:ReturnType<typeof setTimeout>|null=null
    const recoveryExtension=gl.getContext().getExtension('WEBGL_lose_context')
    const retry=()=>{recoveryExtension?.restoreContext()}
    graphicsRecovery.retry=retry
    const lost = (event: Event) => {
      event.preventDefault(); qualityStore.getState().setContextLost(true)
      if(recoveryTimer)clearTimeout(recoveryTimer)
      recoveryTimer=setTimeout(()=>{if(qualityStore.getState().contextLost)qualityStore.setState({notice:'The World could not be restored'})},2000)
    }
    const restored = () => {if(recoveryTimer)clearTimeout(recoveryTimer);qualityStore.getState().initialize(detectGpuCapabilities(gl.getContext()));invalidate()}
    gl.domElement.addEventListener('webglcontextlost', lost)
    gl.domElement.addEventListener('webglcontextrestored', restored)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => qualityStore.getState().setOsReducedMotion(media.matches)
    changed(); media.addEventListener('change', changed)
    return () => {
      if(recoveryTimer)clearTimeout(recoveryTimer)
      if(graphicsRecovery.retry===retry)graphicsRecovery.retry=null
      gl.domElement.removeEventListener('webglcontextlost', lost)
      gl.domElement.removeEventListener('webglcontextrestored', restored)
      media.removeEventListener('change', changed)
      qualityStore.getState().setCompiled(false)
      disposeRuntimeMaterials()
    }
  }, [gl])
  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, active === 'CINEMATIC' ? 2 : 1.5))
  }, [active, setDpr])
  useEffect(() => {
    if (!module || contextLost || status !== 'ready') return
    let retired = false
    const preview = new Group()
    // Compile the actual instancing and transparent/opaque shader variants, with the live light rig.
    for (const tier of ['INTERACTIVE', 'CINEMATIC'] as const)
      for (const role of ['stack', 'heap', 'class', 'exception'] as BodyRole[])
        for (const emphasis of [1, .25]) {
          const mesh = new InstancedMesh(unitRoundedBox, glassMaterial(role, emphasis, tier), 1)
          if (role !== 'exception') mesh.setColorAt(0, new Color(1, 1, 1))
          preview.add(mesh)
        }
    void gl.compileAsync(preview, camera, scene).then(() => {
      if (!retired) qualityStore.getState().setCompiled(true)
    }).catch(error => {
      if (!retired) qualityStore.getState().reportFailure(`Cinematic shader preparation failed: ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => { for (const mesh of preview.children) (mesh as InstancedMesh).dispose(); preview.clear() })
    return () => { retired = true }
  }, [module, status, contextLost, gl, camera, scene])
  useFrame((_state, delta) => {
    const pose = [...camera.position.toArray(), ...camera.quaternion.toArray()]
    const prior = previousPose.current
    const changed = prior.length > 0 && pose.some((value, index) => Math.abs(value - prior[index]) > 1e-7)
    previousPose.current = pose
    qualityStore.getState().frame(performance.now(), renderActivity.continuous?delta * 1000:0, changed || guidedMoving())
    const state=qualityStore.getState()
    if(state.setting==='CINEMATIC'&&state.active==='INTERACTIVE'&&state.compiled&&!state.contextLost)requestAnimationFrameRender(invalidate)
  })
  return null
}
