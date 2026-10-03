import type { ExecutionFact } from '../contracts/executionGraph'
import type { RuntimeValue } from '../contracts/runtime'
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const index = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
function value(v: unknown): v is RuntimeValue {
  if (!record(v)) return false
  if (v.kind === 'null' || v.kind === 'uninitialized') return true
  if (v.kind === 'reference') return text(v.objectId) && text(v.javaType)
  if (v.kind === 'stringSummary') return v.javaType === 'String' && typeof v.value === 'string'
  if (v.kind !== 'primitive') return false
  if (v.javaType === 'boolean') return typeof v.value === 'boolean'
  if (v.javaType === 'char') return typeof v.value === 'string' && v.value.length === 1
  if (v.javaType === 'long') return typeof v.value === 'string' && /^-?\d+$/.test(v.value)
  if (typeof v.value !== 'number' || !Number.isFinite(v.value)) return false
  if (v.javaType === 'int') return Number.isInteger(v.value) && v.value >= -2147483648 && v.value <= 2147483647
  if (v.javaType === 'byte') return Number.isInteger(v.value) && v.value >= -128 && v.value <= 127
  if (v.javaType === 'short') return Number.isInteger(v.value) && v.value >= -32768 && v.value <= 32767
  return v.javaType === 'float' || v.javaType === 'double'
}
function method(v: unknown): boolean { return record(v) && text(v.owner) && text(v.name) && text(v.descriptor) }
function origin(v: unknown, depth = 0): boolean {
  if (!record(v) || depth > 16) return false
  switch (v.kind) {
    case 'unknown': return true
    case 'local': return text(v.slotId)
    case 'constant': return value(v.value)
    case 'call_result': case 'field_read': case 'array_read': case 'new': return index(v.site)
    case 'computed': return index(v.site) && index(v.opcode) && Array.isArray(v.inputs) && v.inputs.length <= 8 && v.inputs.every(input => origin(input, depth + 1))
    default: return false
  }
}
function binding(v: unknown): boolean { return record(v) && text(v.slotId) && text(v.name) && text(v.javaType) && value(v.value) }
function target(v: unknown): boolean { return record(v) && text(v.id) && text(v.ownerId) && text(v.name) && text(v.javaType) && ['variable', 'field', 'array-element'].includes(String(v.kind)) }
export function isExecutionFact(v: unknown): v is ExecutionFact {
  if (!record(v) || !record(v.context)) return false
  const c = v.context
  if (!method(c) || !(c.frameId === null || text(c.frameId)) || !(c.site === null || index(c.site)) || !index(c.rawSeq) ||
      !(c.source === null || record(c.source) && text(c.source.fileId) && index(c.source.line) && c.source.line > 0)) return false
  switch (v.kind) {
    case 'call': return text(v.callId) && method(v.declared) && ['static', 'virtual', 'interface', 'special', 'dynamic'].includes(String(v.invokeKind)) &&
      (v.receiver === null || value(v.receiver)) && Array.isArray(v.arguments) && v.arguments.length <= 255 && v.arguments.every(value) &&
      Array.isArray(v.argumentOrigins) && v.argumentOrigins.length === v.arguments.length && v.argumentOrigins.every(o => origin(o)) && origin(v.receiverOrigin)
    case 'call-return': return text(v.callId) && value(v.value) && (v.inputText === undefined || typeof v.inputText === 'string')
    case 'enter': return text(v.invocationId) && (v.callerInvocationId === null || text(v.callerInvocationId)) && method(v.method) &&
      (v.callId === undefined || text(v.callId)) && (v.receiver === null || value(v.receiver)) && Array.isArray(v.parameters) && v.parameters.length <= 255 && v.parameters.every(binding)
    case 'receiver-ready': return text(v.invocationId) && value(v.receiver) && v.receiver.kind === 'reference' && text(v.slotId)
    case 'write': case 'read': return target(v.target) && value(v.value) && origin(v.origin)
    case 'return': return text(v.invocationId) && value(v.value) && origin(v.origin)
    case 'exit': case 'unwind': return text(v.invocationId) && (v.exceptionId === undefined || text(v.exceptionId))
    case 'object': return text(v.objectId) && text(v.className) && Array.isArray(v.fields) && v.fields.every(binding)
    case 'constructed': return text(v.objectId) && text(v.className) && (v.newSite === undefined || index(v.newSite))
    case 'io': return ['stdin', 'stdout', 'stderr'].includes(String(v.channel)) && typeof v.text === 'string' && (v.callId === undefined || text(v.callId))
    case 'throw': case 'catch': return text(v.invocationId) && text(v.exceptionId) && (v.callId === undefined || text(v.callId)) && (v.className === undefined || text(v.className))
    default: return false
  }
}
