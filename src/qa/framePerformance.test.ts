import { describe, expect, it, vi } from 'vitest'
import type { WebGLRenderer } from 'three'
import {
  createFramePerformanceProbe, framePerformanceCapacity, framePerformancePendingLimit,
} from './framePerformance'

function fixture(timerAvailable = true) {
  let now = 0, lost = false, disjoint = false, allocationFails = false
  let current: WebGLQuery | null = null
  const queries: WebGLQuery[] = []
  const results = new Map<WebGLQuery, { available: boolean; nanoseconds: number }>()
  const extension = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb }
  const context = {
    QUERY_RESULT_AVAILABLE: 0x8867, QUERY_RESULT: 0x8866, CURRENT_QUERY: 0x8865,
    isContextLost: vi.fn(() => lost),
    getExtension: vi.fn((name: string) => name === 'EXT_disjoint_timer_query_webgl2' && timerAvailable ? extension : null),
    getParameter: vi.fn((name: number) => {
      if (name !== extension.GPU_DISJOINT_EXT) throw new Error('Unexpected parameter')
      return disjoint
    }),
    getQuery: vi.fn(() => current),
    createQuery: vi.fn(() => {
      if (allocationFails) return null
      const query = { fakeId: queries.length + 1 } as unknown as WebGLQuery
      queries.push(query); results.set(query, { available: false, nanoseconds: 2_500_000 })
      return query
    }),
    beginQuery: vi.fn((target: number, query: WebGLQuery) => {
      expect(target).toBe(extension.TIME_ELAPSED_EXT)
      if (current) throw new Error('A query is already active')
      current = query
    }),
    endQuery: vi.fn((target: number) => {
      expect(target).toBe(extension.TIME_ELAPSED_EXT)
      if (lost) throw new Error('Context lost')
      if (!current) throw new Error('No active query')
      current = null
    }),
    getQueryParameter: vi.fn((query: WebGLQuery, name: number) => {
      const result = results.get(query)!
      if (name === context.QUERY_RESULT_AVAILABLE) return result.available
      if (name !== context.QUERY_RESULT || !result.available) throw new Error('Synchronous result read')
      return result.nanoseconds
    }),
    deleteQuery: vi.fn((query: WebGLQuery) => { results.delete(query) }),
  }
  const renderer = {
    getContext: vi.fn(() => context), render: vi.fn(),
    info: {
      autoReset: false, reset: vi.fn(),
      render: { calls: 0, triangles: 0 }, memory: { geometries: 4, textures: 7 },
      programs: [{ name: 'body' }, { name: 'post' }],
    },
  }
  const probe = createFramePerformanceProbe(renderer as unknown as WebGLRenderer, { clock: () => now })
  return {
    probe, renderer, context, extension, queries,
    time(value: number) { now = value },
    loseContext(value: boolean) { lost = value; if (value) current = null },
    disjoint(value: boolean) { disjoint = value },
    failAllocation() { allocationFails = true },
    available(query: WebGLQuery, nanoseconds = 2_500_000) { results.set(query, { available: true, nanoseconds }) },
    externalQuery(query: WebGLQuery) { current = query },
  }
}

function renderSample(f: ReturnType<typeof fixture>, index: number, continuous = true) {
  f.time(index * 16); f.probe.startFrame()
  f.time(index * 16 + 1); f.probe.beginSubmission()
  f.renderer.info.render.calls = 30 + index
  f.renderer.info.render.triangles = 2_000 + index
  f.time(index * 16 + 5); f.probe.endSubmission({ tier: 'INTERACTIVE', continuous })
}

