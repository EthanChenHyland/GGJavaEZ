import type { SceneFrame, SceneRow } from '../contracts/worldV2'
import { world } from '../theme/tokens'
export interface FrameDivider { beforeSlotId: string; label: string; depth: number; offset: number }
export interface FrameFace { dividers: readonly FrameDivider[]; offsets: ReadonlyMap<string, number>; extraHeight: number }
const empty: FrameFace = { dividers: [], offsets: new Map(), extraHeight: 0 }
/** Captured scope sections only. Divider offsets consume the existing face;
 * they are structural labels, never storage, anchors or curve endpoints. */
export function frameFace(node: SceneFrame, visible: readonly Pick<SceneRow, 'slotId'>[], pitch: number): FrameFace {
  const captured = node.scopeDividers
  if (!captured?.length || !visible.length) return empty
  const indices = new Map(node.rows.map((row, index) => [row.slotId, index]))
  const before = new Map<string, NonNullable<SceneFrame['scopeDividers']>[number]>()
  for (const [index, divider] of captured.entries()) {
    const start = divider.afterRow + 1, end = captured[index + 1]?.afterRow !== undefined ? captured[index + 1].afterRow + 1 : node.rows.length
    const first = visible.find(row => { const position = indices.get(row.slotId)!; return position >= start && position < end && node.rows[position].scopeDepth === divider.depth })
    if (first) before.set(first.slotId, divider)
  }
  let extraHeight = 0
  const offsets = new Map<string, number>(), dividers: FrameDivider[] = []
  for (const [index, row] of visible.entries()) {
    const divider = before.get(row.slotId)
    if (divider) {
      dividers.push({ beforeSlotId: row.slotId, label: divider.label, depth: divider.depth, offset: index * pitch + extraHeight + world.frame.scopeDivider / 2 })
      extraHeight += world.frame.scopeDivider
    }
    offsets.set(row.slotId, extraHeight)
  }
  return { dividers, offsets, extraHeight }
}
