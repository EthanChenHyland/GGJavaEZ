/** Pure Raw NDJSON v1 -> semantic trace v2 boundary. No source-level facts are inferred. */
import type { RuntimeSlot, RuntimeState, RuntimeValue, ScalarValue, SlotOwner, SourceLocation, TraceDocument, TraceEvent, TraceEventBase } from '../contracts/runtime'
import { ProvenanceNormalizer, provenanceValue } from './provenance'
import { isRecordingStop } from '../runtime/state'
import { ExecutionHistory, attachHistory } from '../runtime/history'
import { freezeValue } from '../runtime/storage'
import type {
  CapabilityStatus, RecordingStatus, RawRuntimeEvent, RawValue, VisualizationCapabilityReport,
  VisualizationFeature, VisualizationTerminalStatus,
} from './contracts'

export interface InstrumentationSourceManifest {
  sources: Array<{ fileId: string; name: string; content: string; sha256: string }>
  classes: Array<{
    className: string; sourceFile: string | null; fileId: string | null;
    sourceSha256: string | null; status: string; candidates: string[]
  }>
}

export interface NormalizationTerminal {
  status: VisualizationTerminalStatus | 'live'
  exitCode: number | null
  diagnostic: string | null
  recording?: RecordingStatus
  capability?: VisualizationCapabilityReport
}

export interface NormalizedTraceResult {
  trace: TraceDocument
  capability: VisualizationCapabilityReport
}

type EventPayload<T extends TraceEvent = TraceEvent> = T extends TraceEvent ? Omit<T, keyof TraceEventBase> : never

const featureNames: VisualizationFeature[] = [
  'methods', 'locals', 'objects', 'fields', 'references', 'intArrays', 'arrayReads',
  'arrayWrites', 'sourceMapping', 'branches', 'loops', 'scopes', 'returns', 'exceptions', 'console',
]
const rank: Record<CapabilityStatus, number> = { supported: 2, partial: 1, unsupported: 0 }
const frameId = (id: string) => `jvm:frame:${id}`
const objectId = (id: string) => `jvm:object:${id}`
const localId = (frame: string, slot: number, range: string) => `${frame}:local:${slot}:${range}`
const fieldId = (object: string, owner: string, name: string, descriptor: string) =>
  `${object}:field:${owner}:${name}:${descriptor}`
const intValue = (value: number): ScalarValue => ({ kind: 'primitive', javaType: 'int', value })
const valueLabel = (value: RuntimeValue): string => value.kind === 'primitive' ? String(value.value)
  : value.kind === 'stringSummary' ? `"${value.value}"` : value.kind === 'null' ? 'null'
    : value.kind === 'reference' ? `→ ${value.objectId}` : 'uninitialized'

function javaType(descriptor: string): string {
  const primitive: Record<string, string> = {
    I: 'int', J: 'long', F: 'float', D: 'double', Z: 'boolean', C: 'char', B: 'byte', S: 'short', V: 'void',
  }
  if (primitive[descriptor]) return primitive[descriptor]
  if (descriptor.startsWith('[')) return `${javaType(descriptor.slice(1))}[]`
  if (descriptor.startsWith('L') && descriptor.endsWith(';')) {
    const name = descriptor.slice(1, -1).replaceAll('/', '.')
    return name === 'java.lang.String' ? 'String' : name
  }
  throw new Error(`Unsupported JVM descriptor ${descriptor}`)
}

function rawScalar(value: RawValue): ScalarValue | null {
  if (value.kind === 'null') return { kind: 'null' }
  if (value.kind === 'string') return { kind: 'stringSummary', javaType: 'String', value: value.value }
  if (value.kind === 'unsupported' || value.kind === 'ref') return null
  if (value.kind === 'long') {
    return Number.isSafeInteger(value.value)
      ? { kind: 'primitive', javaType: 'long', value: String(value.value) } : null
  }
  return { kind: 'primitive', javaType: value.kind, value: value.value } as ScalarValue
}

/** Incremental Raw v1 -> schema v2 boundary. Trace and event storage keep their identity.
 * snapshot() reports metadata only. Call finish() after consuming the metadata's raw head;
 * until then a capture control stays pending so later input can reveal corruption.
 */
export class TraceNormalizer {
  readonly trace: TraceDocument
  readonly history: ExecutionHistory
  readonly append: (raw: readonly RawRuntimeEvent[]) => TraceEvent[]
  readonly snapshot: (terminal: NormalizationTerminal) => NormalizedTraceResult
  readonly finish: (terminal: NormalizationTerminal) => NormalizedTraceResult

