import { createStore } from 'zustand/vanilla'
import type { JdkStatus,ProjectEntry,ProjectSummary } from '../ide/contracts'
import { defaultLaunch,type JavaProject,type LaunchConfiguration } from '../ide/javaProject'

export interface WorkspaceState {
  projects: ProjectSummary[]
  projectId: string
  tree: ProjectEntry[]
  jdk: JdkStatus | null
  hydrated: boolean
  mainClass: string
  javaProject: JavaProject | null
  projectStatus: string
  launch: LaunchConfiguration
  cwdInvalid: boolean
}
export const workspaceStore = createStore<WorkspaceState>(() => ({
  projects: [],
  projectId: '',
  tree: [],
  jdk: null,
  hydrated: false,
  mainClass: '',
  javaProject: null,
  projectStatus: '',
  launch: defaultLaunch,
  cwdInvalid: false,
}))
