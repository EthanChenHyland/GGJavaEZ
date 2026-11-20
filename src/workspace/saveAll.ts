export interface SaveAllTask {
  path: string
  save: () => Promise<void>
}

export interface SaveAllFailure {
  path: string
  error: unknown
  message: string
}

export interface SaveAllResult {
  successes: readonly string[]
  failures: readonly SaveAllFailure[]
}

/** Keeps successful saves and every original failure available to the caller. */
export class SaveAllError extends AggregateError implements SaveAllResult {
  readonly successes: readonly string[]
  readonly failures: readonly SaveAllFailure[]

  constructor(result: SaveAllResult) {
    super(result.failures.map(({ error }) => error),
      `Save All failed:\n${result.failures.map(({ path, message }) => `${path}: ${message}`).join('\n')}`)
    this.name = 'SaveAllError'
    this.successes = result.successes
    this.failures = result.failures
  }
}

/**
 * Attempt each task once, in order, even after failures. The caller's closures
 * own revision checks and persistence; this helper neither retries nor rolls back.
 * Resolution is the all-required-saves barrier for subsequent launch operations.
 */
export async function saveAllOrThrow(tasks: readonly SaveAllTask[]): Promise<SaveAllResult> {
  const successes: string[] = []
  const failures: SaveAllFailure[] = []
  for (const { path, save } of tasks) {
    try {
      await save()
      successes.push(path)
    } catch (error) {
      failures.push({ path, error, message: error instanceof Error ? error.message : String(error) })
    }
  }
  const result = { successes, failures }
  if (failures.length) throw new SaveAllError(result)
  return result
}
