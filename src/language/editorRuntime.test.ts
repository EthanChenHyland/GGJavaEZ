import { beforeEach,describe,expect,it,vi } from 'vitest'

describe('lazy Java editor runtime', () => {
  const monacoLoaded = vi.fn()
  const intelligenceLoaded = vi.fn()
  const setupLoaded=vi.fn()
  const registerJavaIntelligence = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('monaco-editor/editor/editor.api.js', () => {
      monacoLoaded()
      return { editor: { getModels: () => [] } }
    })
    vi.doMock('./monaco', () => {
      intelligenceLoaded()
      return { registerJavaIntelligence }
    })
    vi.doMock('../ui/monacoSetup',()=>{setupLoaded();return{}})
  })

  it('does not load editor dependencies for inspection or subscriptions', async () => {
    const loader = await import('./editorRuntime')
    const listener = vi.fn()
    const unsubscribe = loader.onJavaEditorRuntimeLoaded(listener)
    expect(loader.getLoadedJavaEditorRuntime()).toBeUndefined()
    expect(monacoLoaded).not.toHaveBeenCalled()
    expect(intelligenceLoaded).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('shares the pending import and publishes before the editable boundary resolves', async () => {
    const loader = await import('./editorRuntime')
    const order: string[] = []
    const listener = vi.fn(() => {expect(setupLoaded).toHaveBeenCalledTimes(1);order.push('registered') })
    const unsubscribe = loader.onJavaEditorRuntimeLoaded(listener)
    const first = loader.loadJavaEditorRuntime()
    expect(loader.loadJavaEditorRuntime()).toBe(first)
    const loaded = await first.then((value) => { order.push('editor'); return value })
    expect(order).toEqual(['registered', 'editor'])
    expect(monacoLoaded).toHaveBeenCalledTimes(1)
    expect(intelligenceLoaded).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledExactlyOnceWith(loaded)
    expect(loader.getLoadedJavaEditorRuntime()).toBe(loaded)
    expect(loaded.registerJavaIntelligence).toBe(registerJavaIntelligence)
    expect(await loader.loadJavaEditorRuntime()).toBe(loaded)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('does not register an unmounted workspace when a pending import completes', async () => {
    const loader = await import('./editorRuntime')
    const listener = vi.fn()
    const unsubscribe = loader.onJavaEditorRuntimeLoaded(listener)
    const pending = loader.loadJavaEditorRuntime()
    unsubscribe()
    const loaded = await pending
    expect(listener).not.toHaveBeenCalled()
    const remounted = vi.fn()
    const stop = loader.onJavaEditorRuntimeLoaded(remounted)
    expect(remounted).toHaveBeenCalledExactlyOnceWith(loaded)
    stop()
  })
})
