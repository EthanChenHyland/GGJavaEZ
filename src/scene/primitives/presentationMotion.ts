import { useEffect, useRef, useSyncExternalStore } from 'react'
import { easeOutCubic } from '../../theme/tokens'
export { easeOutCubic } from '../../theme/tokens'
import { useFrame, useThree } from '@react-three/fiber'

const queryText = '(prefers-reduced-motion: reduce)'

function motionQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(queryText)
    : null
}

function subscribeMotionPreference(onChange: () => void): () => void {
  const query = motionQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

function motionPreference(): boolean {
  return motionQuery()?.matches ?? false
}

export function useReducedMotion(override?: boolean): boolean {
  const preferred = useSyncExternalStore(subscribeMotionPreference, motionPreference, () => false)
  return override ?? preferred
}

/** A one-time, short presentation settle. It never changes semantic scene state. */
export function useMountSettle(durationMs: number, reducedMotion: boolean, apply: (progress: number) => void): void {
  const invalidate = useThree((state) => state.invalidate)
  const elapsedMs = useRef(0)
  const finished = useRef(reducedMotion)
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    if (reducedMotion) {
      finished.current = true
      applyRef.current(1)
    } else if (!finished.current) {
      invalidate()
    }
  }, [invalidate, reducedMotion])

  useFrame((_, delta) => {
    if (finished.current) return
    elapsedMs.current += Math.min(delta * 1000, 50)
    const progress = Math.min(1, elapsedMs.current / durationMs)
    applyRef.current(easeOutCubic(progress))
    if (progress === 1) finished.current = true
    else invalidate()
  })
}
