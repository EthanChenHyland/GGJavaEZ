import type { registerJavaIntelligence } from './monaco'

export interface JavaEditorRuntime {
  monaco: typeof import('monaco-editor/editor/editor.api.js')
  registerJavaIntelligence: typeof registerJavaIntelligence
}

let runtime: JavaEditorRuntime | undefined
let loading: Promise<JavaEditorRuntime> | undefined
const listeners = new Set<(loaded: JavaEditorRuntime) => void>()

/** Call from the lazy editable-editor boundary, before mounting its first model. */
export function loadJavaEditorRuntime(): Promise<JavaEditorRuntime> {
  if (runtime) return Promise.resolve(runtime)
  if (loading) return loading
  loading = Promise.all([
    import('monaco-editor/editor/editor.api.js'),
    import('./monaco'),
    // Contribution services must exist before Java provider registration initializes
    // StandaloneServices; otherwise lazy first-open lacks Suggest/Code Action services.
    import('../ui/monacoSetup'),
  ]).then(([monaco, intelligence]) => {
    runtime = { monaco, registerJavaIntelligence: intelligence.registerJavaIntelligence }
    for (const listener of listeners) listener(runtime)
    return runtime
  }).catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}

/** Cleanup and filesystem operations must not fetch Monaco merely to inspect models. */
export function getLoadedJavaEditorRuntime(): JavaEditorRuntime | undefined {
  return runtime
}

/** Does not initiate a load. Unsubscribing also cancels a pending registration. */
export function onJavaEditorRuntimeLoaded(listener: (loaded: JavaEditorRuntime) => void): () => void {
  listeners.add(listener)
  if (runtime) listener(runtime)
  return () => { listeners.delete(listener) }
}
