import type { Selection } from '../contracts/interaction'
import type { SceneModel } from '../contracts/world'
import { sceneSourceId } from '../contracts/world'

export const focusNeighborBudget = 8

const sourceId = (edge: SceneModel['references'][number]) => sceneSourceId(edge.source)

/** Selected identities and immediate observed neighbors only; never a graph walk. */
export function focusEntityIds(scene: SceneModel, selection: Selection, neighbors = true): Set<string> {
  const seeds = new Set<string>()
  if (!selection) return seeds
  if (selection.kind === 'slot') {
    for (const frame of scene.frames) if (frame.slots.some(slot => slot.id === selection.id)) seeds.add(frame.id)
    for (const object of scene.objects) if (object.fields.some(slot => slot.id === selection.id) || object.array?.cells.some(cell => cell.id === selection.id)) seeds.add(object.id)
    for (const storage of scene.classes ?? []) if (storage.fields.some(slot => slot.id === selection.id)) seeds.add(storage.id)
  } else if (selection.kind === 'reference') {
    const edge = scene.references.find(edge => edge.id === selection.id)
    if (edge) { seeds.add(sourceId(edge)); seeds.add(edge.targetObjectId) }
  } else {
    const represented = selection.kind === 'frame' ? scene.frames.some(node => node.id === selection.id)
      : selection.kind === 'class' ? scene.classes?.some(node => node.id === selection.id)
        : scene.objects.some(node => node.id === selection.id)
    if (represented) seeds.add(selection.id)
  }
  const ids = new Set(seeds)
  // A lingering reference cannot substitute a neighbor for an absent subject.
  if (!neighbors || !seeds.size) return ids
  const add = (id: string | null | undefined) => {
    if (id && ids.size < seeds.size + focusNeighborBudget) ids.add(id)
  }
  // A caller and the most recent direct child explain invocation depth. Siblings
  // and grandchildren do not become related merely by sharing an ancestor.
  for (const frame of scene.frames) if (seeds.has(frame.id)) add(frame.callerFrameId)
  const childFor = new Set<string>()
  for (let i = scene.frames.length - 1; i >= 0; i--) {
    const frame = scene.frames[i]
    if (frame.callerFrameId && seeds.has(frame.callerFrameId) && !childFor.has(frame.callerFrameId)) {
      add(frame.id); childFor.add(frame.callerFrameId)
    }
  }
  for (const edge of scene.references) {
    const source = sourceId(edge)
    const selectedSlot = selection.kind === 'slot'
    if ((seeds.has(source) && (!selectedSlot || edge.source.slotId === selection.id)) || seeds.has(edge.targetObjectId)) {
      add(source); add(edge.targetObjectId)
    }
  }
  return ids
}

/** Focus changes visibility only. Runtime truth and reserved anchors are untouched. */
export function isolatedScene(scene: SceneModel, selection: Selection, mode: 'context' | 'isolate' = 'context'): SceneModel {
  if (!selection) return scene
  const ids = focusEntityIds(scene, selection, scene.layoutKind === 'spatial2' && mode === 'context')
  const frames = scene.frames.filter(node => ids.has(node.id))
  const objects = scene.objects.filter(node => ids.has(node.id))
  const classes = scene.classes?.filter(node => ids.has(node.id))
  // Scrubbing before an entity exists shows the ordinary world, not an empty focus shell.
  if (!frames.length && !objects.length && !classes?.length) return scene
  const flow = scene.returnFlow
  return { ...scene, frames, objects, ...(classes ? { classes } : {}),
    references: scene.references.filter(edge => ids.has(edge.targetObjectId) && ids.has(sourceId(edge))),
    returnFlow: scene.layoutKind === 'spatial2' && flow && ids.has(flow.frameId)
      && (!flow.destination || ids.has(flow.destination.frameId)) ? flow : undefined }
}
