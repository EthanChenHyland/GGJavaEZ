import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

interface FrameProbe {
  startedAt: number
  renders: number
  cpuMs: number[]
  intervalsMs: number[]
  gpuMs: number[]
  gpuDisjointDrops: number
  gpuTimer: 'available' | 'unavailable'
  renderer: Record<string, number | string | boolean>
}
declare global {
  interface Window {
    __VJ_QA_FRAME_PROBE__?: boolean
    __VJ_FRAME_PROBE__?: FrameProbe
  }
}
const capacity = 4096
function sample(values: number[], index: number, value: number) { values[index % capacity] = value }

/** Opt-in local development probe, absent from production. Times the existing
 * renderer submission and asynchronous GPU query, never scene traversal or a
 * synchronous GPU wait. Demand-render intervals are not display refresh/FPS.
 * Bounded rings and at most eight pending queries cannot retain a session. */
export function FrameProfiler() {
  const gl = useThree(state => state.gl)
  useEffect(() => {
    const context = gl.getContext()
    if (!(context instanceof WebGL2RenderingContext)) return
    const extension = context.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
    const original = gl.render
    const pending: WebGLQuery[] = []
    let report: FrameProbe | undefined, previousTime = 0, gpuSamples = 0, rendering = false
    const discard = () => { for (const query of pending) context.deleteQuery(query); pending.length = 0 }
    const render: typeof gl.render = (scene, camera) => {
      if (!window.__VJ_QA_FRAME_PROBE__ || rendering) {
        if (!window.__VJ_QA_FRAME_PROBE__ && report) { discard(); report = undefined }
        return original.call(gl, scene, camera)
      }
      if (!report) {
        report = { startedAt: performance.now(), renders: 0, cpuMs: [], intervalsMs: [], gpuMs: [], gpuDisjointDrops: 0,
          gpuTimer: extension ? 'available' : 'unavailable', renderer: {} }
        window.__VJ_FRAME_PROBE__ = report; previousTime = 0; gpuSamples = 0
      }
      if (extension) {
        if (context.getParameter(extension.GPU_DISJOINT_EXT)) { report.gpuDisjointDrops += pending.length; discard() }
        else while (pending.length && context.getQueryParameter(pending[0], context.QUERY_RESULT_AVAILABLE)) {
          const query = pending.shift()!
          sample(report.gpuMs, gpuSamples++, Number(context.getQueryParameter(query, context.QUERY_RESULT)) / 1e6)
          context.deleteQuery(query)
        }
      }
      const query = extension && pending.length < 8 ? context.createQuery() : null
      const start = performance.now()
      if (previousTime) sample(report.intervalsMs, report.renders - 1, start - previousTime)
      previousTime = start
      if (query) context.beginQuery(extension!.TIME_ELAPSED_EXT, query)
      rendering = true
      try { original.call(gl, scene, camera) }
      finally {
        rendering = false
        if (query) { context.endQuery(extension!.TIME_ELAPSED_EXT); pending.push(query) }
        sample(report.cpuMs, report.renders++, performance.now() - start)
        report.renderer = { drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0,
          pixelRatio: gl.getPixelRatio(), shadows: gl.shadowMap.enabled, toneMapping: gl.toneMapping,
          outputColorSpace: gl.outputColorSpace, pendingQueries: pending.length, gpuSamples, ringCapacity: capacity }
      }
    }
    gl.render = render
    return () => { if (gl.render === render) gl.render = original; discard() }
  }, [gl])
  return null
}
