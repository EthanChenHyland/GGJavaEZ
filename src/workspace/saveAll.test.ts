import { describe, expect, it, vi } from 'vitest'
import { SaveAllError, saveAllOrThrow } from './saveAll'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('Save All orchestration', () => {
  it('succeeds with no tasks', async () => {
    await expect(saveAllOrThrow([])).resolves.toEqual({ successes: [], failures: [] })
  })

  it('attempts later tasks after each failure and reports successes and original failures', async () => {
    const conflict = new Error('Source changed on disk; draft retained')
    const storageFailure = 'Browser draft storage is full'
    const attempted: string[] = []
    const failureByPath = new Map<string, unknown>([['open.java', conflict], ['closed.java', storageFailure]])
    const paths = ['saved.java', 'open.java', 'later.java', 'closed.java', 'last.java']
    const tasks = paths.map((path) => ({ path, save: vi.fn(async () => {
      attempted.push(path)
      if (failureByPath.has(path)) throw failureByPath.get(path)
    }) }))

    const outcome = await saveAllOrThrow(tasks).catch((error: unknown) => error)
    expect(attempted).toEqual(paths)
    tasks.forEach(({ save }) => expect(save).toHaveBeenCalledOnce())
    expect(outcome).toBeInstanceOf(SaveAllError)
    expect(outcome).toBeInstanceOf(AggregateError)
    const error = outcome as SaveAllError
    expect(error.successes).toEqual(['saved.java', 'later.java', 'last.java'])
    expect(error.failures).toEqual([
      { path: 'open.java', error: conflict, message: conflict.message },
      { path: 'closed.java', error: storageFailure, message: storageFailure },
    ])
    expect(error.errors[0]).toBe(conflict)
    expect(error.errors[1]).toBe(storageFailure)
    expect(error.message).toContain(`open.java: ${conflict.message}`)
    expect(error.message).toContain(`closed.java: ${storageFailure}`)
  })

  it('rejects only after the final task settles and blocks the success continuation', async () => {
    const tail = deferred(), started = deferred()
    const failure = new Error('Revision conflict')
    const launch = vi.fn()
    let settled = false
    const outcome = saveAllOrThrow([
      { path: 'failed.java', save: async () => { throw failure } },
      { path: 'tail.java', save: () => { started.resolve(); return tail.promise } },
    ]).then(launch).catch((error: unknown) => error).finally(() => { settled = true })

    await started.promise
    expect(settled).toBe(false)
    expect(launch).not.toHaveBeenCalled()
    tail.resolve()
    const error = await outcome as SaveAllError
    expect(error).toBeInstanceOf(SaveAllError)
    expect(error.successes).toEqual(['tail.java'])
    expect(error.failures[0].error).toBe(failure)
    expect(settled).toBe(true)
    expect(launch).not.toHaveBeenCalled()
  })

  it('releases the success barrier only when all ordered saves complete', async () => {
    const first = deferred(), last = deferred(), lastStarted = deferred()
    const secondSave = vi.fn(() => { lastStarted.resolve(); return last.promise })
    const launch = vi.fn()
    const outcome = saveAllOrThrow([
      { path: 'first.java', save: () => first.promise },
      { path: 'last.java', save: secondSave },
    ]).then((result) => { launch(); return result })

    expect(secondSave).not.toHaveBeenCalled()
    expect(launch).not.toHaveBeenCalled()
    first.resolve()
    await lastStarted.promise
    expect(launch).not.toHaveBeenCalled()
    last.resolve()
    await expect(outcome).resolves.toEqual({ successes: ['first.java', 'last.java'], failures: [] })
    expect(secondSave).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledOnce()
  })

  it('also records a synchronous callback throw without skipping remaining tasks', async () => {
    const failure = new Error('Save preflight failed')
    const later = vi.fn(async () => {})
    const outcome = await saveAllOrThrow([
      { path: 'preflight.java', save: () => { throw failure } },
      { path: 'later.java', save: later },
    ]).catch((error: unknown) => error) as SaveAllError

    expect(later).toHaveBeenCalledOnce()
    expect(outcome).toBeInstanceOf(SaveAllError)
    expect(outcome.successes).toEqual(['later.java'])
    expect(outcome.failures[0].error).toBe(failure)
  })
})
