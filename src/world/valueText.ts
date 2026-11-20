import type { RuntimeObject, RuntimeValue } from '../contracts/runtime'
import type { ValueObservation, ValueText } from '../contracts/world'
import { displayType, type DisplayTypeOptions } from './displayType'

export interface ValueTextOptions {
  context?: 'frame' | 'object' | 'exact'
  /** Only objects in the RuntimeState at the applied prefix, never the full future catalog. */
  objects?: Readonly<Record<string, RuntimeObject>>
  target?: RuntimeObject | null
  typeDisplay?: DisplayTypeOptions
}
export interface CapturedString { value: string; length?: number; truncated?: boolean }
const marker = '⟨not recorded⟩' as const

/** Null and missing values have readable surfaces, but no spatial attachment. */
export const hasRecordedValuePort=(value:ValueText):boolean=>value.kind!=='null'&&value.kind!=='not-recorded'

export function notRecordedValue(reason = 'No value was captured'): ValueText {
  return { kind: 'not-recorded', text: marker, exact: marker, observation: 'UNAVAILABLE', reason }
}

/** Java escapes preserve every captured UTF-16 code unit, including lone surrogates. */
export function escapeJava(text: string, quote: '"' | "'" = '"'): string {
  const escapes: Readonly<Record<string, string>> = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '\\': '\\\\' }
  let result = ''
  for (let index = 0; index < text.length; index++) {
    const char = text[index], code = text.charCodeAt(index)
    result += char === quote ? `\\${char}` : escapes[char] ?? (
      code < 32 || (code >= 127 && code <= 159) || (code >= 0xd800 && code <= 0xdfff)
        ? `\\u${code.toString(16).padStart(4, '0')}` : char)
  }
  return result
}

/** Character bounds use Unicode code points, never half a surrogate pair. */
export function truncateFrameText(text: string, limit = 28): string {
  const chars = Array.from(text)
  const capacity = Math.max(1, Math.floor(limit))
  if (chars.length <= capacity) return text
  const leading = Math.ceil((capacity - 1) / 2), trailing = capacity - 1 - leading
  return chars.slice(0, leading).join('') + '…' + (trailing ? chars.slice(-trailing).join('') : '')
}

/** Identity gets its own untruncated field; only the display title consumes this budget. */
export function titleWithIdentity(title: string, identity: string, limit = 28): { title: string; exactTitle: string; identity: string } {
  return { title: truncateFrameText(title, limit), exactTitle: title, identity }
}

/** Exact means all captured content, not the unrecorded original String. Metadata stays structured. */
export function stringValueText(captured: CapturedString | null | undefined, options: Pick<ValueTextOptions, 'context'> = {}): ValueText {
  if (!captured) return notRecordedValue('String content was not captured')
  const chars = Array.from(captured.value)
  const exact = `"${escapeJava(captured.value)}"`
  const cut = options.context !== 'exact' && chars.length > 48
  const literal = cut ? `"${escapeJava(chars.slice(0, 48).join(''))}…"` : exact
  const recordedLength = captured.length
  const observation: ValueObservation = {
    observation: captured.truncated ? 'TRUNCATED' : 'OBSERVED',
    ...(recordedLength === undefined ? {} : { recordedLength }),
    ...(captured.truncated ? { reason: 'Recorder captured only a String preview' } : {}),
  }
  const face = literal + (recordedLength === undefined ? '' : ` (${recordedLength} chars)`)
  return { kind: 'string', text: options.context === 'frame' ? truncateFrameText(face) : face, exact, ...observation }
}

function primitiveLiteral(value: Extract<RuntimeValue, { kind: 'primitive' }>): string {
  if (value.javaType === 'char') return `'${escapeJava(String(value.value), "'")}'`
  if (typeof value.value !== 'number') return String(value.value)
  if (Object.is(value.value, -0)) return '-0.0'
  const text = String(value.value)
  return (value.javaType === 'float' || value.javaType === 'double') && Number.isFinite(value.value)
    && !/[.eE]/.test(text) ? text + '.0' : text
}

/** Single formatter for captured values. No missing member or absent target becomes a default. */
export function valueText(value: RuntimeValue | null | undefined, options: ValueTextOptions = {}): ValueText {
  if (!value || value.kind === 'uninitialized') return notRecordedValue()
  if (value.kind === 'unavailable') return notRecordedValue(value.reason)
  if (value.kind === 'null') return { kind: 'null', text: 'null', exact: 'null', observation: 'OBSERVED' }
  if (value.kind === 'stringSummary') return stringValueText({ value: value.value }, options)
  if (value.kind === 'primitive') {
    const exact = primitiveLiteral(value)
    return { kind: 'primitive', text: options.context === 'frame' ? truncateFrameText(exact) : exact, exact, observation: 'OBSERVED' }
  }
  const target = options.target === undefined ? options.objects?.[value.objectId] : options.target
  if (!target || target.id !== value.objectId) return notRecordedValue('Reference target was not recorded at this prefix')
  const runtimeType = displayType(target.className, options.typeDisplay)
  const identity = `#${target.displayId}`
  let title = runtimeType
  let observation: ValueObservation = { observation: 'OBSERVED' }
  if (target.string) {
    const content = stringValueText(target.string, options)
    return { ...content, kind: 'reference', text: `${content.text} ${identity}`, exact: `${content.exact} · ${runtimeType} ${identity}`, targetId: target.id, targetType: target.className }
  }
  if (target.array) {
    const component = displayType(target.array.elementType, options.typeDisplay)
    const arrayAt = component.indexOf('[]')
    title = arrayAt < 0 ? `${component}[${target.array.length}]` : `${component.slice(0, arrayAt)}[${target.array.length}]${component.slice(arrayAt)}`
    if (target.array.truncated) observation = { observation: 'PARTIALLY_OBSERVED', reason: 'Only some array cells were captured' }
  } else if (target.library && ['LIST', 'SET', 'MAP', 'QUEUE', 'DEQUE'].includes(target.library.kind)) {
    const kind = { LIST: 'List', SET: 'Set', MAP: 'Map', QUEUE: 'Queue', DEQUE: 'Deque' }[target.library.kind as 'LIST' | 'SET' | 'MAP' | 'QUEUE' | 'DEQUE']
    title = kind + (target.library.size === undefined ? ' · size not recorded' : ` · size ${target.library.size}`)
    const captured = target.library.entries?.length ?? target.library.items?.length ?? 0
    if (target.library.truncated || (target.library.size !== undefined && captured < target.library.size)) {
      observation = { observation: 'PARTIALLY_OBSERVED', reason: 'Only some collection entries were captured' }
    }
  }
  return { kind: 'reference', text: `${options.context === 'frame' ? truncateFrameText(title) : title} ${identity}`,
    exact: `${title} ${identity}`, targetId: target.id, targetType: target.className, ...observation }
}
