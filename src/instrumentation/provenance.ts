import type { ExecutionFact, ExecutionSite, ObservedBinding, ValueOrigin } from '../contracts/executionGraph'
import { arrayElementSlotId, type RuntimeValue, type SourceLocation } from '../contracts/runtime'
import type { RawOrigin, RawRuntimeEvent, RawValue } from './contracts'

const frameId = (id: string) => `jvm:frame:${id}`
const objectId = (id: string) => `jvm:object:${id}`
const callId = (id: string) => `jvm:call:${id}`
const localId = (frame: string, slot: number, range: string) => `${frame}:local:${slot}:${range}`
const fieldId = (object: string, owner: string, name: string, descriptor: string) => `${object}:field:${owner}:${name}:${descriptor}`
export function provenanceValue(raw: RawValue): RuntimeValue {
  if (raw.kind === 'ref') return { kind: 'reference', javaType: raw.className, objectId: objectId(raw.objectId) }
  if (raw.kind === 'unsupported') return { kind: 'uninitialized' }
  if (raw.kind === 'null') return { kind: 'null' }
  if (raw.kind === 'string') return { kind: 'stringSummary', javaType: 'String', value: raw.value }
  if (raw.kind === 'long') return Number.isSafeInteger(raw.value) ? { kind: 'primitive', javaType: 'long', value: String(raw.value) } : { kind: 'uninitialized' }
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
      return { slotId: id, name, javaType: javaType(descriptor), value: provenanceValue(rawValue) }
    }
    const recipe = (origin: RawOrigin | undefined) => this.recipe(origin, frame)
    const value = (rawValue: RawValue) => provenanceValue(rawValue)
    switch (raw.type) {
      case 'enter': {
        this.methods.set(frame!, context)
        if (raw.receiver) this.slots.set(`${frame}:0`, localId(frame!, 0, 'receiver'))
        return { context, kind: 'enter', invocationId: frame!, callerInvocationId: raw.callerFrameId ? frameId(raw.callerFrameId) : null,
          method: { owner: raw.className!, name: raw.methodName!, descriptor: raw.descriptor! },
          ...(raw.callId ? { callId: callId(raw.callId) } : {}), receiver: raw.receiver ? value(raw.receiver) : null,
          parameters: raw.parameters.map(p => binding(p.slot, p.liveRange, p.name, p.descriptor, p.value)) }
      }
      case 'call': return { context, kind: 'call', callId: callId(raw.callId), invokeKind: raw.invokeKind,
        declared: { owner: raw.owner, name: raw.name, descriptor: raw.callDescriptor }, receiver: raw.receiver ? value(raw.receiver) : null,
        arguments: raw.arguments.map(value), argumentOrigins: raw.arguments.map((_, i) => recipe(raw.argumentOrigins[i])), receiverOrigin: recipe(raw.receiverOrigin) }
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
      case 'object': return { context, kind: 'object', objectId: objectId(raw.objectId), className: raw.className,
        fields: raw.fields.map(f => ({ slotId: fieldId(objectId(raw.objectId), f.owner, f.name, f.descriptor), name: f.name, javaType: javaType(f.descriptor), value: value(f.value) })) }
      case 'array': return { context, kind: 'object', objectId: objectId(raw.objectId), className: 'int[]', fields: [] }
      case 'field': case 'field_read': return { context, kind: raw.type === 'field' ? 'write' : 'read',
        target: { id: fieldId(objectId(raw.objectId), raw.owner, raw.name, raw.descriptor), kind: 'field', ownerId: objectId(raw.objectId), name: raw.name, javaType: javaType(raw.descriptor) }, value: value(raw.value), origin: recipe(raw.origin) }
      case 'array_read': case 'array_write': return { context, kind: raw.type === 'array_read' ? 'read' : 'write',
        target: { id: arrayElementSlotId(objectId(raw.objectId), raw.index), kind: 'array-element', ownerId: objectId(raw.objectId), name: `[${raw.index}]`, javaType: 'int' }, value: { kind: 'primitive', javaType: 'int', value: raw.value }, origin: recipe(raw.origin) }
      case 'return': return { context, kind: 'return', invocationId: frame!, value: value(raw.value), origin: recipe(raw.origin) }
      case 'exit': return { context, kind: 'exit', invocationId: frame! }
      case 'unwind': return { context, kind: 'unwind', invocationId: frame!, exceptionId: objectId(raw.objectId) }
      case 'throw': case 'catch': return { context, kind: raw.type, invocationId: frame!, exceptionId: objectId(raw.objectId), ...(raw.callId ? { callId: callId(raw.callId) } : {}), ...(raw.type === 'throw' ? { className: raw.className } : {}) }
      case 'console': case 'stdin_read': return { context, kind: 'io', channel: raw.type === 'console' ? raw.channel : 'stdin', text: raw.text, ...(raw.callId ? { callId: callId(raw.callId) } : {}) }
      case 'constructed': return { context, kind: 'constructed', objectId: objectId(raw.objectId), className: raw.className, ...(raw.newSite !== undefined ? { newSite: raw.newSite } : {}) }
      default: return null
    }
  }
}
