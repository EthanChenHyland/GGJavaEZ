import type { TraceDocument } from '../contracts/runtime'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from './traces'

/** The curated /examples chooser. Labels name the fixtures, so they live here, not in App. */
export const curatedExampleTraces = {
  person: loadPersonTrace(), recursion: loadRecursionTrace(), arrays: loadArrayTrace(), control: loadControlTrace(),
} satisfies Record<string, TraceDocument>
export type CuratedExampleId = keyof typeof curatedExampleTraces
export const curatedExampleOptions: ReadonlyArray<{ id: CuratedExampleId; label: string }> = [
  { id: 'person', label: 'Person' },
  { id: 'recursion', label: 'Recursion · factorial(5)' },
  { id: 'arrays', label: 'Arrays · bubble sort' },
  { id: 'control', label: 'Control flow · scores' },
]
