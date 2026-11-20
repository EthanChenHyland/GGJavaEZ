import type { WebGLRenderer } from 'three'

export const framePerformanceCapacity = 16_384
export const framePerformancePendingLimit = 8

export type FrameGpuUnavailableReason =
  | 'webgl2-unavailable' | 'timer-extension-unavailable' | 'context-lost'
  | 'pending-limit' | 'disjoint' | 'query-allocation-failed' | 'query-already-active'
  | 'query-error' | 'invalid-timing-result' | 'disposed'

export interface FrameGpuObservation {
  readonly status: 'pending' | 'measured' | 'unavailable'
  readonly durationMs: number | null
  readonly reason: FrameGpuUnavailableReason | null
}

export interface FramePerformanceSample {
  readonly id: number
  readonly displayFrameId: number
  readonly frameStartedAtMs: number
  /** Includes demand-render idle time. This is not an FPS measurement. */
  readonly displayFrameIntervalMs: number | null
  readonly submissionStartedAtMs: number
  readonly cpuSubmissionMs: number
  readonly calls: number
  readonly triangles: number
  readonly geometries: number
  readonly textures: number
  readonly programs: number
  readonly tier: string
  readonly continuous: boolean
  readonly gpu: FrameGpuObservation
}

export interface FramePerformanceObservation {
  readonly capacity: number
  readonly maxPendingGpuQueries: number
  readonly disposed: boolean
  readonly contextLost: boolean
  readonly displayFrames: number
  readonly submittedFrames: number
  readonly droppedSamples: number
  readonly pendingGpuQueries: number
  readonly gpuSupport: 'available' | 'unavailable'
  readonly gpuUnavailableReason: FrameGpuUnavailableReason | null
  /** Lifetime totals, including samples that have left the bounded ring. */
  readonly gpuMeasuredSamples: number
  readonly gpuUnavailableSamples: number
  readonly gpuReasons: Readonly<Partial<Record<FrameGpuUnavailableReason, number>>>
  readonly lifecycleIssues: Readonly<Partial<Record<FrameLifecycleIssue, number>>>
  readonly samples: readonly FramePerformanceSample[]
}

export type FrameLifecycleIssue = 'begin-without-frame' | 'nested-begin' | 'end-without-begin'
  | 'duplicate-submission' | 'frame-replaced-during-submission' | 'disposed-during-submission'

export interface FramePerformanceProbe {
  startFrame(): void
  beginSubmission(): void
  endSubmission(metadata: { tier: string; continuous: boolean }): void
  snapshot(): FramePerformanceObservation
  dispose(): void
}

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
interface MutableSample extends Omit<FramePerformanceSample, 'gpu'> { gpu: FrameGpuObservation }
interface PendingQuery { query: WebGLQuery; sample: MutableSample }
interface ActiveSubmission {
  frameId: number
  frameStartedAtMs: number
  intervalMs: number | null
  startedAtMs: number
  query: WebGLQuery | null
  reason: FrameGpuUnavailableReason | null
}

const unavailable = (reason: FrameGpuUnavailableReason): FrameGpuObservation =>
  ({ status: 'unavailable', durationMs: null, reason })

/** Read-only QA sidecar for the real whole-display-frame render owner. The owner
 * resets gl.info before all passes; this module never resets it or wraps render.
 * GPU availability is polled once per pending query, without waiting or flushing. */