describe('whole-display-frame performance sidecar', () => {
  it('captures one full submission, including all owner passes, without changing renderer state', () => {
    const f = fixture(), originalRender = f.renderer.render, originalReset = f.renderer.info.reset
    f.time(0); f.probe.startFrame()
    f.time(2); f.probe.beginSubmission()
    // The real owner would accumulate scene/shadow/mask/post/fallback calls.
    f.renderer.info.render.calls += 100; f.renderer.info.render.triangles += 5_000
    f.renderer.info.render.calls += 42; f.renderer.info.render.triangles += 1_000
    f.time(8); f.probe.endSubmission({ tier: 'CINEMATIC', continuous: true })
    const report = f.probe.snapshot()
    expect(report.samples).toEqual([{
      id: 1, displayFrameId: 1, frameStartedAtMs: 0, displayFrameIntervalMs: null,
      submissionStartedAtMs: 2, cpuSubmissionMs: 6, calls: 142, triangles: 6_000,
      geometries: 4, textures: 7, programs: 2, tier: 'CINEMATIC', continuous: true,
      gpu: { status: 'pending', durationMs: null, reason: null },
    }])
    expect(report.pendingGpuQueries).toBe(1)
    expect(f.renderer.render).toBe(originalRender); expect(originalRender).not.toHaveBeenCalled()
    expect(f.renderer.info.reset).toBe(originalReset); expect(originalReset).not.toHaveBeenCalled()
    expect(f.renderer.info.autoReset).toBe(false)
    f.probe.dispose()
  })

  it('keeps demand idle intervals and skipped display submissions distinct from CPU duration', () => {
    const f = fixture(false)
    renderSample(f, 0, false)
    f.time(1_000); f.probe.startFrame() // A display frame whose owner does not submit.
    f.time(4_000); f.probe.startFrame()
    f.time(4_003); f.probe.beginSubmission()
    f.time(4_007); f.probe.endSubmission({ tier: 'INTERACTIVE', continuous: false })
    const report = f.probe.snapshot()
    expect(report.displayFrames).toBe(3); expect(report.submittedFrames).toBe(2)
    expect(report.samples[1]).toMatchObject({
      id: 2, displayFrameId: 3, frameStartedAtMs: 4_000,
      displayFrameIntervalMs: 3_000, cpuSubmissionMs: 4, continuous: false,
    })
    expect(report.gpuSupport).toBe('unavailable')
    expect(report.gpuUnavailableReason).toBe('timer-extension-unavailable')
    expect(report.samples.every(sample => sample.gpu.reason === 'timer-extension-unavailable')).toBe(true)
    expect(f.context.createQuery).not.toHaveBeenCalled()
    f.probe.dispose()
  })

  it('polls availability without reading unavailable results or requesting another frame', () => {
    const f = fixture()
    renderSample(f, 0)
    const before = f.probe.snapshot()
    for (let count = 0; count < 4; count++) f.probe.snapshot()
    expect(f.context.getQueryParameter.mock.calls.every(([, name]) => name === f.context.QUERY_RESULT_AVAILABLE)).toBe(true)
    expect(before.samples[0].gpu.status).toBe('pending')
    f.available(f.queries[0])
    const after = f.probe.snapshot()
    expect(after.samples[0].gpu).toEqual({ status: 'measured', durationMs: 2.5, reason: null })
    expect(after.gpuMeasuredSamples).toBe(1); expect(after.pendingGpuQueries).toBe(0)
    expect(before.samples[0].gpu.status).toBe('pending')
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(1)
    expect(f.context.deleteQuery).toHaveBeenCalledWith(f.queries[0])
    expect(f.context.getQueryParameter.mock.calls.filter(([, name]) => name === f.context.QUERY_RESULT)).toHaveLength(1)
    f.probe.dispose()
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(1)
  })

  it('resolves asynchronous results to their original sequential samples out of order', () => {
    const f = fixture()
    renderSample(f, 0); renderSample(f, 1)
    f.available(f.queries[1], 4_000_000)
    expect(f.probe.snapshot().samples.map(sample => sample.gpu.status)).toEqual(['pending', 'measured'])
    f.available(f.queries[0], 1_000_000)
    expect(f.probe.snapshot().samples.map(sample => [sample.id, sample.gpu.durationMs])).toEqual([[1, 1], [2, 4]])
    f.probe.dispose()
  })

  it('drops disjoint results and deletes every invalid pending query', () => {
    const f = fixture()
    renderSample(f, 0); renderSample(f, 1)
    f.available(f.queries[0]); f.available(f.queries[1]); f.disjoint(true)
    const report = f.probe.snapshot()
    expect(report.samples.every(sample => sample.gpu.reason === 'disjoint')).toBe(true)
    expect(report.gpuMeasuredSamples).toBe(0); expect(report.gpuReasons.disjoint).toBe(2)
    expect(report.pendingGpuQueries).toBe(0); expect(f.context.deleteQuery).toHaveBeenCalledTimes(2)
    expect(f.context.getQueryParameter.mock.calls.every(([, name]) => name !== f.context.QUERY_RESULT)).toBe(true)
    renderSample(f, 2)
    expect(f.probe.snapshot().samples[2].gpu.reason).toBe('disjoint')
    f.disjoint(false); renderSample(f, 3)
    expect(f.probe.snapshot().samples[3].gpu.status).toBe('pending')
    f.probe.dispose()
  })

  it('does not publish a partly measured harvest when the disjoint flag changes during it', () => {
    const f = fixture()
    renderSample(f, 0); renderSample(f, 1)
    f.available(f.queries[0]); f.available(f.queries[1])
    f.context.getParameter.mockImplementationOnce(() => false).mockImplementationOnce(() => true)
    const report = f.probe.snapshot()
    expect(report.gpuMeasuredSamples).toBe(0)
    expect(report.samples.map(sample => sample.gpu.reason)).toEqual(['disjoint', 'disjoint'])
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(2)
    f.probe.dispose()
  })

  it('caps pending queries at eight and reports queue omissions explicitly', () => {
    const f = fixture()
    for (let index = 0; index < framePerformancePendingLimit + 3; index++) renderSample(f, index)
    const report = f.probe.snapshot()
    expect(f.context.createQuery).toHaveBeenCalledTimes(8); expect(report.pendingGpuQueries).toBe(8)
    expect(report.gpuReasons['pending-limit']).toBe(3)
    expect(report.samples.slice(8).every(sample => sample.gpu.reason === 'pending-limit')).toBe(true)
    f.available(f.queries[0]); f.probe.snapshot(); renderSample(f, 11)
    expect(f.context.createQuery).toHaveBeenCalledTimes(9); expect(f.probe.snapshot().pendingGpuQueries).toBe(8)
    f.probe.dispose()
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(9)
  })

  it('bounds retained samples at 16384, preserving IDs, order, explicit drops and immutable snapshots', () => {
    const f = fixture(false)
    for (let index = 0; index < framePerformanceCapacity + 3; index++) renderSample(f, index)
    const report = f.probe.snapshot()
    expect(report.submittedFrames).toBe(16_387); expect(report.droppedSamples).toBe(3)
    expect(report.samples).toHaveLength(16_384)
    expect(report.samples[0].id).toBe(4); expect(report.samples.at(-1)!.id).toBe(16_387)
    expect(report.samples.every((sample, index) => sample.id === index + 4)).toBe(true)
    expect(Object.isFrozen(report)).toBe(true); expect(Object.isFrozen(report.samples)).toBe(true)
    expect(Object.isFrozen(report.samples[0])).toBe(true); expect(Object.isFrozen(report.samples[0].gpu)).toBe(true)
    expect(Object.isFrozen(report.gpuReasons)).toBe(true); expect(Object.isFrozen(report.lifecycleIssues)).toBe(true)
    renderSample(f, 16_387)
    expect(report.samples.at(-1)!.id).toBe(16_387)
    expect(f.probe.snapshot().samples.at(-1)!.id).toBe(16_388)
    f.probe.dispose()
  })

  it('releases pending and in-flight queries on repeated dispose without modifying renderer methods', () => {
    const f = fixture(), originalRender = f.renderer.render
    renderSample(f, 0); f.time(16); f.probe.startFrame(); f.probe.beginSubmission()
    f.probe.dispose(); f.probe.dispose()
    const calls = f.context.getQueryParameter.mock.calls.length
    const report = f.probe.snapshot()
    f.probe.startFrame(); f.probe.beginSubmission(); f.probe.endSubmission({ tier: 'IGNORED', continuous: true })
    expect(report.disposed).toBe(true); expect(report.pendingGpuQueries).toBe(0)
    expect(report.samples[0].gpu.reason).toBe('disposed')
    expect(report.lifecycleIssues['disposed-during-submission']).toBe(1)
    expect(f.probe.snapshot().submittedFrames).toBe(1)
    expect(f.context.getQueryParameter.mock.calls).toHaveLength(calls)
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(2)
    expect(f.context.endQuery).toHaveBeenCalledTimes(2)
    expect(f.renderer.render).toBe(originalRender)
    expect(f.renderer.info.reset).not.toHaveBeenCalled()
  })

  it('discards queries on context loss and reacquires the extension on restoration', () => {
    const f = fixture()
    renderSample(f, 0); f.time(16); f.probe.startFrame(); f.probe.beginSubmission()
    f.loseContext(true); f.time(20); f.probe.endSubmission({ tier: 'INTERACTIVE', continuous: true })
    const lost = f.probe.snapshot()
    expect(lost.contextLost).toBe(true); expect(lost.pendingGpuQueries).toBe(0)
    expect(lost.gpuUnavailableReason).toBe('context-lost')
    expect(lost.samples.every(sample => sample.gpu.reason === 'context-lost')).toBe(true)
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(2)
    expect(f.context.endQuery).toHaveBeenCalledTimes(1) // Never end a lost in-flight query.
    f.loseContext(false); renderSample(f, 2)
    expect(f.context.getExtension).toHaveBeenCalledTimes(2)
    const restored = f.probe.snapshot()
    expect(restored.contextLost).toBe(false); expect(restored.gpuSupport).toBe('available')
    expect(restored.samples[2].gpu.status).toBe('pending')
    f.probe.dispose()
  })

  it('works without a DOM WebGL2 constructor and reports unsupported context methods', () => {
    const renderer = { getContext: () => ({ getExtension: () => null }) } as unknown as WebGLRenderer
    const probe = createFramePerformanceProbe(renderer, { clock: () => 0 })
    expect(probe.snapshot().gpuUnavailableReason).toBe('webgl2-unavailable')
    expect(probe.snapshot().gpuSupport).toBe('unavailable')
    probe.dispose(); probe.dispose()
  })

  it('reports allocation failures, existing external queries and invalid GPU timing results', () => {
    const allocation = fixture(); allocation.failAllocation(); renderSample(allocation, 0)
    expect(allocation.probe.snapshot().samples[0].gpu.reason).toBe('query-allocation-failed')
    expect(allocation.context.beginQuery).not.toHaveBeenCalled(); allocation.probe.dispose()
    const external = fixture(); external.externalQuery({} as WebGLQuery); renderSample(external, 0)
    expect(external.probe.snapshot().samples[0].gpu.reason).toBe('query-already-active')
    expect(external.context.createQuery).not.toHaveBeenCalled(); external.probe.dispose()
    expect(external.context.endQuery).not.toHaveBeenCalled()
    const invalid = fixture(); renderSample(invalid, 0); invalid.available(invalid.queries[0], NaN)
    expect(invalid.probe.snapshot().samples[0].gpu.reason).toBe('invalid-timing-result')
    expect(invalid.context.deleteQuery).toHaveBeenCalledTimes(1); invalid.probe.dispose()
  })

  it('records lifecycle misuse without producing extra or mispaired samples', () => {
    const f = fixture()
    f.probe.beginSubmission(); f.probe.endSubmission({ tier: 'IGNORED', continuous: false })
    f.probe.startFrame(); f.probe.beginSubmission(); f.probe.beginSubmission()
    f.time(1); f.probe.startFrame() // Abandons and deletes the unfinished query.
    f.probe.beginSubmission(); f.time(5); f.probe.endSubmission({ tier: 'INTERACTIVE', continuous: true })
    f.probe.beginSubmission(); f.probe.endSubmission({ tier: 'IGNORED', continuous: false })
    const report = f.probe.snapshot()
    expect(report.submittedFrames).toBe(1); expect(report.samples[0].displayFrameId).toBe(2)
    expect(report.lifecycleIssues).toEqual({
      'begin-without-frame': 1, 'end-without-begin': 2, 'nested-begin': 1,
      'frame-replaced-during-submission': 1, 'duplicate-submission': 1,
    })
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(1)
    f.probe.dispose()
  })

  it('turns query API failures into explicit omissions and releases pending resources', () => {
    const f = fixture()
    renderSample(f, 0)
    f.context.getQueryParameter.mockImplementationOnce(() => { throw new Error('Driver query failure') })
    expect(f.probe.snapshot().samples[0].gpu.reason).toBe('query-error')
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(1)
    f.probe.dispose()
  })

  it('does not end an external query that replaces its own query during rendering', () => {
    const f = fixture()
    f.probe.startFrame(); f.probe.beginSubmission()
    f.externalQuery({} as WebGLQuery)
    f.time(5); f.probe.endSubmission({ tier: 'INTERACTIVE', continuous: true })
    expect(f.probe.snapshot().samples[0].gpu.reason).toBe('query-error')
    expect(f.context.endQuery).not.toHaveBeenCalled()
    expect(f.context.deleteQuery).toHaveBeenCalledTimes(1)
    f.probe.dispose()
    expect(f.context.endQuery).not.toHaveBeenCalled()
  })
})
