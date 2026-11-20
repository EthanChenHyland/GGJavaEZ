import type { TraceDocument } from '../contracts/runtime'
import { seek } from '../runtime/seek'
import { createLayoutEngine } from '../world/layoutEngine'
import { createSceneProjector, type ProjectionContext } from '../world/sceneProjector'

/** Test adapter for the production projection. Process termination is supplied
 * separately when a captured prefix ends before the actual JVM does. */
export function projectTrace(trace: TraceDocument, context: Partial<ProjectionContext> = {}) {
  const head = seek(trace, trace.events.length)
  const layout = createLayoutEngine()
  layout.append(trace.events)
  const projector = createSceneProjector(trace)
  const inputs: ProjectionContext = {
    sessionEnded: head.status === 'ended' || head.status === 'aborted',
    pausedAtLiveHead: false,
    liveHead: trace.events.length,
    recording: head.recordingStop ?? {
      state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false,
    },
    ...context,
  }
  return {
    layout: layout.state,
    project: (cursor: number) => projector.project(seek(trace, cursor), layout.state, inputs),
  }
}
