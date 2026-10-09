/**
 * Seeded synthetic Recorder (raw NDJSON v1) generator — spec task 0.3.
 * Produces valid raw streams with a configurable shape, so normalization, replay, layout
 * and scene costs can be measured at sizes the real Recorder cannot reach today.
 * It contains no fixture names: classes are G0..Gk, methods m0..mk, fields f0..fk.
 */
import type { RawRuntimeEvent, RawValue } from '../instrumentation/contracts'
import type { InstrumentationSourceManifest } from '../instrumentation/normalize'

export interface TraceShape {
  /** Target number of raw events (the generator stops at the first frame-balanced point after it). */
  rawEvents: number
  seed?: number
  classes?: number
  fieldsPerObject?: number
  maxDepth?: number
  /** Probability a statement is a call (vs. local/field write). */
  callRate?: number
  /** Probability a call allocates a new project object (receiver). */
  allocateRate?: number
  linesPerFile?: number
  /** Emit recorded provenance recipes as well as the legacy observer stream. */
  provenance?: boolean
}

export interface GeneratedTrace {
  rawEvents: RawRuntimeEvent[]
  manifest: InstrumentationSourceManifest
  stats: { invocations: number; objects: number; maxDepth: number }
}

function rng(seed: number) {
  let state = seed >>> 0 || 1
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 }
}

export function generateRawTrace(shape: TraceShape): GeneratedTrace {
  const { rawEvents: target, seed = 7, classes = 12, fieldsPerObject = 4, maxDepth = 12, callRate = 0.18, allocateRate = 0.25, linesPerFile = 400, provenance = false } = shape
  const random = rng(seed)
  const pick = (n: number) => Math.floor(random() * n)
  const events: RawRuntimeEvent[] = []
  const classNames = Array.from({ length: classes }, (_, i) => `gen.G${i}`)
  const objectsByClass: string[][] = classNames.map(() => [])
  let objectSeq = 0, frameSeq = 0, invocations = 0, deepest = 0
  type Frame = { id: string; className: string; method: string; line: number; locals: Map<number, RawValue>; receiver: string | null }
  const stack: Frame[] = []
  const base = (type: string, frame: Frame | null, extra: object, className?: string | null): RawRuntimeEvent => ({
    v: 1, ...(provenance ? { provenanceVersion: 1 } : {}), seq: events.length, threadId: '1', type, frameId: frame?.id ?? null,
    className: className !== undefined ? className : frame?.className ?? null, methodName: frame?.method ?? null,
    descriptor: frame ? '(I)I' : null, line: frame ? frame.line : null, site: 0, ...extra,
  } as unknown as RawRuntimeEvent)
  const int = (value: number): RawValue => ({ kind: 'int', value })
  const allocate = (classIndex: number): string => {
    const objectId = `o${++objectSeq}`
    const fields = Array.from({ length: fieldsPerObject }, (_, i) => ({ owner: classNames[classIndex], name: `f${i}`, descriptor: 'I', value: int(0) }))
    const peer = objectsByClass[classIndex].at(-1)
    fields.push({ owner: classNames[classIndex], name: 'next', descriptor: `L${classNames[classIndex].replace('.', '/')};`, value: peer ? { kind: 'ref', objectId: peer, className: classNames[classIndex] } as RawValue : { kind: 'null' } })
    events.push(base('object', stack.at(-1) ?? null, { objectId, fields }, classNames[classIndex]))
    objectsByClass[classIndex].push(objectId)
    return objectId
  }
  const enter = (caller: Frame | null) => {
    const classIndex = pick(classes)
    const className = classNames[classIndex]
    const receiver = random() < allocateRate || !objectsByClass[classIndex].length
      ? allocate(classIndex) : objectsByClass[classIndex][pick(objectsByClass[classIndex].length)]
    const frame: Frame = { id: `f${++frameSeq}`, className, method: `m${pick(8)}`, line: 1 + pick(linesPerFile), locals: new Map(), receiver }
    const parameter = int(pick(100))
    frame.locals.set(1, parameter)
    events.push(base('enter', frame, { callerFrameId: caller?.id ?? null,
      receiver: { kind: 'ref', objectId: receiver, className },
      parameters: [{ slot: 1, name: 'p', descriptor: 'I', liveRange: '1:0:999', value: parameter }] }))
    stack.push(frame); invocations++; deepest = Math.max(deepest, stack.length - 1)
  }
  const exit = () => {
    const frame = stack.at(-1)!
    const source = provenance ? [...frame.locals.entries()].at(-1) : undefined
    const value = source?.[1] ?? int(pick(1000))
    events.push(base('return', frame, { value, ...(provenance ? { origin: source ? { kind: 'local', slot: source[0] } : { kind: 'constant', value } } : {}) }))
    events.push(base('exit', frame, {}))
    stack.pop()
  }
  // main(): static, void, no receiver.
  const main: Frame = { id: `f${++frameSeq}`, className: classNames[0], method: 'main', line: 1, locals: new Map(), receiver: null }
  events.push({ ...base('enter', main, { callerFrameId: null, receiver: null, parameters: [] }), descriptor: '()V' } as RawRuntimeEvent)
  stack.push(main); invocations++
  while (events.length < target) {
    const frame = stack.at(-1)!
    frame.line = 1 + pick(linesPerFile)
    events.push({ ...base('line', frame, {}), ...(frame === main ? { descriptor: '()V' } : {}) } as RawRuntimeEvent)
    const roll = random()
    if (roll < callRate && stack.length - 1 < maxDepth) { enter(frame); continue }
    if (roll < callRate + 0.12 && stack.length > 1) { exit(); continue }
    if (roll < 0.62 || !frame.receiver) {
      const slot = 2 + pick(4)
      // As in Recorder.local, the payload descriptor (the local's type) overrides the frame context's.
      const source = provenance ? [...frame.locals.entries()].at(-1) : undefined
      const value = source?.[1] ?? int(pick(10000))
      events.push(base('local', frame, { slot, name: `v${slot}`, descriptor: 'I', liveRange: `${slot}:0:999`, value,
        ...(provenance ? { origin: source ? { kind: 'local', slot: source[0] } : { kind: 'constant', value } } : {}) }))
      frame.locals.set(slot, value)
    } else {
      const fieldIndex=pick(fieldsPerObject)
      const source = provenance ? [...frame.locals.entries()].at(-1) : undefined
      const value = source?.[1] ?? int(pick(10000))
      events.push(base('field', frame, { objectId: frame.receiver, owner: frame.className, name: `f${fieldIndex}`, value,
        ...(provenance ? { origin: source ? { kind: 'local', slot: source[0] } : { kind: 'constant', value } } : {}) }, null) as RawRuntimeEvent)
      ;(events.at(-1) as { descriptor: string }).descriptor = 'I'
    }
  }
  while (stack.length > 1) exit()
  events.push({ ...base('exit', main, {}), descriptor: '()V' } as RawRuntimeEvent)
  const content = Array.from({ length: linesPerFile }, (_, i) => `// line ${i + 1}`).join('\n')
  const manifest: InstrumentationSourceManifest = {
    sources: classNames.map((name) => ({ fileId: `${name.replace('.', '/')}.java`, name: `${name.split('.')[1]}.java`, content, sha256: '0' })),
    classes: classNames.map((name) => ({ className: name, sourceFile: `${name.split('.')[1]}.java`, fileId: `${name.replace('.', '/')}.java`, sourceSha256: '0', status: 'resolved', candidates: [] })),
  }
  return { rawEvents: events, manifest, stats: { invocations, objects: objectSeq, maxDepth: deepest } }
}
