import type { TraceDocument } from '../contracts/runtime'
import type { VisualizationCapabilityReport } from '../instrumentation/contracts'
import { normalizeTrace } from '../instrumentation/normalize'
import { validateTrace } from '../runtime/trace'
import { bridge } from './client'
import type { VisualizeResponse } from './contracts'
import type { LaunchConfiguration } from './javaProject'

export interface PreparedVisualization {
  response: VisualizeResponse
  trace: TraceDocument | null
  capability: VisualizationCapabilityReport | null
  normalizeMs: number
}

/** The UI receives a semantic trace; recorder-specific facts stay at this boundary. */
export async function visualizeProject(projectId: string, mainClass: string, launch?: LaunchConfiguration): Promise<PreparedVisualization> {
  const response = await bridge.visualize(projectId, mainClass, launch)
  if (!response.build.success || response.status === 'compile_failed') {
    return { response, trace: null, capability: response.capability, normalizeMs: 0 }
  }
  const start = performance.now()
  const normalized = normalizeTrace(response.rawEvents, response.sourceManifest, {
    status: response.status,
    exitCode: response.exitCode,
    diagnostic: response.diagnostic,
    ...(response.capability ? { capability: response.capability } : {}),
  }, `real:${projectId}:${response.build.elapsedMs}:${response.rawEvents.length}`)
  const trace = validateTrace(normalized.trace)
  trace.capture = { origin: 'jvm', sourceHashes: Object.fromEntries(response.sourceManifest.sources.map((source) => [source.fileId, source.sha256])),
    recordedAt: new Date().toISOString() }
  return { response, trace, capability: normalized.capability, normalizeMs: performance.now() - start }
}