  /** Immutable latest semantic state; snapshots do not advance it. */
  get state(): RuntimeState { return this.history.state }

  constructor(manifest: InstrumentationSourceManifest, demoId = 'recorded-jvm') {
    const diagnostics: string[] = []
    const features = Object.fromEntries(featureNames.map((name) => [name, {
      status: 'unsupported' as CapabilityStatus, reason: 'Not observed in this execution', observedEvents: 0,
    }])) as VisualizationCapabilityReport['features']
    const coveredClasses = new Set<string>()
    let sortedClasses: string[] = []
    let classesChanged = false
    const usedFeatures = new Set<VisualizationFeature>()
    const mark = (feature: VisualizationFeature, status: CapabilityStatus, reason: string) => {
      usedFeatures.add(feature)
      if (features[feature].reason === 'Not observed in this execution' ||
          rank[status] <= rank[features[feature].status]) {
        features[feature].status = status
        features[feature].reason = reason
      }
    }
    const observed = (feature: VisualizationFeature) => {
      usedFeatures.add(feature)
      if (features[feature].reason === 'Not observed in this execution') {
        features[feature].status = 'supported'
        features[feature].reason = 'Observed JVM event'
      }
      features[feature].observedEvents++
    }
    // Bytecode has neither lexical blocks nor Java loop labels.
    mark('loops', 'unsupported', 'Raw branches do not identify source-level loops')
    mark('scopes', 'unsupported', 'Debug local ranges do not prove lexical block entry or exit')
    mark('console', 'partial', 'Wrapped stdout/stderr writes share the probe clock; replaced streams and direct native/file-descriptor output have unknown ordering')
    const sourceFiles = manifest.sources.map(({ fileId, name, content, sha256 }) => ({ fileId, name, content, sha256 }))
    const files = new Map(sourceFiles.map((file) => [file.fileId, { ...file, lineCount: file.content.split('\n').length }]))
    const classes = new Map(manifest.classes.map((entry) => [entry.className, entry]))
    const sourceFor = (raw: RawRuntimeEvent, className = raw.className): SourceLocation | null => {
      if (raw.line === null || className === null) return null
      const entry = classes.get(className)
      const file = entry?.fileId ? files.get(entry.fileId) : undefined
      if (entry?.status !== 'resolved' || !file || raw.line < 1 || raw.line > file.lineCount) {
        mark('sourceMapping', 'partial', `Unresolved source for ${className}:${raw.line}`)
        return null
      }
      observed('sourceMapping')
      return { fileId: file.fileId, line: raw.line }
    }

    this.history = new ExecutionHistory({ schemaVersion: 2, sourceFiles })
    const events: TraceEvent[] = []
    let failure: string | null = null
    let currentThreadId: string | undefined
    const emit = (event: EventPayload, source: SourceLocation | null, label: string,
      importance: TraceEvent['importance'] = 'normal') => {
      const full = { ...event, eventId: `jvm:event:${events.length}`, seq: events.length, source, label, importance,
        ...(currentThreadId ? { threadId: currentThreadId } : {}) } as TraceEvent
      freezeValue(full)
      try { this.history.append([full]) }
      catch (error) {
        // Keep the legacy raw-normalization diagnostic wording for semantic errors.
        throw error instanceof Error && error.cause instanceof Error ? error.cause : error
      }
      events.push(full)
    }
    this.trace = { schemaVersion: 2, demoId, sourceFiles, events }
    emit({ type: 'PROGRAM_START' }, null, 'Program started', 'major')
    attachHistory(this.trace, this.history)
    const provenance = new ProvenanceNormalizer()
    const openExceptions = new Set<string>()
    const registered = new Set<string>()
    const displayIds = new Map<string, number>()
    const pending = new Map<string, Array<{ owner: SlotOwner; javaType: string }>>()
    const liveLocals = new Map<string, string>()
    const localKey = (frame: string, slot: number, range: string) => `${frame}:${slot}:${range}`
    const queueReference = (rawId: string, owner: SlotOwner, type: string) => {
      const entries = pending.get(rawId) ?? []
      entries.push({ owner, javaType: type })
      pending.set(rawId, entries)
      mark('references', 'partial', `Reference target ${rawId} was observed after its source`)
    }
    const reference = (owner: SlotOwner, type: string, targetRawId: string, source: SourceLocation | null) => {
      if (!registered.has(targetRawId)) {
        const prior = owner.kind === 'frame'
          ? this.state.frames[owner.frameId]?.locals[owner.slotId]?.value
          : this.state.objects[owner.objectId]?.fields[owner.slotId]?.value
        if (prior?.kind === 'reference')
          throw new Error(`Unobserved target ${targetRawId} would leave an incorrect live reference`)
        queueReference(targetRawId, owner, type)
        return
      }
      emit({ type: 'CREATE_REFERENCE', sourceSlot: owner, targetObjectId: objectId(targetRawId), javaType: type },
        source, 'Reference assigned')
      observed('references')
    }
    const update = (owner: SlotOwner, raw: RawValue, type: string, source: SourceLocation | null) => {
      const slot = owner.kind === 'frame'
        ? this.state.frames[owner.frameId]?.locals[owner.slotId]
        : this.state.objects[owner.objectId]?.fields[owner.slotId]
      if (!slot) throw new Error(`Unknown source slot ${owner.slotId}`)
      const current = slot.value
      if (raw.kind === 'unsupported') {
        mark(owner.kind === 'frame' ? 'locals' : 'fields', 'partial', `Unsupported value ${raw.javaType}`)
        const value: ScalarValue = { kind: 'uninitialized' }
        emit(owner.kind === 'frame'
          ? { type: 'ASSIGN_LOCAL', frameId: owner.frameId, slotId: owner.slotId, value }
          : { type: 'SET_FIELD', objectId: owner.objectId, slotId: owner.slotId, value },
        source, `${slot.name}: value unavailable (${raw.javaType})`)
        return
      }
      if (raw.kind === 'ref') { reference(owner, type, raw.objectId, source); return }
      const value = rawScalar(raw)
      if (!value) {
        mark(owner.kind === 'frame' ? 'locals' : 'fields', 'partial', 'Unrepresentable scalar value')
        const unavailable: ScalarValue = { kind: 'uninitialized' }
        emit(owner.kind === 'frame'
          ? { type: 'ASSIGN_LOCAL', frameId: owner.frameId, slotId: owner.slotId, value: unavailable }
          : { type: 'SET_FIELD', objectId: owner.objectId, slotId: owner.slotId, value: unavailable },
        source, `${slot.name}: value unavailable`)
        return
      }
      if (current.kind === 'reference' && value.kind === 'null') {
        emit({ type: 'CLEAR_REFERENCE', sourceSlot: owner }, source, 'Reference cleared')
        observed('references')
        return
      }
      if (owner.kind === 'frame') emit({ type: 'ASSIGN_LOCAL', frameId: owner.frameId, slotId: owner.slotId, value }, source,
        `${slot.name} = ${valueLabel(value)}`)
      else emit({ type: 'SET_FIELD', objectId: owner.objectId, slotId: owner.slotId, value }, source,
        `${slot.name}: ${valueLabel(current)} → ${valueLabel(value)}`)
    }
    const declare = (frame: string, slot: number, range: string, name: string, descriptor: string,
      value: RawValue, role: RuntimeSlot['role'], source: SourceLocation | null) => {
      const id = localId(frame, slot, range)
      const type = javaType(descriptor)
      const scalar = rawScalar(value)
      const initial: RuntimeValue = scalar ?? { kind: 'uninitialized' }
      emit({ type: 'DECLARE_LOCAL', frameId: frame, slot: { id, name, javaType: type, value: initial, role } },
        source, `${name} observed`)
      liveLocals.set(localKey(frame, slot, range), id)
      observed('locals')
      if (value.kind === 'ref') reference({ kind: 'frame', frameId: frame, slotId: id }, type, value.objectId, source)
      if (!scalar && value.kind !== 'ref') mark('locals', 'partial', `Unrepresentable local ${name}`)
    }
    let expectedSeq = 0
    let thread: string | null = null
    let lastRecordedSeq: number | null = null
    let recordingStop: RecordingStatus | undefined
    let controlStopSeq: number | undefined
    let closedTerminalStatus: NormalizationTerminal['status'] | undefined
    let startDelivered = false

    // The initial root snapshot already exposes start; the first delta also delivers it
    // for callers that feed history exclusively from append() results.
    this.append = (rawEvents) => {
      if (closedTerminalStatus !== undefined) {
        if (rawEvents.length) throw new Error('Cannot append raw events after normalization finished')
        return []
      }
      const start = startDelivered ? events.length : 0
      startDelivered = true
      if (failure) return events.slice(start)
      if (controlStopSeq !== undefined && rawEvents.length) {
        failure = `Raw event ${controlStopSeq}: Raw events followed capture stop`
        diagnostics.push(failure)
        recordingStop = undefined
      }
      // Legacy mixed-thread captures ignore all probes after the first foreign thread.
      if (failure || recordingStop) return events.slice(start)
      for (let rawIndex = 0; rawIndex < rawEvents.length; rawIndex++) {
        const raw = rawEvents[rawIndex]
        try {
          if (raw.v !== 1 || raw.seq !== expectedSeq) throw new Error(`Raw sequence gap or version mismatch at ${expectedSeq}`)
          if (raw.type === 'capture_saturated') {
            if (!isRecordingStop(raw.recording) || raw.recording.lastRecordedSeq !== lastRecordedSeq)
              throw new Error('Invalid capture stop or last recorded sequence')
            if (rawIndex !== rawEvents.length - 1) throw new Error('Raw events followed capture stop')
            controlStopSeq = raw.seq
            recordingStop = { ...raw.recording }
            break
          }
          expectedSeq++
          currentThreadId = raw.threadId
          // Frameless JVM shutdown output may have another thread; a project-frame
          // console write is still an observation of that application thread.
          if (raw.type !== 'console' || raw.frameId !== null) {
            if (thread === null) thread = raw.threadId
            if (raw.threadId !== thread) {
              recordingStop = { state: 'STOPPED_UNSUPPORTED',
                reason: 'Multiple application threads detected; recording stopped before the second thread',
                budget: null, lastRecordedSeq, executionContinued: true }
              break
            }
          }
          const frame = raw.frameId === null ? null : frameId(raw.frameId)
          const contextClass = raw.type === 'throw' || raw.type === 'object' || raw.type === 'constructed'
            ? frame ? this.state.frames[frame]?.className ?? null : null : raw.className
          if (contextClass && classes.has(contextClass) && !coveredClasses.has(contextClass)) {
            coveredClasses.add(contextClass)
            classesChanged = true
          }
          // Throw/object/constructed className names a semantic type, not the emitting frame's source owner.
          const source = sourceFor(raw, contextClass)
          switch (raw.type) {
            case 'object': {
              if (registered.has(raw.objectId)) throw new Error(`Duplicate object ${raw.objectId}`)
              const id = objectId(raw.objectId)
              const fields = raw.fields.map((field): RuntimeSlot => ({
                id: fieldId(id, field.owner, field.name, field.descriptor), name: field.name,
                javaType: javaType(field.descriptor), value: rawScalar(field.value) ?? { kind: 'uninitialized' },
              }))
              displayIds.set(raw.objectId, displayIds.size + 1)
              emit({ type: 'ALLOCATE_OBJECT', objectId: id, displayId: displayIds.get(raw.objectId)!,
                className: raw.className, fields }, source, `${raw.className} observed`, 'major')
              registered.add(raw.objectId)
              observed('objects')
              for (const field of raw.fields) {
                observed('fields')
                if (field.value.kind === 'ref') reference({ kind: 'object', objectId: id,
                  slotId: fieldId(id, field.owner, field.name, field.descriptor) },
                javaType(field.descriptor), field.value.objectId, source)
                if (!rawScalar(field.value) && field.value.kind !== 'ref')
                  mark('fields', 'partial', `Unrepresentable field ${field.name}`)
              }
              for (const queued of pending.get(raw.objectId) ?? []) {
                const active = queued.owner.kind === 'object' || this.state.activeFrameIds.at(-1) === queued.owner.frameId
                if (active) reference(queued.owner, queued.javaType, raw.objectId, source)
              }
              pending.delete(raw.objectId)
              break
            }
            case 'array': {
              if (registered.has(raw.objectId)) throw new Error(`Duplicate array ${raw.objectId}`)
              displayIds.set(raw.objectId, displayIds.size + 1)
              emit({ type: 'ALLOCATE_ARRAY', objectId: objectId(raw.objectId), displayId: displayIds.get(raw.objectId)!,
                elementType: 'int', elements: raw.elements.map(intValue) }, source, 'int[] observed', 'major')
              registered.add(raw.objectId)
              observed('intArrays')
              for (const queued of pending.get(raw.objectId) ?? []) {
                const active = queued.owner.kind === 'object' || this.state.activeFrameIds.at(-1) === queued.owner.frameId
                if (active) reference(queued.owner, queued.javaType, raw.objectId, source)
              }
              pending.delete(raw.objectId)
              break
            }
            case 'enter': {
              if (!frame || !raw.className || !raw.methodName || !raw.descriptor) throw new Error('Incomplete method entry')
              const returnDescriptor = raw.descriptor.slice(raw.descriptor.lastIndexOf(')') + 1)
              const returnType = javaType(returnDescriptor)
              const scalarReturn = ['int', 'long', 'float', 'double', 'boolean', 'char', 'byte', 'short', 'String', 'void'].includes(returnType)
              emit({ type: 'ENTER_METHOD', frameId: frame,
                callerFrameId: raw.callerFrameId === null ? null : frameId(raw.callerFrameId),
                className: raw.className, methodName: raw.methodName, locals: [],
                ...(scalarReturn || provenance.enabled || raw.provenanceVersion === 1 ? { returnType } : {}) }, source, `${raw.methodName} entered`, 'major')
              observed('methods')
              if (!scalarReturn && !provenance.enabled && raw.provenanceVersion !== 1) mark('returns', 'partial', `Reference return type ${returnType} cannot be represented as a scalar transfer`)
              if (raw.receiver) declare(frame, 0, 'receiver', 'this', `L${raw.className.replaceAll('.', '/')};`, raw.receiver, 'parameter', source)
              for (const parameter of raw.parameters) declare(frame, parameter.slot, parameter.liveRange,
                parameter.name, parameter.descriptor, parameter.value, 'parameter', source)
              break
            }
            case 'receiver_ready': {
              if (!frame || !raw.className) throw new Error('Receiver ready without frame')
              declare(frame, 0, 'receiver', 'this', `L${raw.className.replaceAll('.', '/')};`, raw.receiver, 'parameter', source)
              break
            }
            case 'call':
            case 'call_return':
            case 'field_read':
            case 'constructed':
              break
            case 'line':
              if (frame && source) emit({ type: 'LINE_EXECUTE', frameId: frame }, source, `Line ${raw.line}`, 'quiet')
              else mark('sourceMapping', 'partial', `Line ${raw.line} has no resolved project source`)
              break
            case 'local': {
              if (!frame) throw new Error('Local without frame')
              const key = localKey(frame, raw.slot, raw.liveRange)
              const id = liveLocals.get(key)
              if (id) update({ kind: 'frame', frameId: frame, slotId: id }, raw.value, javaType(raw.descriptor), source)
              else declare(frame, raw.slot, raw.liveRange, raw.name, raw.descriptor, raw.value, 'local', source)
              observed('locals')
              break
            }
            case 'local_end': {
              if (!frame) throw new Error('Local end without frame')
              const key = localKey(frame, raw.slot, raw.liveRange)
              const id = liveLocals.get(key)
              if (id) {
                // A return operand has already committed; EXIT_METHOD will retire all remaining locals.
                if (this.state.frames[frame]?.returnValue === undefined)
                  emit({ type: 'REMOVE_LOCAL', frameId: frame, slotId: id }, source, 'Local lifetime ended', 'quiet')
                liveLocals.delete(key)
              } else mark('locals', 'partial', `Unmatched local live-range end ${key}`)
              break
            }
            case 'field': {
              const id = objectId(raw.objectId)
              update({ kind: 'object', objectId: id,
                slotId: fieldId(id, raw.owner, raw.name, raw.descriptor) }, raw.value, javaType(raw.descriptor), source)
              observed('fields')
              break
            }
            case 'array_read':
            case 'array_write':
              if (!frame) throw new Error('Array operation without frame')
              emit({ type: raw.type === 'array_read' ? 'ARRAY_READ' : 'ARRAY_WRITE', frameId: frame,
                objectId: objectId(raw.objectId), index: raw.index, value: intValue(raw.value) }, source,
              raw.type === 'array_read' ? `Read [${raw.index}]` : `Write [${raw.index}]`)
              observed(raw.type === 'array_read' ? 'arrayReads' : 'arrayWrites')
              break
            case 'branch': {
              if (!frame) throw new Error('Branch without frame')
              const left = rawScalar(raw.left)
              const right = raw.right ? rawScalar(raw.right) : undefined
              if (!left || (raw.right && !right)) { mark('branches', 'partial', 'Unsupported branch operand'); break }
              emit({ type: 'BRANCH_EVALUATE', frameId: frame, opcode: raw.opcode, site: raw.site,
                left, ...(right ? { right } : {}), taken: raw.taken }, source, 'JVM branch evaluated')
              observed('branches')
              break
            }
            case 'return': {
              if (!frame) throw new Error('Return without frame')
              if (!this.state.frames[frame]?.returnType) {
                mark('returns', 'partial', 'Reference return has no representable scalar transfer')
                break
              }
              const graphValue = provenance.enabled ? provenanceValue(raw.value) : null
              const value = graphValue?.kind === 'reference' ? { ...graphValue, javaType: this.state.frames[frame].returnType! } : rawScalar(raw.value)
              if (!value) { mark('returns', 'partial', 'Reference or unsupported return has no scalar transfer'); break }
              emit({ type: 'RETURN_VALUE', frameId: frame, value, destination: null }, source, 'Value returned', 'major')
              observed('returns')
              break
            }
            case 'exit':
              if (!frame) throw new Error('Exit without frame')
              emit({ type: 'EXIT_METHOD', frameId: frame }, source, 'Method exited', 'major')
              observed('methods')
              break
            case 'throw':
              if (!frame) throw new Error('Throw without frame')
              // Older captures repeated the same implicit exception on every unwind.
              // Keep the earliest observed episode; a real catch closes it for a later rethrow.
              if (openExceptions.has(objectId(raw.objectId))) break
              emit({ type: 'THROW_EXCEPTION', frameId: frame, exceptionId: objectId(raw.objectId),
                className: raw.className, message: raw.message, explicit: raw.explicit }, source,
              'Exception observed', 'major')
              openExceptions.add(objectId(raw.objectId))
              observed('exceptions')
              mark('exceptions', 'partial', 'Project throw/handler/unwind sites are observed; catch-all handlers prove exceptional cleanup, not lexical finally. Custom getMessage overrides are not invoked and their messages remain unavailable')
              break
            case 'unwind':
            case 'catch':
            case 'finally':
              if (!frame) throw new Error('Exception transition without frame')
              emit({ type: raw.type === 'unwind' ? 'UNWIND_EXCEPTION' : raw.type === 'finally' ? 'FINALLY_ENTER' : 'CATCH_EXCEPTION',
                frameId: frame, exceptionId: objectId(raw.objectId) }, source,
              raw.type === 'unwind' ? 'Frame unwound' : raw.type === 'finally' ? 'Exceptional cleanup handler entered' : 'Exception caught', 'major')
              if (raw.type === 'catch') openExceptions.delete(objectId(raw.objectId))
              observed('exceptions')
              break
            case 'console':
              emit({ type: 'CONSOLE_WRITE', frameId: frame, channel: raw.channel, text: raw.text }, source,
                `${raw.channel} write`, 'quiet')
              observed('console')
              break
            case 'stdin_wait':
              break
            case 'stdin_read':
              emit({ type: 'CONSOLE_INPUT', frameId: frame, text: raw.text }, source, 'Input consumed', 'quiet')
              observed('console')
              break
            default:
              throw new Error(`Unknown raw event type ${(raw as RawRuntimeEvent).type}`)
          }
          const fact = provenance.fact(raw, source)
          if (fact) emit({ type: 'EXECUTION_FACT', fact }, source, `JVM ${fact.kind}`, 'quiet')
          lastRecordedSeq = raw.seq
        } catch (error) {
          failure = `Raw event ${raw.seq}: ${(error as Error).message}`
          diagnostics.push(failure)
          break
        }
      }
      currentThreadId = undefined
      return events.slice(start)
    }

    const result = (terminal: NormalizationTerminal, terminalStatus = closedTerminalStatus ?? terminal.status): NormalizedTraceResult => {
      // Provider metadata must never mutate accumulated observation counters.
      const reportFeatures = Object.fromEntries(featureNames.map(name => [name, { ...features[name] }])) as VisualizationCapabilityReport['features']
      const reportUsed = new Set(usedFeatures)
      if (terminal.capability) {
        for (const name of featureNames) {
          const provider = terminal.capability.features[name]
          if (provider && rank[provider.status] < rank[reportFeatures[name].status]) {
            reportFeatures[name].status = provider.status
            reportFeatures[name].reason = provider.reason
            reportUsed.add(name)
          }
        }
      }
      const required = [...reportUsed].filter(name => name !== 'loops' && name !== 'scopes' && name !== 'console')
      const aggregate = !failure && recordingStop ? 'partial' : failure || terminalStatus === 'instrumentation_failed' || terminalStatus === 'unsupported' ? 'unsupported'
        : terminalStatus !== 'complete' ? 'partial' :
        required.reduce<CapabilityStatus>((status, name) => rank[reportFeatures[name].status] < rank[status]
          ? reportFeatures[name].status : status, 'supported')
      // Bound live provider diagnostics and reserve room for local failures.
      const reportDiagnostics: string[] = []
      const seen = new Set<string>()
      const providerDiagnostics = terminal.capability?.diagnostics ?? []
      for (let index = 0; index < Math.min(providerDiagnostics.length, 128 - diagnostics.length); index++) {
        const message = providerDiagnostics[index]
        if (!seen.has(message)) { seen.add(message); reportDiagnostics.push(message) }
      }
      for (const message of diagnostics) {
        if (!seen.has(message)) { seen.add(message); reportDiagnostics.push(message) }
      }
      if (classesChanged) { sortedClasses = [...coveredClasses].sort(); classesChanged = false }
      return { trace: this.trace, capability: { status: aggregate, features: reportFeatures,
        coveredClasses: [...sortedClasses], diagnostics: reportDiagnostics } }
    }
    this.snapshot = terminal => result(terminal)
    this.finish = terminal => {
      if (closedTerminalStatus !== undefined) return result(terminal)
      currentThreadId = undefined
      if (!failure && !recordingStop && terminal.recording && terminal.recording.state !== 'FULL') {
        if (!isRecordingStop(terminal.recording) || terminal.recording.lastRecordedSeq !== lastRecordedSeq) {
          failure = 'Invalid terminal recording stop or last recorded sequence'
          diagnostics.push(failure)
        } else recordingStop = { ...terminal.recording }
      }
      let terminalStatus = terminal.status
      if (failure || (!recordingStop && terminalStatus === 'complete' &&
          (this.state.activeFrameIds.length !== 0 || expectedSeq === 0 || terminal.exitCode !== 0))) {
        terminalStatus = 'instrumentation_failed'
        if (!failure) diagnostics.push('Complete envelope lacked a valid observed method trace or zero exit code')
      }
      if (!failure && recordingStop) {
        emit({ type: 'CAPTURE_STOP', recording: recordingStop }, null,
          `Last recorded event · ${recordingStop.reason}`, 'major')
        diagnostics.push(recordingStop.reason!)
        mark('methods', 'partial', `Recording stopped: ${recordingStop.reason}`)
      } else if (terminalStatus === 'complete') {
        try { emit({ type: 'PROGRAM_END' }, null, 'Program completed', 'major') }
        catch (error) {
          terminalStatus = 'instrumentation_failed'
          diagnostics.push(`Cannot complete trace: ${(error as Error).message}`)
        }
      }
      if ((!recordingStop || failure) && terminalStatus !== 'complete' && terminalStatus !== 'live') {
        const message = failure ?? terminal.diagnostic ?? `Visualization ${terminalStatus}`
        emit({ type: 'PROGRAM_ABORT', reason: terminalStatus, message }, null, 'Visualization stopped', 'major')
        mark('methods', 'partial', `Trace ended with ${terminalStatus}`)
      }
      if (events.at(-1)?.type === 'CAPTURE_STOP' || events.at(-1)?.type === 'PROGRAM_END' ||
          events.at(-1)?.type === 'PROGRAM_ABORT') closedTerminalStatus = terminalStatus
      return result(terminal, terminalStatus)
    }
  }
}

/** Deterministic batch wrapper; provider diagnostics retain their exact legacy order. */
export function normalizeTrace(
  rawEvents: readonly RawRuntimeEvent[],
  manifest: InstrumentationSourceManifest,
  terminal: NormalizationTerminal,
  demoId = 'recorded-jvm',
): NormalizedTraceResult {
  const normalizer = new TraceNormalizer(manifest, demoId)
  normalizer.append(rawEvents)
  const result = normalizer.finish(terminal.capability
    ? { ...terminal, capability: { ...terminal.capability, diagnostics: [] } } : terminal)
  if (terminal.capability) result.capability.diagnostics = [...terminal.capability.diagnostics, ...result.capability.diagnostics]
  return result
}