export function createFramePerformanceProbe(
  renderer: WebGLRenderer,
  options: { clock?: () => number } = {},
): FramePerformanceProbe {
  const clock = options.clock ?? (() => globalThis.performance.now())
  const ring: (MutableSample | undefined)[] = new Array(framePerformanceCapacity)
  const pending: PendingQuery[] = []
  const gpuReasons: Partial<Record<FrameGpuUnavailableReason, number>> = {}
  const lifecycleIssues: Partial<Record<FrameLifecycleIssue, number>> = {}
  let context: WebGL2RenderingContext | null = null
  let extension: TimerExtension | null = null
  let supportReason: FrameGpuUnavailableReason | null = 'webgl2-unavailable'
  let contextLost = false, disposed = false, displayFrames = 0, submittedFrames = 0
  let gpuMeasuredSamples = 0, gpuUnavailableSamples = 0
  let frameStartedAtMs: number | null = null, intervalMs: number | null = null
  let submittedDisplayFrame = 0
  let active: ActiveSubmission | null = null

  const issue = (reason: FrameLifecycleIssue) => { lifecycleIssues[reason] = (lifecycleIssues[reason] ?? 0) + 1 }
  const failSample = (sample: MutableSample, reason: FrameGpuUnavailableReason) => {
    sample.gpu = unavailable(reason)
    gpuUnavailableSamples++
    gpuReasons[reason] = (gpuReasons[reason] ?? 0) + 1
  }
  const deleteQuery = (query: WebGLQuery) => {
    try { context?.deleteQuery(query) } catch { /* Lost contexts may reject cleanup. */ }
  }
  const ownsActiveQuery = (query: WebGLQuery) => !context || !extension || typeof context.getQuery !== 'function'
    || context.getQuery(extension.TIME_ELAPSED_EXT, context.CURRENT_QUERY) === query
  const closeActiveQuery = (reason: FrameGpuUnavailableReason) => {
    if (!active?.query) return
    const query = active.query
    active.query = null
    active.reason = reason
    if (!contextLost && extension) {
      try {
        if (ownsActiveQuery(query)) context?.endQuery(extension.TIME_ELAPSED_EXT)
      } catch { /* Cleanup must not interrupt rendering. */ }
    }
    deleteQuery(query)
  }
  const discardPending = (reason: FrameGpuUnavailableReason) => {
    for (const entry of pending) { failSample(entry.sample, reason); deleteQuery(entry.query) }
    pending.length = 0
  }
  const acquireExtension = () => {
    try {
      extension = context?.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null
      supportReason = extension ? null : 'timer-extension-unavailable'
    } catch { extension = null; supportReason = 'query-error' }
  }

  try {
    const candidate = renderer.getContext()
    const queryContext = candidate as Partial<WebGL2RenderingContext>
    // Feature detection keeps the factory usable without DOM constructors and
    // rejects WebGL1's differently shaped timer extension.
    if (typeof queryContext.beginQuery === 'function' && typeof queryContext.endQuery === 'function'
      && typeof queryContext.createQuery === 'function' && typeof queryContext.deleteQuery === 'function'
      && typeof queryContext.getQueryParameter === 'function' && typeof queryContext.getParameter === 'function'
      && typeof queryContext.getExtension === 'function' && typeof queryContext.isContextLost === 'function') {
      context = candidate as WebGL2RenderingContext
      contextLost = context.isContextLost()
      if (contextLost) supportReason = 'context-lost'
      else acquireExtension()
    }
  } catch { supportReason = 'webgl2-unavailable' }

  const refreshContext = () => {
    if (!context) return
    let lost: boolean
    try { lost = context.isContextLost() }
    catch {
      discardPending('query-error'); closeActiveQuery('query-error')
      extension = null; supportReason = 'query-error'
      return
    }
    const wasLost = contextLost
    contextLost = lost
    if (lost) {
      discardPending('context-lost'); closeActiveQuery('context-lost')
      extension = null; supportReason = 'context-lost'
    } else if (wasLost) acquireExtension()
  }
  const pollGpu = () => {
    refreshContext()
    if (!context || !extension || contextLost) return
    try {
      if (context.getParameter(extension.GPU_DISJOINT_EXT)) {
        discardPending('disjoint'); closeActiveQuery('disjoint')
        return
      }
      // At most eight checks, with QUERY_RESULT read only after AVAILABLE=true.
      // Publish only after the final disjoint check, so a batch is not partly
      // accepted if harvesting it discovers an invalid timer period.
      const completed: { entry: PendingQuery; durationMs: number }[] = []
      for (const entry of pending) {
        if (!context.getQueryParameter(entry.query, context.QUERY_RESULT_AVAILABLE)) continue
        const result: unknown = context.getQueryParameter(entry.query, context.QUERY_RESULT)
        const durationMs = typeof result === 'number' ? result / 1e6 : NaN
        completed.push({ entry, durationMs })
      }
      if (completed.length && context.getParameter(extension.GPU_DISJOINT_EXT)) {
        discardPending('disjoint'); closeActiveQuery('disjoint')
        return
      }
      for (const { entry, durationMs } of completed) {
        if (Number.isFinite(durationMs) && durationMs >= 0) {
          entry.sample.gpu = { status: 'measured', durationMs, reason: null }
          gpuMeasuredSamples++
        } else failSample(entry.sample, 'invalid-timing-result')
        pending.splice(pending.indexOf(entry), 1)
        deleteQuery(entry.query)
      }
    } catch { discardPending('query-error'); closeActiveQuery('query-error') }
  }

  return {
    startFrame() {
      if (disposed) return
      const now = clock()
      if (active) {
        issue('frame-replaced-during-submission')
        closeActiveQuery('query-error'); active = null
      }
      intervalMs = frameStartedAtMs === null ? null : now - frameStartedAtMs
      frameStartedAtMs = now
      displayFrames++
      pollGpu()
    },
    beginSubmission() {
      if (disposed) return
      if (frameStartedAtMs === null) { issue('begin-without-frame'); return }
      if (active) { issue('nested-begin'); return }
      if (submittedDisplayFrame === displayFrames) { issue('duplicate-submission'); return }
      refreshContext()
      let query: WebGLQuery | null = null
      let reason = supportReason
      if (context && extension && !contextLost) {
        try {
          if (context.getParameter(extension.GPU_DISJOINT_EXT)) {
            discardPending('disjoint'); reason = 'disjoint'
          } else if (pending.length >= framePerformancePendingLimit) reason = 'pending-limit'
          else if (typeof context.getQuery === 'function' && context.getQuery(extension.TIME_ELAPSED_EXT, context.CURRENT_QUERY)) {
            reason = 'query-already-active'
          } else {
            query = context.createQuery()
            if (query) context.beginQuery(extension.TIME_ELAPSED_EXT, query)
            else reason = 'query-allocation-failed'
          }
        } catch { if (query) deleteQuery(query); query = null; reason = 'query-error' }
      }
      // Query setup/polling is outside CPU submission timing. The next caller
      // operation is the real composer.render (or the owner's full fallback).
      active = { frameId: displayFrames, frameStartedAtMs, intervalMs, startedAtMs: clock(), query, reason }
    },
    endSubmission(metadata) {
      if (disposed) return
      if (!active) { issue('end-without-begin'); return }
      const endedAtMs = clock()
      refreshContext()
      const submission = active
      const info = renderer.info
      const sample: MutableSample = {
        id: ++submittedFrames, displayFrameId: submission.frameId,
        frameStartedAtMs: submission.frameStartedAtMs, displayFrameIntervalMs: submission.intervalMs,
        submissionStartedAtMs: submission.startedAtMs, cpuSubmissionMs: endedAtMs - submission.startedAtMs,
        calls: info.render.calls, triangles: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
        tier: metadata.tier, continuous: metadata.continuous,
        gpu: { status: 'pending', durationMs: null, reason: null },
      }
      if (submission.query && context && extension) {
        try {
          if (ownsActiveQuery(submission.query)) {
            context.endQuery(extension.TIME_ELAPSED_EXT)
            pending.push({ query: submission.query, sample })
          } else { failSample(sample, 'query-error'); deleteQuery(submission.query) }
        } catch { failSample(sample, 'query-error'); deleteQuery(submission.query) }
      } else failSample(sample, submission.reason ?? 'query-error')
      ring[(sample.id - 1) % framePerformanceCapacity] = sample
      submittedDisplayFrame = submission.frameId
      active = null
    },
    snapshot() {
      if (!disposed) pollGpu()
      const length = Math.min(submittedFrames, framePerformanceCapacity)
      const first = submittedFrames - length
      const samples: FramePerformanceSample[] = []
      for (let index = 0; index < length; index++) {
        const sample = ring[(first + index) % framePerformanceCapacity]!
        samples.push(Object.freeze({ ...sample, gpu: Object.freeze({ ...sample.gpu }) }))
      }
      return Object.freeze({
        capacity: framePerformanceCapacity, maxPendingGpuQueries: framePerformancePendingLimit,
        disposed, contextLost, displayFrames, submittedFrames,
        droppedSamples: submittedFrames - length, pendingGpuQueries: pending.length,
        gpuSupport: extension && !contextLost ? 'available' : 'unavailable',
        gpuUnavailableReason: supportReason, gpuMeasuredSamples, gpuUnavailableSamples,
        gpuReasons: Object.freeze({ ...gpuReasons }), lifecycleIssues: Object.freeze({ ...lifecycleIssues }),
        samples: Object.freeze(samples),
      })
    },
    dispose() {
      if (disposed) return
      refreshContext()
      if (active) { issue('disposed-during-submission'); closeActiveQuery('disposed'); active = null }
      discardPending('disposed')
      disposed = true
    },
  }
}
