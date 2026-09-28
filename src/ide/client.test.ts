import { afterEach, describe, expect, it, vi } from 'vitest'
import { bridge } from './client'

const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response

afterEach(() => vi.unstubAllGlobals())

describe('IDE bridge', () => {
  it('sends project-relative paths as encoded query values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ path: 'src/Main.java', content: 'class Main {}', revision: 'r1' }))
    vi.stubGlobal('fetch', fetchMock)
    await bridge.file('opaque/id', 'src/Main.java')
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/opaque%2Fid/files?path=src%2FMain.java', expect.objectContaining({ method: 'GET' }))
  })

  it('sends revision when saving and surfaces stale-save errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ error: 'Stale revision' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    await expect(bridge.save('p1', 'Main.java', 'edited', 'old')).rejects.toThrow('Stale revision')
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/files', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ path: 'Main.java', content: 'edited', revision: 'old' }) }))
  })

  it('keeps Run and Visualize separate by issuing only the JVM run endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ build: { success: true }, run: null }))
    vi.stubGlobal('fetch', fetchMock)
    await bridge.run('p1', 'Main')
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/run', expect.objectContaining({ method: 'POST', body: JSON.stringify({ mainClass: 'Main' }) }))
  })
})
