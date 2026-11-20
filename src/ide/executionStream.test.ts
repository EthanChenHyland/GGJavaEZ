import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionSession, RawTraceDelta } from '../execution/contracts'
import { bridge, type ExecutionStream } from './client'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>()
  readonly url: string
  closed = false
  onerror: (() => void) | null = null
  constructor(url: string) { this.url = url; FakeEventSource.instances.push(this) }
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  raw(data: string) {
    if (!this.closed) for (const listener of this.listeners.get('raw') ?? []) listener({ data } as MessageEvent<string>)
  }
  session(data: ExecutionSession) {
    if (!this.closed) for (const listener of this.listeners.get('session') ?? []) listener({data: JSON.stringify(data)} as MessageEvent<string>)
  }
  error() { if (!this.closed) this.onerror?.() }
  close() { this.closed = true }
}

const streams: ExecutionStream[] = []
const sessionId = 'session/with space'
const MiB = 1024 * 1024
const batch = (from: number, text = `record-${from}`): RawTraceDelta => ({
  version: 1, sessionId, fromSequence: from, toSequence: from + 1,
  events: [{ v: 1, seq: from, threadId: 'main', frameId: null, className: null, methodName: null,
    descriptor: null, line: null, site: null, type: 'console', channel: 'stdout', text }],
  recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: from, executionContinued: true },
})
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = () => done(undefined) })
  return { promise, resolve }
}
const flush = () => vi.advanceTimersByTimeAsync(0)
const from = (source: FakeEventSource) => new URL(source.url, 'http://transport.test').searchParams.get('from')
function open(onRaw: (delta: RawTraceDelta) => Promise<void>, nextSequence: () => number, onError: (error: unknown) => void) {
  const stream = bridge.executionEvents(sessionId, vi.fn(), onRaw, nextSequence, onError)
  streams.push(stream)
  return { stream, source: FakeEventSource.instances.at(-1)! }
}

/** The client accounts data.length * 2 before native JSON.parse coerces its input.
 * This test-only string surrogate exercises exact pressure branches with a tiny
 * valid JSON payload. It models queue accounting, not real transport/heap size. */
