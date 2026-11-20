import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ConsoleEntry, TraceDocument } from '../contracts/runtime'
import type { ExecutionSession } from '../execution/contracts'
import { bindConsole, type ConsoleBindingInput } from './consoleBinding'
import { BoundConsoleOutput } from './BoundConsoleOutput'

const trace: TraceDocument = {schemaVersion:2,demoId:'opaque-recording',sourceFiles:[],events:[]}
const entries: ConsoleEntry[] = [{eventId:'opaque-event',frameId:null,source:null,kind:'output',text:'old\n',value:{kind:'stringSummary',javaType:'String',value:'old\n'}}]
const session = (id:string,phase:ExecutionSession['phase']='COMPLETED'):ExecutionSession => ({
  id,revision:1,projectId:'project',mainClass:'Main',kind:'run',phase,support:'FULL',supportReason:null,
  build:null,rawEvents:[],sourceManifest:{sources:[],classes:[]},capability:null,stdout:`${id}\n`,stderr:'',runEvents:[],
  pause:null,breakpoints:[],terminalStatus:null,exitCode:null,diagnostic:null,failureKind:null,startedAt:'2026-10-11T00:00:00Z',
})
const old = session('opaque-session'), input = (changes:Partial<ConsoleBindingInput>={}):ConsoleBindingInput => ({
  visualization:{sessionId:old.id,trace},runtimeRecordingId:trace.demoId,entries,execution:old,worldExecution:old,...changes,
})
describe('World-associated Console binding', () => {
  it('prefers current metadata only when the actual recorded session identity matches', () => {
    const current = {...old,revision:2,stdout:'latest\n'}
    const binding = bindConsole(input({execution:current}))
    expect(binding.session).toBe(current); expect(binding.entries).toBe(entries); expect(binding.pending).toBeNull()
  })
  it.each(['BUILDING','STARTING','WAITING_FOR_INPUT','FAILED'] as const)('retains the old Console through a distinct %s attempt', phase => {
    const attempt = session('new-attempt',phase), binding = bindConsole(input({execution:attempt}))
    expect(binding.session).toBe(old); expect(binding.entries).toBe(entries); expect(binding.pending).toBe(attempt)
    expect(binding.historical).toBe(true); expect(binding.recordingId).toBe(trace.demoId)
  })
  it('rejects unrelated retained metadata and a stale runtime prefix without guessing IDs', () => {
    const binding = bindConsole(input({execution:session('new'),worldExecution:session('unrelated'),runtimeRecordingId:'other-recording'}))
    expect(binding.session).toBeNull(); expect(binding.entries).toEqual([]); expect(binding.pending?.id).toBe('new')
  })
  it('keeps curated recording output independent of workspace pipes, archives and attempts', () => {
    const recording = {...trace,demoId:'curated-recording'}
    const binding = bindConsole(input({recording,runtimeRecordingId:recording.demoId}))
    expect(binding.session).toBeNull(); expect(binding.pending).toBeNull(); expect(binding.entries).toBe(entries)
    expect(binding.recordingId).toBe(recording.demoId)
  })
  it('uses process output alone when no recording has committed', () => {
    const current = session('first-attempt','WAITING_FOR_INPUT')
    const binding = bindConsole(input({visualization:null,execution:current,worldExecution:null}))
    expect(binding.recorded).toBe(false); expect(binding.session).toBe(current); expect(binding.entries).toEqual([])
  })
  it('renders retained archive controls under their session and new output under the pending attempt', () => {
    const retained = {...old,outputTruncated:true,outputArchiveAvailable:true}
    const html = renderToStaticMarkup(createElement(BoundConsoleOutput,{...input({worldExecution:retained,execution:session('new-attempt','FAILED')}),build:null}))
    expect(html).toContain('aria-label="Previous run console"'); expect(html).toContain('aria-label="Current attempt console"')
    expect(html).toContain('data-console-session="opaque-session"'); expect(html).toContain('data-console-session="new-attempt"')
    expect(html.match(/href="\/api\/execution\/opaque-session\/output\/stdout"/g)).toHaveLength(1)
    expect(html).not.toContain('/api/execution/new-attempt/output/stdout')
  })
  it('renders curated prefix content without another execution’s process output or archive controls', () => {
    const recording = {...trace,demoId:'curated-recording'}
    const html = renderToStaticMarkup(createElement(BoundConsoleOutput,{...input({recording,runtimeRecordingId:recording.demoId}),build:null}))
    expect(html).toContain('data-console-recording="curated-recording"'); expect(html).toContain('console-line-preview">old')
    expect(html).not.toContain('opaque-session'); expect(html).not.toContain('Full process output')
  })
})
