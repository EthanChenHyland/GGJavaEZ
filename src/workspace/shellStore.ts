import { createStore } from 'zustand/vanilla'
import type { CommandContext } from '../ide/commands'
import type { PendingDecision,ProjectDialog,Tool,WorkspaceMode } from './workspaceTypes'

export interface ShellState {
  jdkInput: string
  showJdk: boolean
  tool: Tool
  workspaceMode: WorkspaceMode
  explorerOpen: boolean
  inspectorHidden: boolean
  inspectorSide: 'left' | 'right'
  bottomOpen: boolean
  focusSourceOpen: boolean
  sourceOpen: boolean
  picker: { mode: 'files' | 'commands'; context: CommandContext } | null
  tabMenu: { context: CommandContext; x: number; y: number } | null
  input: string
  notice: string
  busy: boolean
  pending: PendingDecision
  projectDialog: ProjectDialog
  showLaunch: boolean
  showSymbols: boolean
  runtimeExpanded: boolean
  projectWidth: number
  editorWidth: number
  bottomHeight: number
  collapsed: Set<string>
}
export const shellStore = createStore<ShellState>(() => ({
  jdkInput: '',
  showJdk: false,
  tool: 'console',
  workspaceMode: 'code',
  explorerOpen: false,
  inspectorHidden: false,
  inspectorSide: 'right',
  bottomOpen: false,
  focusSourceOpen: false,
  sourceOpen: true,
  picker: null,
  tabMenu: null,
  input: '',
  notice: '',
  busy: false,
  pending: null,
  projectDialog: null,
  showLaunch: false,
  showSymbols: false,
  runtimeExpanded: false,
  projectWidth: 14,
  editorWidth: 38,
  bottomHeight: 29,
  collapsed: new Set(),
}))
