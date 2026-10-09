import type { ResolvedBreakpoint } from '../debugger/contracts'
import type { DirtyDecision } from '../ide/commands'
import type { ProjectFile } from '../ide/contracts'
import type { SourceBindings } from '../ide/sourceBindings'
export type Tab = ProjectFile & { draft: string }
export type BreakpointProjection = {
  projectId: string; sessionId: string; generation: number; bindings: SourceBindings
  desired: readonly ResolvedBreakpoint[]; tabs: readonly Tab[]; acknowledgments: readonly ResolvedBreakpoint[]
  points: ResolvedBreakpoint[]
}
export type Tool = 'console' | 'problems' | 'debugger' | 'errors'
export type WorkspaceMode = 'code' | 'visualize' | 'debug'
export type PendingDecision = { label: string; paths: string[]; action?: () => void | Promise<void>; resolve?: (choice: DirtyDecision) => void } | null
export type ProjectDialog = { kind: 'class' | 'file' | 'folder' | 'rename' | 'delete' | 'project' | 'open'; path: string; value: string; resolve?: (value: string | null) => void; resolveDelete?: (value: DirtyDecision) => void; dirtyPaths?: readonly string[] } | null
