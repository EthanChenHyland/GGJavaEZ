import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, InstancedMesh } from 'three'
import { disposeRuntimeMaterials, glassMaterial, unitBox } from '../RuntimeMaterials'
import { detectGpuCapabilities } from './gpuCapabilities'
import { qualityStore, useQualityStore } from './qualityStore'
import type { BodyRole } from './materialTypes'

/** Owns only material preparation and quality decisions, never the camera or scene model. */
export function QualityRuntime({ guidedMoving }: { guidedMoving(): boolean }) {
  const { gl, scene, camera, setDpr } = useThree()
  const module = useQualityStore(state => state.cinematicModule)
  const status = useQualityStore(state => state.cinematicStatus)
  const contextLost = useQualityStore(state => state.contextLost)
  const active = useQualityStore(state => state.active)
  const previousPose = useRef<number[]>([])
  useEffect(() => {
    qualityStore.getState().initialize(detectGpuCapabilities(gl.getContext()))
    const lost = (event: Event) => { event.preventDefault(); qualityStore.getState().setContextLost(true) }
    const restored = () => qualityStore.getState().initialize(detectGpuCapabilities(gl.getContext()))
    gl.domElement.addEventListener('webglcontextlost', lost)
    gl.domElement.addEventListener('webglcontextrestored', restored)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => qualityStore.getState().setOsReducedMotion(media.matches)
    changed(); media.addEventListener('change', changed)
    return () => {
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
      for (const role of ['stack', 'heap', 'class'] as BodyRole[])
        for (const emphasis of [1, .25]) {
          const mesh = new InstancedMesh(unitBox, glassMaterial(role, emphasis, tier), 1)
          mesh.receiveShadow = true; mesh.castShadow = true; preview.add(mesh)
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
    qualityStore.getState().frame(performance.now(), delta * 1000, changed || guidedMoving())
  })
  return null
}
