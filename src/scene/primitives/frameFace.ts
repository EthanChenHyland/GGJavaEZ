import type { SceneFrameNode, SceneSlot, Vec3 } from '../../contracts/world'

// Match RuntimeSlot's compact plate and FrameSolid's existing face inset.
export const FRAME_FACE_ROW_HEIGHT = 0.31
const FACE_INSET = 0.07
const HEADER_CLEARANCE = 0.06

export interface FrameFaceOptions {
  readable?: boolean
  spacious?: boolean
  activeSlotId?: string
  selectedSlotId?: string
}

/** Presentation only: preserve canonical slot order, coordinates, and runtime data. */
export function frameFace(node: SceneFrameNode, options: FrameFaceOptions = {}) {
  const { position, size } = node.anchor
  const halfHeight = size[1] / 2
  const identitySize = options.spacious ? 0.44 : options.readable ? 0.38 : 0.32
  const identityInset = options.spacious ? 0.66 : 0.5
  const bottom = -halfHeight + FACE_INSET
  const top = Math.min(halfHeight - FACE_INSET, halfHeight - identityInset - identitySize / 2 - HEADER_CLEARANCE)
  const rows: SceneSlot[] = []
  const omitted: SceneSlot[] = []
  const terminals: SceneSlot[] = []
  for (const slot of node.slots) {
    const y = slot.port[1] - position[1]
    if (y - FRAME_FACE_ROW_HEIGHT / 2 >= bottom - 1e-9 && y + FRAME_FACE_ROW_HEIGHT / 2 <= top + 1e-9) {
      rows.push(slot)
    } else {
      omitted.push(slot)
      if (slot.id === options.activeSlotId || slot.id === options.selectedSlotId || slot.value.kind === 'reference') terminals.push(slot)
    }
  }
  return { rows, omitted, terminals, bottom, top }
}

/** Local terminal position, with no face projection or endpoint substitution. */
export function frameTerminalPosition(slot: SceneSlot, node: SceneFrameNode): Vec3 {
  return [slot.port[0] - node.anchor.position[0], slot.port[1] - node.anchor.position[1], slot.port[2] - node.anchor.position[2]]
}
