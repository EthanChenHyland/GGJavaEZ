import { createStore } from 'zustand/vanilla'
import type { SourceLocation as RuntimeSourceLocation,TraceDocument } from '../contracts/runtime'
import type { SourceLocation } from '../ide/contracts'
import type { Tab } from './workspaceTypes'
import type {SourceFileProof} from '../shell/source/sourceSync'

export interface EditorState {
  tabs: Tab[]
  active: string
  nav: SourceLocation | null
  recordedView: { file: TraceDocument['sourceFiles'][number]; location: RuntimeSourceLocation|null } | null
  mappedExecutingSource: (SourceLocation&{recordedFileId?:string}) | null
  sourceUnavailable:boolean
  sourceFileProof:SourceFileProof|null
}
export const editorStore = createStore<EditorState>(() => ({
  tabs: [],
  active: '',
  nav: null,
  recordedView: null,
  mappedExecutingSource: null,
  sourceUnavailable:false,
  sourceFileProof:null,
}))
