import { arrayElementSlotId } from '../contracts/runtime'
import type { SceneArray, SceneModel } from '../contracts/worldV2'

/** A recorded array length establishes cell identity even when its value was not
 * captured. Accept only the canonical ID of an in-bounds cell of a present array. */
export function arrayCellTarget(scene: SceneModel, slotId: string | null | undefined): {
  array: SceneArray; index: number; slotId: string
} | null {
  if (!slotId) return null
  const separator = slotId.lastIndexOf(':element:')
  if (separator < 0) return null
  const array = scene.entities[slotId.slice(0, separator)]
  if (array?.kind !== 'array') return null
  const index = Number(slotId.slice(separator + ':element:'.length))
  if (!Number.isSafeInteger(index) || index < 0 || index >= array.length
    || arrayElementSlotId(array.id, index) !== slotId) return null
  return { array, index, slotId }
}
