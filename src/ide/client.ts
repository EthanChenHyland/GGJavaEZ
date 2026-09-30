import type { BuildResult, JdkStatus, ProjectEntry, ProjectFile, ProjectSummary, RunEvent, RunResponse, RunSnapshot, VisualizeResponse } from './contracts'
import type { DebugCommand, DebugSession, SourceBreakpoint } from '../debugger/contracts'
import type { JavaProject, LaunchConfiguration } from './javaProject'
import type { LanguageSnapshot } from '../language/protocol'
import type { ExecutionSession, StartExecutionRequest } from '../execution/contracts'

async function request<T>(url: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: data === undefined ? undefined : { 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`)
  return payload as T
}

const project = (id: string) => `/api/projects/${encodeURIComponent(id)}`
export const bridge = {
  executionCurrent: () => request<ExecutionSession | null>('/api/execution/current'),
  executionStart: (id: string, options: StartExecutionRequest) => request<ExecutionSession>(`${project(id)}/execution`, 'POST', options),
  executionSnapshot: (id: string) => request<ExecutionSession>(`/api/execution/${encodeURIComponent(id)}`),
  executionCommand: (id: string, command: DebugCommand) => request<ExecutionSession>(`/api/execution/${encodeURIComponent(id)}/command`, 'POST', { command }),
  executionInput: (id: string, text: string) => request<{ ok: boolean }>(`/api/execution/${encodeURIComponent(id)}/input`, 'POST', { text }),
  executionStop: (id: string) => request<ExecutionSession>(`/api/execution/${encodeURIComponent(id)}/stop`, 'POST', {}),
  executionBreakpoints: (id: string, breakpoints: SourceBreakpoint[]) => request<ExecutionSession>(`/api/execution/${encodeURIComponent(id)}/breakpoints`, 'POST', { breakpoints }),
  executionEvents: (id: string, onSnapshot: (session: ExecutionSession) => void) => {
    const source = new EventSource(`/api/execution/${encodeURIComponent(id)}/events`)
    source.addEventListener('session', (event) => onSnapshot(JSON.parse((event as MessageEvent).data) as ExecutionSession))
    return source
  },
  health: () => request<{ jdk: JdkStatus }>('/api/health'),
  detectJdk: (home: string | null) => request<JdkStatus>('/api/jdk/detect', 'POST', { home }),
  projects: () => request<ProjectSummary[]>('/api/projects'),
  createProject: (name: string) => request<ProjectSummary>('/api/projects', 'POST', { name }),
  importProject: (name: string, files: { path: string; content: string; encoding?: 'base64' }[]) => request<ProjectSummary>('/api/projects/import', 'POST', { name, files }),
  javaProject: (id: string) => request<JavaProject>(`${project(id)}/java-project`),
  languageStatus: (id: string) => request<LanguageSnapshot>(`${project(id)}/language`),
  languageOpen: (id: string) => request<LanguageSnapshot>(`${project(id)}/language/open`, 'POST', {}),
  languageRestart: (id: string) => request<LanguageSnapshot>(`${project(id)}/language/restart`, 'POST', {}),
  languageRequest: <T>(id: string, method: string, params: unknown) => request<T>(`${project(id)}/language/request`, 'POST', { method, params }),
  languageNotify: (id: string, method: string, params: unknown) => request<{ ok: true }>(`${project(id)}/language/notify`, 'POST', { method, params }),
  tree: (id: string) => request<ProjectEntry[]>(`${project(id)}/tree`),
  file: (id: string, path: string) => request<ProjectFile>(`${project(id)}/files?path=${encodeURIComponent(path)}`),
  save: (id: string, path: string, content: string, revision: string) => request<ProjectFile>(`${project(id)}/files`, 'PUT', { path, content, revision }),
  createFile: (id: string, path: string, content = '') => request<ProjectFile>(`${project(id)}/files`, 'POST', { path, content }),
  createFolder: (id: string, path: string) => request<{ path: string }>(`${project(id)}/folders`, 'POST', { path }),
  rename: (id: string, from: string, to: string) => request<{ path: string }>(`${project(id)}/rename`, 'POST', { from, to }),
  delete: (id: string, path: string) => request<{ ok: boolean }>(`${project(id)}/entries?path=${encodeURIComponent(path)}`, 'DELETE'),
  build: (id: string) => request<BuildResult>(`${project(id)}/build`, 'POST', {}),
  run: (id: string, mainClass: string, launch?: LaunchConfiguration) => request<RunResponse>(`${project(id)}/run`, 'POST', { ...launch, mainClass }),
  visualize: (id: string, mainClass: string, launch?: LaunchConfiguration) => request<VisualizeResponse>(`${project(id)}/visualize`, 'POST', { ...launch, mainClass }),
  debug: (id: string, mainClass: string, breakpoints: SourceBreakpoint[], launch?: LaunchConfiguration) => request<DebugSession>(`${project(id)}/debug`, 'POST', { ...launch, mainClass, breakpoints }),
  debugCurrent: () => request<DebugSession | null>('/api/debug/current'),
  debugSnapshot: (id: string) => request<DebugSession>(`/api/debug/${encodeURIComponent(id)}`),
  debugCommand: (id: string, command: DebugCommand) => request<DebugSession>(`/api/debug/${encodeURIComponent(id)}/command`, 'POST', { command }),
  debugInput: (id: string, text: string) => request<{ ok: boolean }>(`/api/debug/${encodeURIComponent(id)}/input`, 'POST', { text }),
  debugBreakpoints: (id: string, breakpoints: SourceBreakpoint[]) => request<DebugSession>(`/api/debug/${encodeURIComponent(id)}/breakpoints`, 'POST', { breakpoints }),
  currentRun: () => request<RunSnapshot | null>('/api/runs/current'),
  runSnapshot: (id: string) => request<RunSnapshot>(`/api/runs/${encodeURIComponent(id)}`),
  stop: (id: string) => request<RunSnapshot>(`/api/runs/${encodeURIComponent(id)}/stop`, 'POST', {}),
  input: (id: string, text: string) => request<{ ok: true }>(`/api/runs/${encodeURIComponent(id)}/input`, 'POST', { text }),
  events: (id: string, after: number, onEvent: (event: RunEvent) => void) => {
    const source = new EventSource(`/api/runs/${encodeURIComponent(id)}/events?after=${after}`)
    source.addEventListener('run', (event) => onEvent(JSON.parse((event as MessageEvent).data) as RunEvent))
    return source
  },
}