function accountedJson(delta: RawTraceDelta, bytes: number): string {
  const json = JSON.stringify(delta)
  expect(Number.isInteger(bytes / 2)).toBe(true)
  expect(bytes).toBeGreaterThanOrEqual(json.length * 2)
  return { length: bytes / 2, toString: () => json } as unknown as string
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('execution delta stream', () => {
  it('requests the existing 1024-event maximum from the committed raw cursor', () => {
    const nextSequence = vi.fn(() => 41)
    const { source } = open(vi.fn().mockResolvedValue(undefined), nextSequence, vi.fn())
    expect(source.url).toBe('/api/execution/session%2Fwith%20space/events?transport=delta&from=41&limit=1024')
    expect(nextSequence).toHaveBeenCalledTimes(1)
    expect(source.closed).toBe(false)
  })

  it('serializes onRaw commits and drains accepted work before reconnecting', async () => {
    let committed = 5
    const gate = deferred()
    const order: string[] = []
    const onRaw = vi.fn(async (delta: RawTraceDelta) => {
      expect(delta.fromSequence).toBe(committed)
      order.push(`start:${delta.fromSequence}`)
      if (delta.fromSequence === 5) await gate.promise
      committed = delta.toSequence
      order.push(`commit:${committed}`)
    })
    const nextSequence = vi.fn(() => committed), onError = vi.fn()
    const { source } = open(onRaw, nextSequence, onError)
    source.raw(JSON.stringify(batch(5)))
    source.raw(JSON.stringify(batch(6)))
    await flush()
    expect(onRaw).toHaveBeenCalledTimes(1)
    expect(committed).toBe(5)
    source.error()
    expect(source.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(nextSequence).toHaveBeenCalledTimes(1)
    gate.resolve()
    await flush()
    expect(order).toEqual(['start:5', 'commit:6', 'start:6', 'commit:7'])
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(from(FakeEventSource.instances[1])).toBe('7')
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a conflicting callback and reconnects from the last committed cursor', async () => {
    let committed = 0
    const conflict = new Error('Conflicting duplicate')
    const onRaw = vi.fn(async (delta: RawTraceDelta) => {
      if (delta.fromSequence !== committed) throw conflict
      committed = delta.toSequence
    })
    const onError = vi.fn()
    const { source } = open(onRaw, () => committed, onError)
    source.raw(JSON.stringify(batch(0)))
    await flush()
    expect(committed).toBe(1)
    source.raw(JSON.stringify(batch(0, 'conflicting-record')))
    await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(conflict)
    expect(committed).toBe(1)
    expect(source.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(199)
    expect(FakeEventSource.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeEventSource.instances).toHaveLength(2)
    const resumed = FakeEventSource.instances[1]
    expect(from(resumed)).toBe('1')
    source.raw(JSON.stringify(batch(99)))
    resumed.raw(JSON.stringify(batch(1)))
    await flush()
    expect(onRaw).toHaveBeenCalledTimes(3)
    expect(committed).toBe(2)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('close skips queued parsing/callbacks and a reconnect already waiting for the drain', async () => {
    const gate = deferred(), onError = vi.fn()
    let committed = 0
    const onRaw = vi.fn(async (delta: RawTraceDelta) => { await gate.promise; committed = delta.toSequence })
    const { stream, source } = open(onRaw, () => committed, onError)
    source.raw(JSON.stringify(batch(0)))
    source.raw('not-json-queued-before-close')
    source.raw(JSON.stringify(batch(1)))
    await flush()
    expect(onRaw).toHaveBeenCalledTimes(1)
    source.error()
    await vi.advanceTimersByTimeAsync(200)
    expect(FakeEventSource.instances).toHaveLength(1)
    stream.close()
    gate.resolve()
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(onRaw).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(committed).toBe(1)
    expect(source.closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps an exact 2 MiB queued boundary and retries excess from the drained cursor', async () => {
    let committed = 0
    const gate = deferred(), onError = vi.fn()
    const onRaw = vi.fn(async (delta: RawTraceDelta) => {
      expect(delta.fromSequence).toBe(committed)
      if (delta.fromSequence === 0) await gate.promise
      committed = delta.toSequence
    })
    const { source } = open(onRaw, () => committed, onError)
    const first = JSON.stringify(batch(0))
    source.raw(first)
    source.raw(accountedJson(batch(1), 2 * MiB - first.length * 2))
    expect(source.closed).toBe(false)
    source.raw(JSON.stringify(batch(2)))
    expect(source.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(onRaw).toHaveBeenCalledTimes(1)
    gate.resolve()
    await flush()
    expect(committed).toBe(2)
    expect(onRaw.mock.calls.map(([delta]) => delta.fromSequence)).toEqual([0, 1])
    expect(FakeEventSource.instances).toHaveLength(2)
    const resumed = FakeEventSource.instances[1]
    expect(from(resumed)).toBe('2')
    resumed.raw(JSON.stringify(batch(2)))
    await flush()
    expect(committed).toBe(3)
    expect(onError).not.toHaveBeenCalled()
  })

  it('accepts one exact 17 MiB indivisible frame while empty, with no second queued exception', async () => {
    let committed = 0
    const gate = deferred(), onError = vi.fn()
    const onRaw = vi.fn(async (delta: RawTraceDelta) => { await gate.promise; committed = delta.toSequence })
    const { source } = open(onRaw, () => committed, onError)
    source.raw(accountedJson(batch(0), 17 * MiB))
    await flush()
    expect(onRaw).toHaveBeenCalledTimes(1)
    expect(onRaw).toHaveBeenCalledWith(batch(0))
    expect(source.closed).toBe(false)
    source.raw(JSON.stringify(batch(1)))
    expect(source.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(FakeEventSource.instances).toHaveLength(1)
    gate.resolve()
    await flush()
    expect(committed).toBe(1)
    expect(onRaw).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(from(FakeEventSource.instances[1])).toBe('1')
    expect(onError).not.toHaveBeenCalled()
  })

  it('rejects a frame above the empty-queue 17 MiB ceiling without advancing the cursor', async () => {
    let committed = 0
    const onError = vi.fn()
    const onRaw = vi.fn(async (delta: RawTraceDelta) => { committed = delta.toSequence })
    const { source } = open(onRaw, () => committed, onError)
    source.raw(accountedJson(batch(0), 17 * MiB + 2))
    expect(source.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(onRaw).not.toHaveBeenCalled()
    expect(committed).toBe(0)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(from(FakeEventSource.instances[1])).toBe('0')
    FakeEventSource.instances[1].raw(JSON.stringify(batch(0)))
    await flush()
    expect(committed).toBe(1)
    expect(onError).not.toHaveBeenCalled()
  })
})


function metadata(phase:ExecutionSession['phase'],count:number,revision=1):ExecutionSession{
 return {id:sessionId,revision,projectId:'project',mainClass:'Main',kind:'run',phase,support:'FULL',supportReason:null,build:null,
  rawEvents:[],rawEventCount:count,transportVersion:1,sourceManifest:{sources:[],classes:[]},capability:null,
  stdout:'',stderr:'',runEvents:[],pause:null,breakpoints:[],terminalStatus:phase==='COMPLETED'?'complete':phase==='STOPPED'?'unsupported':null,exitCode:phase==='COMPLETED'?0:null,
  diagnostic:null,failureKind:null,startedAt:'1970-01-01T00:00:00.000Z'}
}
describe('finished execution stream ownership',()=>{
 it('drains the terminal recorded prefix before closing and cancels a pending reconnect',async()=>{
  let committed=0;const gate=deferred(),onError=vi.fn()
  const {source}=open(async delta=>{if(delta.fromSequence===0)await gate.promise;committed=delta.toSequence},()=>committed,onError)
  source.session(metadata('COMPLETED',2));expect(source.closed).toBe(false)
  source.raw(JSON.stringify(batch(0)));source.raw(JSON.stringify(batch(1)));await flush()
  expect(committed).toBe(0);expect(source.closed).toBe(false)
  source.error();await vi.advanceTimersByTimeAsync(200);expect(FakeEventSource.instances).toHaveLength(1)
  gate.resolve();await flush();await vi.advanceTimersByTimeAsync(1000)
  expect(committed).toBe(2);expect(source.closed).toBe(true);expect(FakeEventSource.instances).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0);expect(onError).not.toHaveBeenCalled()
 })
 it.each(['COMPLETED','FAILED','STOPPED'] as const)('retires a caught-up %s stream without reconnecting',async phase=>{
  const {source}=open(vi.fn().mockResolvedValue(undefined),()=>2,vi.fn())
  source.session(metadata(phase,2));expect(source.closed).toBe(true)
  source.error();await vi.advanceTimersByTimeAsync(1000);expect(FakeEventSource.instances).toHaveLength(1)
 })
 it.each(['RUNNING','WAITING_FOR_INPUT','PAUSED'] as const)('retains %s observation even when a partial recording is caught up',async phase=>{
  const {source}=open(vi.fn().mockResolvedValue(undefined),()=>2,vi.fn()),session=metadata(phase,2)
  session.recording={state:'STOPPED_LIMIT',reason:'Object observation limit reached',budget:'objects',lastRecordedSeq:1,executionContinued:true}
  source.session(session);expect(source.closed).toBe(false)
  source.session({...session,phase:'COMPLETED',revision:2});expect(source.closed).toBe(true)
 })
 it('ignores older and foreign terminal heads for retirement',()=>{
  const {source}=open(vi.fn().mockResolvedValue(undefined),()=>0,vi.fn())
  source.session(metadata('RUNNING',0,3));source.session(metadata('COMPLETED',0,2));expect(source.closed).toBe(false)
  source.session({...metadata('COMPLETED',0,4),id:'another-session'});expect(source.closed).toBe(false)
  source.session(metadata('COMPLETED',0,4));expect(source.closed).toBe(true)
 })
 it('uses the full snapshot length for retained sessions without a delta count',async()=>{
  let committed=1
  const {source}=open(async delta=>{committed=delta.toSequence},()=>committed,vi.fn()),session=metadata('COMPLETED',2)
  delete session.rawEventCount;session.rawEvents=[...batch(0).events,...batch(1).events]
  source.session(session);expect(source.closed).toBe(false)
  source.raw(JSON.stringify(batch(1)));await flush();expect(committed).toBe(2);expect(source.closed).toBe(true)
 })
})


it('preserves raw-error reporting and reconnect when terminal metadata arrives behind a queued bad packet',async()=>{
 const onError=vi.fn(),onRaw=vi.fn().mockResolvedValue(undefined)
 const {source}=open(onRaw,()=>2,onError)
 source.raw('invalid-queued-json');source.session(metadata('COMPLETED',2));await flush()
 expect(onError).toHaveBeenCalledOnce();expect(onRaw).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(200);expect(FakeEventSource.instances).toHaveLength(2)
 const resumed=FakeEventSource.instances[1];expect(from(resumed)).toBe('2');expect(resumed.closed).toBe(false)
 resumed.session(metadata('COMPLETED',2,2));expect(resumed.closed).toBe(true)
})


it('keeps observing a stop request until the JVM terminal status and later raw head arrive',async()=>{
 let committed=2
 const {source}=open(async delta=>{committed=delta.toSequence},()=>committed,vi.fn())
 source.session({...metadata('STOPPED',2),terminalStatus:null,exitCode:null});expect(source.closed).toBe(false)
 source.session(metadata('STOPPED',3,2));expect(source.closed).toBe(false)
 source.raw(JSON.stringify(batch(2)));await flush();expect(committed).toBe(3);expect(source.closed).toBe(true)
})


it('retires a stopped legacy process with its final exit code even without a terminal-status label',()=>{
 const {source}=open(vi.fn().mockResolvedValue(undefined),()=>2,vi.fn())
 source.session({...metadata('STOPPED',2),terminalStatus:null,exitCode:143});expect(source.closed).toBe(true)
})
