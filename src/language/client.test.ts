import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageClient, StaleLanguageResponse } from './client'
import { documentUri, type LanguageSnapshot } from './protocol'

const status = (generation = 1, state: LanguageSnapshot['status'] = 'ready'): LanguageSnapshot => ({ projectId: 'p1', generation, status: state, message: null, diagnostics: [], metrics: {} })
const response = (value: unknown) => ({ ok: true, status: 200, json: async () => value }) as Response
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }

afterEach(() => { vi.useRealTimers() })

describe('language document lifecycle', () => {
  it('explicit retry reopens a displaced project and resends its current unsaved draft', async () => {
    const notifications: unknown[] = []
    let opens = 0
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/restart')) return { ok: false, status: 409, json: async () => ({ error: 'Language project is not open' }) } as Response
      if (String(url).endsWith('/open')) return response(status(++opens))
      if (String(url).endsWith('/notify')) notifications.push(JSON.parse(String(init?.body)))
      return response({ ok: true })
    }) as unknown as typeof fetch
    const client = new LanguageClient({ fetch: fetcher, pollMs: 0 })
    await client.open('p1')
    client.openDocument('Main.java', 'class Main { int unsaved = 42; }')
    await client.flush()
    await client.restart()
    await client.flush()
    expect(opens).toBe(2)
    expect(client.getSnapshot()).toMatchObject({ projectId: 'p1', generation: 2, status: 'ready' })
    expect(notifications.at(-1)).toMatchObject({ method: 'textDocument/didOpen', params: { textDocument: {
      uri: documentUri('p1', 'Main.java'), version: 1, text: 'class Main { int unsaved = 42; }',
    } } })
    expect(client.getDocumentText('Main.java')).toContain('unsaved = 42')
    client.dispose()
  })

  it('does not reclaim the language workspace for other restart failures', async () => {
    let opens = 0
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/restart')) return { ok: false, status: 409, json: async () => ({ error: 'Stale language document version' }) } as Response
      if (String(url).endsWith('/open')) { opens++; return response(status()) }
      return response({ ok: true })
    }) as unknown as typeof fetch
    const client = new LanguageClient({ fetch: fetcher, pollMs: 0 })
    await client.open('p1')
    await client.restart()
    expect(opens).toBe(1)
    expect(client.getSnapshot()).toMatchObject({ status: 'unavailable', message: 'Stale language document version' })
    client.dispose()
  })

  it('sends a document opened while project initialization is pending', async () => {
    const opened = deferred<Response>()
    const notifications: unknown[] = []
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/open')) return opened.promise
      if (String(url).endsWith('/notify')) notifications.push(JSON.parse(String(init?.body)))
      return response({ ok: true })
    }) as unknown as typeof fetch
    const client = new LanguageClient({ fetch: fetcher, pollMs: 0 })
    const opening = client.open('p1')
    client.openDocument('src/My Main.java', 'class Main {}')
    opened.resolve(response(status()))
    await opening
    await client.flush()
    expect(notifications).toEqual([{ method: 'textDocument/didOpen', params: { textDocument: { uri: documentUri('p1', 'src/My Main.java'), languageId: 'java', version: 1, text: 'class Main {}' } } }])
    await client.closeDocument('src/My Main.java')
    expect(notifications.at(-1)).toMatchObject({ method: 'textDocument/didClose' })
    client.dispose()
  })

  it('rejects a request result after the source version changes', async () => {
    const pending = deferred<Response>()
    const fetchSpy = vi.fn(async (url: string | URL | Request) => String(url).endsWith('/request') ? pending.promise : response(String(url).endsWith('/open') ? status() : { ok: true }))
    const client = new LanguageClient({ fetch: fetchSpy as unknown as typeof fetch, pollMs: 0, debounceMs: 0 })
    await client.open('p1')
    client.openDocument('Main.java', 'class Main {}')
    await client.flush()
    const request = client.request('textDocument/hover', {}, { path: 'Main.java' })
    await vi.waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith('/request'))).toBe(true))
    client.changeDocument('Main.java', 'class Main { int x; }')
    pending.resolve(response({ contents: 'stale' }))
    await expect(request).rejects.toBeInstanceOf(StaleLanguageResponse)
    client.dispose()
  })

  it('stops polling when the service reports unavailable', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async (url: string | URL | Request) => response(String(url).endsWith('/open') ? status(1, 'starting') : status(1, 'unavailable'))) as unknown as typeof fetch
    const client = new LanguageClient({ fetch: fetcher, pollMs: 100 })
    await client.open('p1')
    await vi.advanceTimersByTimeAsync(100)
    expect(client.getSnapshot().status).toBe('unavailable')
    const count = vi.mocked(fetcher).mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(vi.mocked(fetcher).mock.calls).toHaveLength(count)
    client.dispose()
  })

  it('does not replace a newer draft when an older save finishes', async () => {
    const notifications: { method: string; params: { text?: string } }[] = []
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/notify')) notifications.push(JSON.parse(String(init?.body)))
      return response(String(url).endsWith('/open') ? status() : { ok: true })
    }) as unknown as typeof fetch
    const client = new LanguageClient({ fetch: fetcher, pollMs: 0 })
    await client.open('p1')
    client.openDocument('Main.java', 'saved')
    await client.flush()
    client.changeDocument('Main.java', 'saved plus more')
    await client.saveDocument('Main.java', 'saved')
    expect(client.getDocumentText('Main.java')).toBe('saved plus more')
    expect(notifications.at(-1)).toMatchObject({ method: 'textDocument/didSave', params: { text: 'saved' } })
    client.dispose()
  })
})
