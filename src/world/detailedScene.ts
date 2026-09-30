import type { Selection } from '../contracts/interaction'
import type { SceneModel } from '../contracts/world'

export const detailBudget = { frames: 24, objects: 32, references: 64 } as const

/** Bound expensive face text/connections, never the identity or geometry catalog.
 * Current stack, selection and observed reference endpoints always remain detailed. */
export function detailedScene(scene: SceneModel, selection: Selection): SceneModel {
  const protectedIds = new Set<string>()
  if (selection) protectedIds.add(selection.id)
  if (selection?.kind === 'slot') {
    for (const node of scene.frames) if (node.slots.some(slot => slot.id === selection.id)) protectedIds.add(node.id)
    for (const node of scene.objects) if (node.fields.some(slot => slot.id === selection.id) || node.array?.cells.some(slot => slot.id === selection.id)) protectedIds.add(node.id)
  }
  if (selection?.kind === 'reference') {
    const edge = scene.references.find(edge => edge.id === selection.id)
    if (edge) { protectedIds.add(edge.targetObjectId); protectedIds.add(edge.source.kind === 'frame' ? edge.source.frameId : edge.source.objectId) }
  }
  if (selection?.kind === 'frame') {
    const frame = scene.frames.find(node => node.id === selection.id)
    if (frame?.callerFrameId) protectedIds.add(frame.callerFrameId)
    const child = scene.frames.filter(node => node.callerFrameId === selection.id).at(-1)
    if (child) protectedIds.add(child.id)
  }
  for (const frame of scene.frames) if (!frame.historical) protectedIds.add(frame.id)
  const frames = scene.frames.filter((node, index) => protectedIds.has(node.id) || index >= scene.frames.length - detailBudget.frames)
  const frameIds = new Set(frames.map(node => node.id))
  const activeReferences = scene.references.filter(edge => (!edge.historical && edge.source.kind === 'frame' && frameIds.has(edge.source.frameId)) || protectedIds.has(edge.targetObjectId) || edge.id === selection?.id)
  for (const edge of activeReferences) if (!edge.historical || edge.id === selection?.id) protectedIds.add(edge.targetObjectId)
  const objects = scene.objects.filter((node, index) => protectedIds.has(node.id) || index >= scene.objects.length - detailBudget.objects)
  const objectIds = new Set(objects.map(node => node.id))
  const references = scene.references.filter(edge => objectIds.has(edge.targetObjectId) && (edge.source.kind === 'frame' ? frameIds.has(edge.source.frameId) : objectIds.has(edge.source.objectId)))
  const priority = references.filter(edge => !edge.historical || edge.id === selection?.id || protectedIds.has(edge.targetObjectId))
  const quiet = references.filter(edge => !priority.includes(edge)).slice(-detailBudget.references)
  return { ...scene, frames, objects, references: [...quiet, ...priority] }
}
