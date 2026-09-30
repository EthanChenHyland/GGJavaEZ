import type { Selection } from '../contracts/interaction'
import type { SceneModel } from '../contracts/world'

/** Focus changes visibility only. Runtime truth and reserved anchors are untouched. */
export function isolatedScene(scene: SceneModel, selection: Selection): SceneModel {
  if (!selection) return scene
  const ids = new Set([selection.id])
  if (selection.kind === 'slot') {
    scene.frames.filter(node => node.slots.some(slot => slot.id === selection.id)).forEach(node => ids.add(node.id))
    scene.objects.filter(node => node.fields.some(slot => slot.id === selection.id) || node.array?.cells.some(slot => slot.id === selection.id)).forEach(node => ids.add(node.id))
  }
  if (selection.kind === 'reference') {
    const edge = scene.references.find(edge => edge.id === selection.id)
    if (edge) { ids.add(edge.targetObjectId); ids.add(edge.source.kind === 'frame' ? edge.source.frameId : edge.source.objectId) }
  }
  const frames = scene.frames.filter(node => ids.has(node.id))
  const objects = scene.objects.filter(node => ids.has(node.id))
  // Scrubbing before an entity exists shows the ordinary world, not an empty focus shell.
  if (!frames.length && !objects.length) return scene
  return { ...scene, frames, objects,
    references: scene.references.filter(edge => ids.has(edge.targetObjectId) && ids.has(edge.source.kind === 'frame' ? edge.source.frameId : edge.source.objectId)),
    returnFlow: undefined }
}
