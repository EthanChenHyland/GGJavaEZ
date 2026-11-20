interface TextBatchSyncSource {
  addEventListener(type: 'syncstart' | 'synccomplete', listener: () => void): void
  removeEventListener(type: 'syncstart' | 'synccomplete', listener: () => void): void
}
interface PreparationReadiness { pending: Set<string>; lastSync: number }

/** Member layout, font atlas generation and batch packing finish separately.
 * Keep readiness pending through the latter two and repaint their results on
 * a demand-driven canvas, even when no camera or timeline input follows. */
export function observeTextPreparation(batch: TextBatchSyncSource, readiness: PreparationReadiness,
  id: string, fontReady: Promise<void> | null, invalidate: () => void): () => void {
  const batchKey = `${id}:batch`, fontKey = `${id}:font`
  let alive = true, inFlight = 0
  const start = () => { inFlight++; readiness.pending.add(batchKey) }
  const complete = () => {
    inFlight = Math.max(0, inFlight - 1)
    if (!inFlight) readiness.pending.delete(batchKey)
    readiness.lastSync = performance.now()
    invalidate()
  }
  batch.addEventListener('syncstart', start)
  batch.addEventListener('synccomplete', complete)
  if (fontReady) {
    readiness.pending.add(fontKey)
    void fontReady.then(() => {
      if (!alive) return
      readiness.pending.delete(fontKey)
      readiness.lastSync = performance.now()
      invalidate()
    }, () => {
      // A failed atlas must not be reported as ready. The existing finite
      // World readiness timeout still reports outstanding preparation work.
      if (alive) invalidate()
    })
  }
  return () => {
    alive = false
    batch.removeEventListener('syncstart', start)
    batch.removeEventListener('synccomplete', complete)
    readiness.pending.delete(batchKey)
    readiness.pending.delete(fontKey)
  }
}
