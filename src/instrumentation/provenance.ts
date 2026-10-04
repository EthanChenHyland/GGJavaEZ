import type { ExecutionFact, ExecutionSite, ObservedBinding, ValueOrigin } from '../contracts/executionGraph'
import { arrayElementSlotId, type RuntimeValue, type SourceLocation } from '../contracts/runtime'
import type { RawOrigin, RawRuntimeEvent, RawValue } from './contracts'

const frameId = (id: string) => `jvm:frame:${id}`
const objectId = (id: string) => `jvm:object:${id}`
const callId = (id: string) => `jvm:call:${id}`
const localId = (frame: string, slot: number, range: string) => `${frame}:local:${slot}:${range}`
const fieldId = (object: string, owner: string, name: string, descriptor: string) => `${object}:field:${owner}:${name}:${descriptor}`
export function provenanceValue(raw: RawValue, expanded = false): RuntimeValue {
  if (raw.kind === 'ref') return { kind: 'reference', javaType: raw.className, objectId: objectId(raw.objectId) }
  if (raw.kind === 'unsupported') return expanded ? { kind: 'unavailable', javaType: raw.javaType, reason: 'Unsupported value observation' } : { kind: 'uninitialized' }
  if (raw.kind === 'null') return { kind: 'null' }
  if (raw.kind === 'string') return { kind: 'stringSummary', javaType: 'String', value: raw.value }
  if (raw.kind === 'long') return typeof raw.value === 'string' || Number.isSafeInteger(raw.value) ? { kind: 'primitive', javaType: 'long', value: String(raw.value) } : expanded ? { kind: 'unavailable', javaType: 'long', reason: 'Legacy numeric long cannot retain precision' } : { kind: 'uninitialized' }
  return { kind: 'primitive', javaType: raw.kind, value: raw.value }
}
function javaType(descriptor: string): string {
  const primitive: Record<string, string> = { I: 'int', J: 'long', F: 'float', D: 'double', B: 'byte', S: 'short', Z: 'boolean', C: 'char', V: 'void' }
  if (primitive[descriptor]) return primitive[descriptor]
  if (descriptor.startsWith('[')) return `${javaType(descriptor.slice(1))}[]`
  return descriptor.slice(1, -1).replaceAll('/', '.')
}
/** Joins bytecode recipes with actual dynamic slot lifetimes in constant lookup time. */
export class ProvenanceNormalizer {
  enabled = false
  private slots = new Map<string, string>()
  private methods = new Map<string, ExecutionSite>()
  private observed = new Set<string>()
  private recipe(raw: RawOrigin | undefined, frame: string | null, depth = 0): ValueOrigin {
    if (!raw || depth > 16 || !frame) return { kind: 'unknown' }
    switch (raw.kind) {
      case 'local': {
        const current = this.slots.get(`${frame}:${raw.slot}`)
        const id = raw.slot === 0 && current?.endsWith(':receiver') ? current : raw.liveRange ? localId(frame, raw.slot, raw.liveRange) : current
        return id ? { kind: 'local', slotId: id } : { kind: 'unknown' }
      }
      case 'constant': return { kind: 'constant', value: provenanceValue(raw.value) }
      case 'computed': return { ...raw, inputs: raw.inputs.slice(0, 8).map(input => this.recipe(input, frame, depth + 1)) }
      default: return { ...raw }
    }
  }
  fact(raw: RawRuntimeEvent, source: SourceLocation | null): ExecutionFact | null {
    if (raw.provenanceVersion === 1 || raw.type === 'call') this.enabled = true
    if (!this.enabled) return null
    const frame = raw.frameId ? frameId(raw.frameId) : null
    const priorMethod = frame ? this.methods.get(frame) : undefined
    const context: ExecutionSite = { frameId: frame, owner: priorMethod?.owner ?? raw.className ?? '<unknown>',
      name: priorMethod?.name ?? raw.methodName ?? '<unknown>', descriptor: priorMethod?.descriptor ?? raw.descriptor ?? '<unknown>', site: raw.site, rawSeq: raw.seq, source }
    const binding = (slot: number, range: string, name: string, descriptor: string, rawValue: RawValue): ObservedBinding => {
      const id = localId(frame!, slot, range)
      this.slots.set(`${frame}:${slot}`, id)
      return { slotId: id, name, javaType: javaType(descriptor), value: provenanceValue(rawValue, raw.coverageVersion === 1) }
    }
    const recipe = (origin: RawOrigin | undefined) => this.recipe(origin, frame)
    const value = (rawValue: RawValue) => provenanceValue(rawValue, raw.coverageVersion === 1)
    switch (raw.type) {
      case 'enter': {
        this.methods.set(frame!, context)
        if (raw.receiver) this.slots.set(`${frame}:0`, localId(frame!, 0, 'receiver'))
        return { context, kind: 'enter', invocationId: frame!, callerInvocationId: raw.callerFrameId ? frameId(raw.callerFrameId) : null,
          method: { owner: raw.className!, name: raw.methodName!, descriptor: raw.descriptor! },
          ...(raw.callId ? { callId: callId(raw.callId) } : {}), receiver: raw.receiver ? value(raw.receiver) : null,
          parameters: raw.parameters.map(p => binding(p.slot, p.liveRange, p.name, p.descriptor, p.value)), ...(raw.metadata ? { metadata: raw.metadata } : {}) }
      }
      case 'call': return { context, kind: 'call', callId: callId(raw.callId), invokeKind: raw.invokeKind,
        declared: { owner: raw.owner, name: raw.name, descriptor: raw.callDescriptor }, receiver: raw.receiver ? value(raw.receiver) : null,
        arguments: raw.arguments.map(value), argumentOrigins: raw.arguments.map((_, i) => recipe(raw.argumentOrigins[i])), receiverOrigin: recipe(raw.receiverOrigin), ...(raw.ownership ? { ownership: raw.ownership } : {}) }
      case 'call_return': return { context, kind: 'call-return', callId: callId(raw.callId), value: value(raw.value), ...(raw.inputText !== undefined ? { inputText: raw.inputText } : {}) }
      case 'receiver_ready':
        this.slots.set(`${frame}:0`, localId(frame!, 0, 'receiver'))
        return { context, kind: 'receiver-ready', invocationId: frame!, receiver: value(raw.receiver), slotId: localId(frame!, 0, 'receiver') }
      case 'local': {
        // Resolve the source before replacing the destination's current slot (slot reuse).
        const origin = recipe(raw.origin)
        const b = binding(raw.slot, raw.liveRange, raw.name, raw.descriptor, raw.value)
        return { context, kind: 'write', target: { id: b.slotId, kind: 'variable', ownerId: frame!, name: b.name, javaType: b.javaType }, value: b.value, origin }
      }
      case 'local_end': {
        const key = `${frame}:${raw.slot}`
        if (this.slots.get(key) === localId(frame!, raw.slot, raw.liveRange)) this.slots.delete(key)
        return null
      }
      case 'object': {
        const fields = raw.fields.map(f => ({ slotId: fieldId(objectId(raw.objectId), f.owner, f.name, f.descriptor), name: f.name, javaType: javaType(f.descriptor), value: value(f.value) }))
        if (this.observed.has(raw.objectId)) return { context, kind: 'observe', objectId: objectId(raw.objectId), fields, ...(raw.metadata ? { metadata: raw.metadata } : {}) }
        this.observed.add(raw.objectId)
        return { context, kind: 'object', objectId: objectId(raw.objectId), className: raw.className, fields, ...(raw.metadata ? { metadata: raw.metadata } : {}) }
      }
      case 'array': {
        this.observed.add(raw.objectId)
        return { context, kind: 'object', objectId: objectId(raw.objectId), className: raw.coverageVersion === 1 ? `${raw.elementType}[]` : 'int[]', fields: raw.coverageVersion === 1 ? raw.elements.map((item, index) => ({ slotId: arrayElementSlotId(objectId(raw.objectId), index), name: `[${index}]`, javaType: raw.elementType, storageKind: 'array-element' as const, value: value(typeof item === 'number' ? { kind: 'int', value: item } : item) })) : [], ...(raw.metadata ? { metadata: raw.metadata } : {}) }
      }
      case 'string_object': case 'library': {
        const id = objectId(raw.objectId)
        const fields: ObservedBinding[] = raw.type === 'string_object'
          ? [{ slotId: `${id}:summary:value`, name: 'value', javaType: 'String', value: { kind: 'stringSummary', javaType: 'String', value: raw.value } }]
          : [...(raw.summary.items ?? []).map((item, index) => ({ slotId: `${id}:summary:item:${index}`, name: `[${index}]`, javaType: 'java.lang.Object', value: value(item) })),
            ...(raw.summary.entries ?? []).flatMap((entry, index) => [
              { slotId: `${id}:summary:entry:${index}:key`, name: `[${index}].key`, javaType: 'java.lang.Object', value: value(entry.key) },
              { slotId: `${id}:summary:entry:${index}:value`, name: `[${index}].value`, javaType: 'java.lang.Object', value: value(entry.value) },
            ]), ...(raw.summary.value ? [{ slotId: `${id}:summary:value`, name: 'value', javaType: raw.summary.value.kind, value: value(raw.summary.value) }] : [])]
        const seen = this.observed.has(raw.objectId); this.observed.add(raw.objectId)
        const preserveProjectFields = raw.type === 'library' && raw.metadata?.ownership === 'PROJECT' && raw.summary.kind === 'OPAQUE'
        return seen ? { context, kind: 'observe', objectId: id, fields, ...(!preserveProjectFields ? { replaceFields: true } : {}), ...(raw.metadata ? { metadata: raw.metadata } : {}) } : { context, kind: 'object', objectId: id, className: raw.className, fields, boundedSummary: true, ...(raw.metadata ? { metadata: raw.metadata } : {}) }
      }
      case 'class_state': return { context, kind: 'class', classId: `jvm:class:${raw.owner}`, className: raw.owner, initialization: raw.initialization,
        fields: raw.fields.map(f => ({ slotId: fieldId(`jvm:class:${f.owner}`, f.owner, f.name, f.descriptor), name: f.name, javaType: javaType(f.descriptor), value: value(f.value) })), ...(raw.metadata ? { metadata: raw.metadata } : {}) }
      case 'static': case 'static_read': return { context, kind: raw.type === 'static' ? 'write' : 'read',
        target: { id: fieldId(`jvm:class:${raw.owner}`, raw.owner, raw.name, raw.descriptor), kind: 'static', ownerId: `jvm:class:${raw.owner}`, name: raw.name, javaType: javaType(raw.descriptor) }, value: value(raw.value), origin: recipe(raw.origin) }
      case 'file_io': return { context, kind: 'file', operation: raw.operation, path: raw.path, text: raw.preview ?? '', ...(raw.callId ? { callId: callId(raw.callId) } : {}),
        ...(raw.byteCount === undefined ? {} : { byteCount: raw.byteCount }), ...(raw.charCount === undefined ? {} : { charCount: raw.charCount }), ...(raw.truncated === undefined ? {} : { truncated: raw.truncated }) }
      case 'field': case 'field_read': return { context, kind: raw.type === 'field' ? 'write' : 'read',
        target: { id: fieldId(objectId(raw.objectId), raw.owner, raw.name, raw.descriptor), kind: 'field', ownerId: objectId(raw.objectId), name: raw.name, javaType: javaType(raw.descriptor) }, value: value(raw.value), origin: recipe(raw.origin) }
      case 'array_read': case 'array_write': return { context, kind: raw.type === 'array_read' ? 'read' : 'write',
        target: { id: arrayElementSlotId(objectId(raw.objectId), raw.index), kind: 'array-element', ownerId: objectId(raw.objectId), name: `[${raw.index}]`, javaType: raw.elementType ?? 'int' }, value: value(typeof raw.value === 'number' ? { kind: 'int', value: raw.value } : raw.value), origin: recipe(raw.origin) }
      case 'return': return { context, kind: 'return', invocationId: frame!, value: value(raw.value), origin: recipe(raw.origin) }
      case 'exit': return { context, kind: 'exit', invocationId: frame! }
      case 'unwind': return { context, kind: 'unwind', invocationId: frame!, exceptionId: objectId(raw.objectId) }
      case 'throw': case 'catch':
        // A throw already establishes the graph identity. A later bounded
        // object snapshot enriches it rather than allocating a second node.
        if (raw.type === 'throw') this.observed.add(raw.objectId)
        return { context, kind: raw.type, invocationId: frame!, exceptionId: objectId(raw.objectId), ...(raw.callId ? { callId: callId(raw.callId) } : {}), ...(raw.type === 'throw' ? { className: raw.className } : {}) }
      case 'console': case 'stdin_read': return { context, kind: 'io', channel: raw.type === 'console' ? raw.channel : 'stdin', text: raw.text, ...(raw.callId ? { callId: callId(raw.callId) } : {}) }
      case 'constructed': return { context, kind: 'constructed', objectId: objectId(raw.objectId), className: raw.className, ...(raw.newSite !== undefined ? { newSite: raw.newSite } : {}) }
      default: return null
    }
  }
}
