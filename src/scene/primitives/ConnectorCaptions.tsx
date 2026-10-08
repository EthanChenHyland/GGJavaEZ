import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import { projectedTextPixels } from './runtimeText'

export interface CaptionRect { left: number; right: number; top: number; bottom: number }
export function captionOverlaps(rect: CaptionRect, occupied: readonly CaptionRect[]): boolean {
  return occupied.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)
}
interface Entry { id: string; group: Group; priority: number; text: string; size: number }
const Captions = createContext<((entry: Entry) => () => void) | null>(null)

/** Presentation-only, bounded by the planner's reference budget. Projected
 * collisions hide redundant path captions; every real line and endpoint stays
 * mounted/pickable, with exact source names on faces and in the Inspector. */
export function ConnectorCaptionLayer({ children, inspectorVisible }: { children: ReactNode; inspectorVisible: boolean }) {
  const entries = useRef(new Map<string, Entry>())
  const { camera, size } = useThree()
  const point = useMemo(() => new Vector3(), [])
  const register = useMemo(() => (entry: Entry) => {
    entries.current.set(entry.id, entry)
    return () => { if (entries.current.get(entry.id) === entry) entries.current.delete(entry.id) }
  }, [])
  useFrame(() => {
    const occupied: CaptionRect[] = []
    for (const entry of [...entries.current.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
      entry.group.updateWorldMatrix(true, false)
      entry.group.getWorldPosition(point)
      const pixels = projectedTextPixels(camera, size, point.toArray(), entry.size) / 0.73
      point.project(camera)
      const x = (point.x + 1) * size.width / 2, y = (1 - point.y) * size.height / 2
      // Conservative Inter glyph widths leave clearance even for wide Unicode.
      const width = Math.min(2.6 / entry.size, Array.from(entry.text).length * 0.65) * pixels
      const rect = { left: x - width / 2 - 5, right: x + width / 2 + 5, top: y - pixels / 2 - 4, bottom: y + pixels / 2 + 4 }
      entry.group.visible = pixels >= 9 && point.z >= -1 && point.z <= 1 && rect.left > 8 && rect.right < size.width - (inspectorVisible ? 300 : 8)
        && rect.top > 94 && rect.bottom < size.height - 100 && !captionOverlaps(rect, occupied)
      if (entry.group.visible) occupied.push(rect)
    }
  })
  return <Captions.Provider value={register}>{children}</Captions.Provider>
}

export function ConnectorCaption({ id, selected, related, text, size, children }: {
  id: string; selected: boolean; related: boolean; text: string; size: number; children: ReactNode
}) {
  const register = useContext(Captions), group = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!register || !group.current) return
    return register({ id, group: group.current, priority: selected ? 2 : related ? 1 : 0, text, size })
  }, [register, id, selected, related, text, size])
  return <group ref={group}>{children}</group>
}
