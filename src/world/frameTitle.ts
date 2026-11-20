import type { MethodIdentity } from '../contracts/executionGraph'
import type { RuntimeFrame } from '../contracts/runtime'
import { displayType, methodParameterTypes, type DisplayTypeOptions } from './displayType'

export interface FrameTitleOptions {
  /** Actual captured method identity (usually ExecutionGraph.invocations[frame.id].method). */
  method?: MethodIdentity
  /** Ordered types from entry/signature evidence, not the frame's changing local rows. */
  parameterTypes?: readonly string[]
  typeDisplay?: DisplayTypeOptions
}

/** A missing descriptor is explicit. An empty captured parameter list is a proven no-argument signature. */
export function frameTitle(frame: Pick<RuntimeFrame, 'className' | 'methodName'>, options: FrameTitleOptions = {}): string {
  const owner = options.method?.owner ?? frame.className
  const name = options.method?.name ?? frame.methodName
  const type = displayType(owner, { ...options.typeDisplay, representation: 'binary' })
  if (name === '<clinit>') return `${type}.<clinit>()`
  const parameters = options.parameterTypes ?? (options.method ? methodParameterTypes(options.method.descriptor) : null)
  const methodName = name === '<init>' ? type.slice(type.lastIndexOf('.') + 1) : name
  return `${type}.${methodName}(${parameters === null || parameters === undefined ? '⟨parameters not recorded⟩' : parameters.map((parameter) => displayType(parameter)).join(', ')})`
}

/** Supplied by the append-only invocation index, never recalculated from current visible frame order. */
export function frameIdentity(invocationNumber: number): string { return `#${invocationNumber}` }
