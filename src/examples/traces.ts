/** Curated example traces (Person, recursion, arrays, control). Regression fixtures only;
 * generic runtime modules must not import this module (lint: no-restricted-imports). */
import rawPersonTrace from './demos/person/person.trace.json'
import personSource from './demos/person/Main.java?raw'
import rawRecursionTrace from './demos/recursion/recursion.trace.json'
import recursionSource from './demos/recursion/Main.java?raw'
import rawArrayTrace from './demos/arrays/trace.json'
import arraySource from './demos/arrays/Main.java?raw'
import rawControlTrace from './demos/control/trace.json'
import controlSource from './demos/control/Main.java?raw'
import type { TraceDocument } from '../contracts/runtime'
import { validateTrace } from '../runtime/trace'

export function loadPersonTrace(): TraceDocument {
  const trace = validateTrace(structuredClone(rawPersonTrace))
  if (trace.demoId !== 'person' || trace.sourceFiles.length !== 1 ||
      trace.sourceFiles[0].content !== personSource) {
    throw new Error('Person trace and Java source fixture differ')
  }
  return trace
}

export function loadRecursionTrace(): TraceDocument {
  const trace = validateTrace(structuredClone(rawRecursionTrace))
  if (trace.demoId !== 'recursion' || trace.sourceFiles.length !== 1 ||
      trace.sourceFiles[0].content !== recursionSource) {
    throw new Error('Recursion trace and Java source fixture differ')
  }
  return trace
}

export function loadArrayTrace(): TraceDocument {
  const trace = validateTrace(structuredClone(rawArrayTrace))
  if (trace.demoId !== 'arrays' || trace.sourceFiles.length !== 1 ||
      trace.sourceFiles[0].content !== arraySource) {
    throw new Error('Array trace and Java source fixture differ')
  }
  return trace
}

export function loadControlTrace(): TraceDocument {
  const trace = validateTrace(structuredClone(rawControlTrace))
  if (trace.demoId !== 'control' || trace.sourceFiles.length !== 1 ||
      trace.sourceFiles[0].content !== controlSource) {
    throw new Error('Control trace and Java source fixture differ')
  }
  return trace
}
