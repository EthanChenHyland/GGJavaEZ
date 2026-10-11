import { useMemo } from 'react'
import type { ConsoleEntry } from '../contracts/runtime'
import type { ExecutionSession } from '../execution/contracts'
import type { BuildResult } from '../ide/contracts'
import { ConsoleLines } from './ConsoleLines'
import type { ConsoleChunk } from './consoleLineIndex'

/** Recorder-prefix and process-pipe output have separate proven ownership.
 * No text-equality deduplication or fabricated cross-channel order. */
export function ConsoleOutput({ build, execution, hasRecording, entries }: {
  build: BuildResult | null; execution: ExecutionSession | null;
  hasRecording: boolean; entries: readonly ConsoleEntry[];
}) {
  const recorded = useMemo<ConsoleChunk[]>(() => entries.map(entry => ({ key: entry.eventId,
    channel: entry.kind === 'input' ? 'stdin' : entry.channel ?? 'stdout', text: entry.text })), [entries])
  const ordered = useMemo<ConsoleChunk[]>(() => (execution?.runEvents ?? []).map(event => ({ key: String(event.id), channel: event.kind,
    text: event.kind === 'exit' ? event.signal ? `Process stopped (${event.signal})` : `Process finished with exit code ${event.exitCode ?? '—'}` : event.text ?? '' })), [execution?.runEvents])
  const buildChunks = useMemo<ConsoleChunk[]>(() => build?.rawOutput && !build.success ? [{ key: 'build', channel: 'stderr', text: build.rawOutput }] : [], [build])
  const stdout = useMemo<ConsoleChunk[]>(() => [{ key: 'pipe:stdout', channel: 'stdout', text: execution?.stdout ?? '' }], [execution?.stdout])
  const stderr = useMemo<ConsoleChunk[]>(() => [{ key: 'pipe:stderr', channel: 'stderr', text: execution?.stderr ?? '' }], [execution?.stderr])
  const partial = hasRecording && execution?.recording && execution.recording.state !== 'FULL'
  const pipe = <>
    <p className="console-order-note">Process output · cross-channel order not recorded{hasRecording ? ' · order relative to recorded console not recorded' : ''}</p>
    <ConsoleLines chunks={stdout} label="stdout"/><ConsoleLines chunks={stderr} label="stderr"/>
  </>
  return <>
    {!!buildChunks.length && <ConsoleLines chunks={buildChunks} label="Build output"/>}
    {partial ? <><p className="console-order-note">Visualization partial{execution.exitCode !== null ? ` · Java exit code ${execution.exitCode}` : ''}</p>{pipe}</> : hasRecording ? <>
      <ConsoleLines chunks={recorded} label="Recorded console"/>
      {execution && <details className="ide-console-terminal"><summary>{execution.outputTruncated ? 'Retained process output' : 'Full process output'}</summary>{pipe}</details>}
    </> : ordered.length ? <ConsoleLines chunks={ordered} label="Ordered process events"/> : execution?.failureKind === 'build' ? <p className="console-order-note">No program output · build failed</p> : execution ? pipe : null}
    {execution?.outputTruncated && <p className="console-output-boundary">Inline console retention limit reached here; Java continued. {execution.outputArchiveAvailable ? <>
      <a href={`/api/execution/${execution.id}/output/stdout`} download>Download complete stdout</a> · <a href={`/api/execution/${execution.id}/output/stderr`} download>Download complete stderr</a>
    </> : 'Complete output archive unavailable.'}</p>}
    {execution?.outputArchiveError && <p className="console-output-boundary">Process output archive failed: {execution.outputArchiveError}. Java execution continued.</p>}
    {!execution && !hasRecording && !buildChunks.length && <p className="ide-empty">Program output appears here when you run Java.</p>}
  </>
}
