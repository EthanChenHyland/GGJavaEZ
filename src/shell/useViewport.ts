import { flushSync } from 'react-dom'
import { useLayoutEffect, useState } from 'react'
export function useViewport() {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useLayoutEffect(() => {
    const update = () => flushSync(() => setViewport({ width: window.innerWidth, height: window.innerHeight }))
    const observer = new ResizeObserver(update)
    window.addEventListener('resize', update)
    observer.observe(document.documentElement)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [])
  return viewport
}
