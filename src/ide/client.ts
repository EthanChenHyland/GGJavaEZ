import type { BuildResult, JdkStatus, ProjectEntry, ProjectFile, ProjectSummary, RunEvent, RunResponse, RunSnapshot, VisualizeResponse } from './contracts'

async function request<T>(url: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: data === undefined ? undefined : { 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`)
  return payload as T
}

const project = (id: string) => `/api/projects/${encodeURIComponent(id)}`
export const bridge = {
  health: () => request<{ jdk: JdkStatus }>('/api/health'),
  detectJdk: (home: string | null) => request<JdkStatus>('/api/jdk/detect', 'POST', { home }),
  projects: () => request<ProjectSummary[]>('/api/projects'),
  createProject: (name: string) => request<ProjectSummary>('/api/projects', 'POST', { name }),
  importProject: (name: string, files: { path: string; content: string }[]) => request<ProjectSummary>('/api/projects/import', 'POST', { name, files }),
  tree: (id: string) => request<ProjectEntry[]>(`${project(id)}/tree`),
  file: (id: string, path: string) => request<ProjectFile>(`${project(id)}/files?path=${encodeURIComponent(path)}`),
  save: (id: string, path: string, content: string, revision: string) => request<ProjectFile>(`${project(id)}/files`, 'PUT', { path, content, revision }),
  createFile: (id: string, path: string) => request<ProjectFile>(`${project(id)}/files`, 'POST', { path, content: '' }),
  createFolder: (id: string, path: string) => request<{ path: string }>(`${project(id)}/folders`, 'POST', { path }),
  rename: (id: string, from: string, to: string) => request<{ path: string }>(`${project(id)}/rename`, 'POST', { from, to }),
  delete: (id: string, path: string) => request<{ ok: boolean }>(`${project(id)}/entries?path=${encodeURIComponent(path)}`, 'DELETE'),
  build: (id: string) => request<BuildResult>(`${project(id)}/build`, 'POST', {}),
  run: (id: string, mainClass: string) => request<RunResponse>(`${project(id)}/run`, 'POST', { mainClass }),
  visualize: (id: string, mainClass: string) => request<VisualizeResponse>(`${project(id)}/visualize`, 'POST', { mainClass }),
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
