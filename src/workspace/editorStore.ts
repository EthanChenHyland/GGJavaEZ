import { createStore } from 'zustand/vanilla'
import type { SourceLocation as RuntimeSourceLocation,TraceDocument } from '../contracts/runtime'
import type { SourceLocation } from '../ide/contracts'
import type { Tab } from './workspaceTypes'

export interface EditorState {
  tabs: Tab[]
  active: string
  nav: SourceLocation | null
  recordedView: { file: TraceDocument['sourceFiles'][number]; location: RuntimeSourceLocation } | null
  mappedExecutingSource: SourceLocation | null
}
export const editorStore = createStore<EditorState>(() => ({
  tabs: [],
  active: '',
  nav: null,
  recordedView: null,
  mappedExecutingSource: null,
}))
