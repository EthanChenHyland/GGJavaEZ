export interface JavaProject {
  projectId: string
  revision: string
  buildSystem: 'plain' | 'maven' | 'gradle'
  status: 'ready' | 'failed'
  diagnostic: string | null
  sourceRoots: string[]
  testSourceRoots: string[]
  outputRoots: string[]
  dependencies: { name: string }[]
  runnableTargets: string[]
  elapsedMs: number
}

export interface LaunchConfiguration {
  mainClass: string
  workingDirectory: string
  programArgs: string[]
  jvmArgs: string[]
}

export const defaultLaunch: LaunchConfiguration = { mainClass: '', workingDirectory: '.', programArgs: [], jvmArgs: [] }
