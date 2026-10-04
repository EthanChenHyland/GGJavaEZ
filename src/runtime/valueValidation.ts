import type { RuntimeLibrarySummary, RuntimeSlot, RuntimeTypeMetadata, RuntimeValue, ScalarValue } from '../contracts/runtime'

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
export const primitiveTypes = ['byte', 'short', 'int', 'long', 'float', 'double', 'boolean', 'char'] as const
const integerBounds = { byte: [-128, 127], short: [-32768, 32767], int: [-2147483648, 2147483647] } as const

/** JSON-safe values, with no narrowing or normalization of already recorded values. */
export function isRuntimeValue(value: unknown): value is RuntimeValue {
  if (!record(value)) return false
  switch (value.kind) {
    case 'null': case 'uninitialized': return true
    case 'unavailable': return text(value.reason) && (value.javaType === undefined || text(value.javaType))
    case 'reference': return text(value.javaType) && text(value.objectId)
    case 'stringSummary': return value.javaType === 'String' && typeof value.value === 'string'
    case 'primitive': {
      const v = value.value
      switch (value.javaType) {
        case 'byte': case 'short': case 'int': {
          const [min, max] = integerBounds[value.javaType]
          return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
        }
        case 'long':
          if (typeof v === 'number') return Number.isSafeInteger(v)
          if (typeof v !== 'string' || v.length > 20 || !/^(0|[1-9]\d*|-[1-9]\d*)$/.test(v)) return false
          return BigInt(v) >= -9223372036854775808n && BigInt(v) <= 9223372036854775807n
        case 'float': case 'double':
          return typeof v === 'number' ? Number.isFinite(v) && (value.javaType !== 'float' || Math.abs(v) <= 3.4028234663852886e38) :
            typeof v === 'string' && ['NaN', 'Infinity', '-Infinity', '-0.0'].includes(v)
        case 'boolean': return typeof v === 'boolean'
        case 'char': return typeof v === 'string' && v.length === 1
        default: return false
      }
    }
    default: return false
  }
}
export function isScalarValue(value: unknown): value is ScalarValue { return isRuntimeValue(value) && value.kind !== 'reference' }
export function assertRuntimeValue(value: unknown): asserts value is RuntimeValue {
  if (!isRuntimeValue(value)) throw new Error('Invalid runtime value')
}
export function assertScalarValue(value: unknown): asserts value is ScalarValue {
  if (!isScalarValue(value)) throw new Error('Invalid scalar value')
}

/** The normalizer records the observed declared slot type on references. No hierarchy guessing. */
export function assertAssignable(slot: Pick<RuntimeSlot, 'id' | 'javaType'>, value: RuntimeValue): void {
  assertRuntimeValue(value)
  const matches = value.kind === 'uninitialized' ||
    (value.kind === 'unavailable' && (value.javaType === undefined || value.javaType === slot.javaType)) ||
    (value.kind === 'null' && !primitiveTypes.some(type => type === slot.javaType)) ||
    (value.kind === 'primitive' && value.javaType === slot.javaType) ||
    (value.kind === 'reference' && value.javaType === slot.javaType) ||
    (value.kind === 'stringSummary' && ['String', 'java.lang.String', 'java.lang.Object', 'Object', 'java.lang.CharSequence', 'CharSequence', 'java.io.Serializable', 'java.lang.Comparable', 'java.lang.constant.Constable', 'java.lang.constant.ConstantDesc'].includes(slot.javaType))
  if (!matches) throw new Error(`Value type mismatch for ${slot.id}`)
}

export function runtimeValuesEqual(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'primitive' && b.kind === 'primitive') return a.javaType === b.javaType && Object.is(a.value, b.value)
  if (a.kind === 'reference' && b.kind === 'reference') return a.javaType === b.javaType && a.objectId === b.objectId
  if (a.kind === 'stringSummary' && b.kind === 'stringSummary') return a.value === b.value
  if (a.kind === 'unavailable' && b.kind === 'unavailable') return a.reason === b.reason && a.javaType === b.javaType
  return a.kind === 'null' || a.kind === 'uninitialized'
}

export function isTypeMetadata(value: unknown): value is RuntimeTypeMetadata {
  return record(value) && ['PROJECT', 'LIBRARY', 'JDK', 'SYNTHETIC'].includes(String(value.ownership)) &&
    text(value.runtimeType) && typeof value.packageName === 'string' &&
    ['synthetic', 'record', 'enum'].every(key => value[key] === undefined || typeof value[key] === 'boolean') &&
    (value.components === undefined || Array.isArray(value.components) && value.components.every(component => record(component) && text(component.name) && text(component.javaType)))
}
export function isLibrarySummary(value: unknown): value is RuntimeLibrarySummary {
  return record(value) && ['LIST', 'SET', 'MAP', 'QUEUE', 'DEQUE', 'BOXED', 'OPAQUE'].includes(String(value.kind)) &&
    (value.size === undefined || Number.isSafeInteger(value.size) && (value.size as number) >= 0) &&
    (value.order === undefined || ['index', 'iteration', 'unordered', 'sorted', 'fifo'].includes(String(value.order))) &&
    (value.truncated === undefined || typeof value.truncated === 'boolean') &&
    (value.reason === undefined || typeof value.reason === 'string') &&
    (value.items === undefined || Array.isArray(value.items) && value.items.length <= 32 && value.items.every(isRuntimeValue)) &&
    (value.entries === undefined || Array.isArray(value.entries) && value.entries.length <= 16 && value.entries.every(entry => record(entry) && isRuntimeValue(entry.key) && isRuntimeValue(entry.value))) &&
    (value.value === undefined || isRuntimeValue(value.value)) &&
    (Array.isArray(value.items) ? value.items.length : 0) + (Array.isArray(value.entries) ? value.entries.length * 2 : 0) <= 32 &&
    (value.size === undefined || (Array.isArray(value.items) ? value.items.length : 0) + (Array.isArray(value.entries) ? value.entries.length : 0) <= (value.size as number))
}
export function isStringObservation(value: unknown): value is { value: string; length: number; truncated: boolean } {
  return record(value) && typeof value.value === 'string' && Number.isSafeInteger(value.length) &&
    (value.length as number) >= value.value.length && typeof value.truncated === 'boolean' &&
    (value.truncated || value.length === value.value.length)
}
