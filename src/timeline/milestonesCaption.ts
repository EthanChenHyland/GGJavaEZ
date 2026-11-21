import type { ExecutionFact } from '../contracts/executionGraph'
import type { RuntimeValue, TraceEvent } from '../contracts/runtime'
import { formatValue } from '../debugger/formatValue'

const shortType = (type: string) => type.slice(type.lastIndexOf('.') + 1).replaceAll('$', '.')

function methodCaption(owner: string, name: string, args?: readonly RuntimeValue[]): string | undefined {
  if (!name || name === '<unknown>') return undefined
  if (name === '<clinit>') return owner === '<unknown>' ? 'class initialization' : `${shortType(owner)} class initialization`
  const method = name === '<init>' ? owner === '<unknown>' ? 'constructor' : shortType(owner) : name
  if (args === undefined) return method
  const values = args.slice(0, 3).map(valueCaption)
  if (args.length > values.length) values.push('…')
  return `${method}(${values.join(', ')})`
}

function textPreview(text: string): string {
  const limit = 48
  return text.length <= limit ? JSON.stringify(text) : `${JSON.stringify(text.slice(0, limit))}…`
}

function valueCaption(value: RuntimeValue): string {
  if (value.kind === 'reference') return `reference to ${shortType(value.javaType)}`
  if (value.kind === 'stringSummary') return textPreview(value.value)
  if (value.kind === 'unavailable') return 'value unavailable'
  return formatValue(value)
}

function arrayCaption(event: Extract<TraceEvent, { type: 'ALLOCATE_ARRAY' }>): string {
  const type = shortType(event.elementType), length = event.length ?? event.elements.length
  const brackets = type.indexOf('[')
  return brackets === -1 ? `${type}[${length}]` : `${type.slice(0, brackets)}[${length}]${type.slice(brackets)}`
}

function ioCaption(channel: 'stdin' | 'stdout' | 'stderr', text?: string): string {
  const action = channel === 'stdin' ? 'Input consumed' : channel === 'stderr' ? 'Error output' : 'Output written'
  return text === undefined ? action : `${action} · ${textPreview(text)}`
}

function exceptionCaption(action: 'Throw' | 'Catch', className?: string): string {
  return className ? `${action} ${shortType(className)}` : `${action} exception`
}

function factCaption(fact: ExecutionFact): string {
  switch (fact.kind) {
    case 'call': return `Call ${methodCaption(fact.declared.owner, fact.declared.name, fact.arguments) ?? 'method'}`
    case 'call-return': return fact.inputText === undefined ? `Call result: ${valueCaption(fact.value)}` : `Input received: ${valueCaption(fact.value)}`
    case 'enter': {
      const { method, parameters } = fact
      const args = parameters.length || method.descriptor.startsWith('()')
        ? parameters.slice(0, 4).map(parameter => parameter.value)
        : undefined
      return `Enter ${methodCaption(method.owner, method.name, args) ?? 'method'}`
    }
    case 'receiver-ready': return 'Receiver available'
    case 'write': return `${fact.target.name} = ${valueCaption(fact.value)}`
    case 'read': return `Read ${fact.target.name}: ${valueCaption(fact.value)}`
    case 'return': return `Return ${valueCaption(fact.value)}`
    case 'exit': return 'Method exited'
    case 'unwind': return 'Unwind frame'
    case 'object': return `Observe ${shortType(fact.className)}`
    case 'observe': return 'Observe object state'
    case 'class': return fact.initialization === 'observed' ? `Observe ${shortType(fact.className)} static state` : fact.initialization === 'started' ? `Initialize ${shortType(fact.className)}` : `${shortType(fact.className)} initialized`
    case 'file': return `${fact.operation[0].toUpperCase()}${fact.operation.slice(1)} file`
    case 'constructed': return `${shortType(fact.className)} constructed`
    case 'io': return ioCaption(fact.channel, fact.text)
    case 'throw': return exceptionCaption('Throw', fact.className)
    case 'catch': return exceptionCaption('Catch', fact.className)
  }
}

/** Display text for the exact current event. Context comes from that event's recorded execution site. */
export function eventCaption(event: TraceEvent): { headline: string; context?: string } {
  switch (event.type) {
    case 'ENTER_METHOD': return { headline: `Enter ${event.invocationLabel ?? methodCaption(event.className, event.methodName) ?? 'method'}` }
    case 'ALLOCATE_OBJECT': return { headline: `Object observed · ${shortType(event.className)} #${event.displayId}` }
    case 'ALLOCATE_ARRAY': return { headline: `Array observed · ${arrayCaption(event)} #${event.displayId}` }
    case 'ARRAY_READ': return { headline: `Read [${event.index}]: ${valueCaption(event.value)}` }
    case 'ARRAY_WRITE': return { headline: `Write [${event.index}] = ${valueCaption(event.value)}` }
    case 'RETURN_VALUE': return { headline: event.label === 'Value returned' ? `Return ${valueCaption(event.value)}` : event.label }
    case 'SET_STATIC': return { headline: `${event.label} · ${valueCaption(event.value)}` }
    case 'BRANCH_EVALUATE': return { headline: event.taken ? 'Branch taken' : 'Branch skipped' }
    case 'THROW_EXCEPTION': return { headline: exceptionCaption('Throw', event.className) }
    case 'CATCH_EXCEPTION': return { headline: exceptionCaption('Catch') }
    case 'INPUT_READ': return { headline: ioCaption('stdin', event.text) }
    case 'OUTPUT_WRITE': case 'CONSOLE_WRITE': return { headline: ioCaption(event.type === 'CONSOLE_WRITE' ? event.channel : 'stdout', event.text) }
    case 'CONSOLE_INPUT': return { headline: ioCaption('stdin', event.text) }
    case 'EXECUTION_FACT': return {
      headline: factCaption(event.fact),
      context: event.fact.kind === 'enter' ? undefined : methodCaption(event.fact.context.owner, event.fact.context.name),
    }
    default: return { headline: event.label }
  }
}

/** Rail labels are shorter than the current caption. The milestone still carries the exact recorded label. */
export function milestoneCaption(event: TraceEvent): string {
  switch (event.type) {
    case 'ENTER_METHOD': return event.invocationLabel ?? methodCaption(event.className, event.methodName) ?? event.label
    case 'ALLOCATE_OBJECT': return `${shortType(event.className)} #${event.displayId}`
    case 'ALLOCATE_ARRAY': return arrayCaption(event)
    case 'RETURN_VALUE': return `Return ${valueCaption(event.value)}`
    case 'INPUT_READ': case 'CONSOLE_INPUT': return ioCaption('stdin')
    case 'OUTPUT_WRITE': return ioCaption('stdout')
    case 'CONSOLE_WRITE': return ioCaption(event.channel)
    default: return eventCaption(event).headline
  }
}
