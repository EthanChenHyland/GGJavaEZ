import { arrayElementSlotId, type ObjectId, type SlotId } from '../contracts/runtime'
import type { ArrayWindow, ArrayIndexReason, ArrayEllipsis, ArrayWindowPick, ArrayWindowSlot, Vec3, WorldAnchor } from '../contracts/world'
export type { ArrayWindow, ArrayIndexReason, ArrayEllipsis, ArrayWindowPick, ArrayWindowSlot } from '../contracts/world'
import { world } from '../theme/tokens'

export interface ArrayWindowInput {
  recordingId: string
  arrayId: ObjectId
  recordedLength: number
  anchor: WorldAnchor
  requestedIndices?: readonly number[]
  selectedIndices?: readonly number[]
  focusedIndices?: readonly number[]
  currentIndices?: readonly number[]
  nominalCellBudget: number
  previous?: ArrayWindow
}

function countInput(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`)
  return value
}
function gaps(visible: readonly number[], length: number): ArrayEllipsis[] {
  const result: ArrayEllipsis[] = []
  let afterIndex = -1
  for (const index of visible) {
    if (index > afterIndex + 1) result.push({ afterIndex, hidden: index - afterIndex - 1 })
    afterIndex = index
  }
  if (afterIndex < length - 1) result.push({ afterIndex, hidden: length - afterIndex - 1 })
  return result
}
const equalVec = (a: Vec3, b: Vec3): boolean => a.every((value, index) => value === b[index])
function sameTopology(previous: ArrayWindow, next: Omit<ArrayWindow, 'windowRevision'>): boolean {
  if (previous.recordingId !== next.recordingId || previous.arrayId !== next.arrayId
    || previous.recordedLength !== next.recordedLength || previous.columns !== next.columns
    || previous.mapping.size !== next.mapping.size) return false
  for (const [id, slot] of next.mapping) {
    const prior = previous.mapping.get(id)
    if (!prior || prior.index !== slot.index || prior.presentedSlot !== slot.presentedSlot
      || prior.anchor.region !== slot.anchor.region || !equalVec(prior.anchor.position, slot.anchor.position)
      || !equalVec(prior.anchor.size, slot.anchor.size) || !equalVec(prior.port, slot.port)) return false
  }
  return true
}

/** Only index topology and geometry: no values, observations or provenance are inferred. */
export function computeArrayWindow(input: ArrayWindowInput): ArrayWindow {
  const length = countInput(input.recordedLength, 'recordedLength')
  const budget = countInput(input.nominalCellBudget, 'nominalCellBudget')
  const reasons = new Map<number, ArrayIndexReason[]>()
  const groups: readonly [ArrayIndexReason, readonly number[] | undefined][] = [
    ['requested', input.requestedIndices], ['selected', input.selectedIndices],
    ['focused', input.focusedIndices], ['current', input.currentIndices],
  ]
  for (const [reason, indices] of groups) for (const index of indices ?? []) {
    // Out-of-bounds markers are evidence-driven elsewhere; never create a cell.
    if (!Number.isSafeInteger(index) || index < 0 || index >= length) continue
    const existing = reasons.get(index)
    if (!existing) reasons.set(index, [reason])
    else if (!existing.includes(reason)) existing.push(reason)
  }
  const mandatory = [...reasons.keys()].sort((a, b) => a - b)
  const optionalCapacity = Math.max(0, budget - mandatory.length)
  const chosen = new Set(mandatory)
  if (mandatory.length === 0 && length > 0 && budget > 0) chosen.add(0)
  // Reserve summaries before optional detail. Growing nearest-index windows is
  // bounded by presentation capacity, never by the recorded array length.
  const remaining = Math.max(0, budget - chosen.size)
  let available = remaining - Math.min(remaining, gaps([...chosen], length).length)
  const seeds = mandatory.length ? mandatory : length ? [0] : []
  for (let radius = 0; available > 0 && radius <= budget; radius++) {
    const candidates = new Set<number>()
    for (const seed of seeds) {
      if (seed - radius >= 0) candidates.add(seed - radius)
      if (seed + radius < length) candidates.add(seed + radius)
    }
    for (const index of [...candidates].sort((a, b) => a - b)) {
      if (chosen.has(index)) continue
      chosen.add(index)
      const sorted = [...chosen].sort((a, b) => a - b)
      available = Math.max(0, budget - chosen.size - gaps(sorted, length).length)
      if (available === 0) break
    }
  }
  // A fully fitting array requires no ellipsis reservation; recover its last
  // cell when it fits the nominal target (including empty arrays).
  if (length <= budget) for (let index = 0; index < length; index++) chosen.add(index)
  const visible = [...chosen].sort((a, b) => a - b)
  const ellipses = gaps(visible, length)
  const columns = Math.min(world.array.cellsPerRowMax, Math.max(world.array.cellsPerRowMin, length))
  const virtualized = length > 128
  const reservedRows = virtualized ? 8 : Math.ceil(length / columns)
  const mapping = new Map<SlotId, ArrayWindowSlot>()
  let presentedRows = 0
  const pitch = world.array.cell + world.array.gap
  for (let slot = 0; slot < visible.length; slot++) {
    const index = visible[slot]
    const presentedSlot = virtualized ? slot : index
    const row = Math.floor(presentedSlot / columns)
    const column = presentedSlot % columns
    presentedRows = Math.max(presentedRows, row + 1)
    const position: Vec3 = [
      input.anchor.position[0] - input.anchor.size[0] / 2 + world.array.cell / 2 + column * pitch,
      input.anchor.position[1] + input.anchor.size[1] / 2 - world.array.titlePlate - world.array.cell / 2 - row * pitch,
      input.anchor.position[2] + input.anchor.size[2] / 2 - world.array.cell / 2,
    ]
    const port: Vec3 = [position[0], position[1], position[2] + world.array.cell / 2]
    const id = arrayElementSlotId(input.arrayId, index)
    const anchor: WorldAnchor = {
      entityId: id, region: input.anchor.region, position,
      size: [world.array.cell, world.array.cell, world.array.cell], ports: { [id]: port }, bodyPort: port,
    }
    mapping.set(id, { index, presentedSlot, anchor, port })
  }
  const next: Omit<ArrayWindow, 'windowRevision'> = {
    recordingId: input.recordingId, arrayId: input.arrayId, recordedLength: length,
    visible, mapping, ellipses,
    presentedEllipses: ellipses.slice(0, Math.max(0, budget - visible.length)),
    hiddenCount: length - visible.length, columns, reservedRows, presentedRows,
    rowOverflow: Math.max(0, presentedRows - reservedRows), virtualized,
    budgetOverflow: {
      nominal: budget, actual: visible.length, mandatoryCount: mandatory.length,
      overflow: Math.max(0, mandatory.length - budget), optionalCapacity,
      mandatoryIds: mandatory.map(index => arrayElementSlotId(input.arrayId, index)),
      reasons: new Map(mandatory.map(index => [arrayElementSlotId(input.arrayId, index), reasons.get(index)!])),
    },
  }
  return {
    ...next,
    windowRevision: input.previous
      ? input.previous.windowRevision + (sameTopology(input.previous, next) ? 0 : 1) : 1,
  }
}

/** A hidden index, ellipsis or stale slot must never masquerade as an endpoint. */
export function resolveArrayWindowPick(window: ArrayWindow, pick: ArrayWindowPick): ArrayWindowSlot | null {
  if (pick.recordingId !== window.recordingId || pick.arrayId !== window.arrayId
    || pick.windowRevision !== window.windowRevision || !Number.isSafeInteger(pick.index)
    || pick.index < 0 || pick.index >= window.recordedLength
    || pick.slotId !== arrayElementSlotId(window.arrayId, pick.index)) return null
  const mapping = window.mapping.get(pick.slotId)
  return mapping && mapping.index === pick.index && mapping.presentedSlot === pick.presentedSlot ? mapping : null
}
