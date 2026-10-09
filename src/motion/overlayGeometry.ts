import type { MaterialRole, PresentationPlan, PresentedCurve, SceneModel, Vec3, WorldAnchor } from '../contracts/worldV2'
import type { AnimationStep, OverlayFrame } from './transitionPlayer'
import { faceRows } from '../render/faceModel'
import { world } from '../theme/tokens'
import { referenceIdForSlot } from '../contracts/runtime'

export interface MotionSubject { id: string; ownerId: string; anchor: WorldAnchor; opacity: number; referenceTarget?: string }
/** Only presented canonical bodies, visible face rows, cells and actual I/O. */
export function motionSubjects(scene: SceneModel, plan: PresentationPlan): ReadonlyMap<string, MotionSubject> {
  const subjects = new Map<string, MotionSubject>()
  for (const [id, presented] of plan.entities) {
    const node = scene.entities[id]
    if (!node || presented.mode !== 'detailed') continue
    subjects.set(id, { id, ownerId: id, anchor: node.anchor, opacity: presented.opacity })
    if (node.kind === 'array') {
      for (const [slotId, cell] of plan.cellWindows.get(id)?.mapping ?? []) subjects.set(slotId, { id: slotId, ownerId: id, anchor: cell.anchor, opacity: presented.opacity })
      continue
    }
    const model = faceRows(node, presented)
    const rows = node.kind === 'collection' ? node.entries.slice(0, presented.detail === 'FAR' ? 0 : presented.detail === 'MEDIUM' ? 8 : world.collection.rows * world.collection.columns) : model.visible
    const [x, y, z] = node.anchor.position, [w, h, d] = node.anchor.size
    for (const [rowIndex, row] of rows.entries()) {
      const port = row.port ?? node.anchor.ports[row.slotId]
      // A visible canonical port is required; do not invent a retired slot position.
      if (!port || port[1] < y - h / 2 || port[1] > y + h / 2) continue
      const position: Vec3 = [node.kind === 'collection' ? port[0] : x, port[1], z + d / 2 + .03]
      const pitch = node.kind === 'collection' ? world.collection.pitch : model.pitch
      const size: Vec3 = [node.kind === 'collection' ? w / world.collection.columns - .25 : w - .45, pitch * .73, .05]
      subjects.set(row.slotId, { id: row.slotId, ownerId: id, opacity: presented.opacity, referenceTarget: row.value.kind === 'reference' ? row.value.targetId : undefined, anchor: { ...node.anchor, entityId: row.slotId, position, size, ports: {}, bodyPort: position } })
      const entry = node.kind === 'collection' ? node.entries[rowIndex] : undefined
      if (entry?.keySlotId && entry.keyPort) {
        // Map key/value share a captured entry plate, but retain separate identities.
        const valueSubject = subjects.get(row.slotId)!
        subjects.set(entry.keySlotId, { ...valueSubject, id: entry.keySlotId, referenceTarget: entry.key?.kind === 'reference' ? entry.key.targetId : undefined, anchor: { ...valueSubject.anchor, entityId: entry.keySlotId } })
      }
    }
  }
  for (const shown of plan.io) {
    const node = scene.io.find(node => node.id === shown.id)
    if (node) subjects.set(node.id, { id: node.id, ownerId: node.id, anchor: node.anchor, opacity: shown.opacity })
  }
  return subjects
}

/** Match only a recorded graph edge or an exact current reference identity. */
export function motionCurve(step: AnimationStep, subjects: ReadonlyMap<string, MotionSubject>, curves: ReadonlyMap<string, PresentedCurve>): PresentedCurve | undefined {
  if (step.flowId) return curves.get(step.flowId)
  if (step.kind !== 'reference' || step.transition.from?.kind !== 'slot' || step.transition.to?.kind !== 'object') return undefined
  const source = subjects.get(step.transition.from.id)
  return source?.referenceTarget === step.transition.to.id ? curves.get(referenceIdForSlot(source.id)) : undefined
}
export function motionRole(step: AnimationStep): MaterialRole {
  if (step.kind === 'exception') return 'exception'
  if (step.kind === 'return') return 'return'
  if (step.kind === 'field-write' || step.kind === 'array-write' || step.kind === 'assignment') return 'mutation'
  if (step.kind === 'output') return step.transition.to?.id === 'stderr' ? 'stderr' : 'stdout'
  if (step.kind === 'input') return 'stdin'
  return 'reference'
}

/** A single bounded pulse; static emphasis has no periodic brightness or scale. */
export function overlayEmphasis(frame: OverlayFrame) {
  if (frame.static) return { scale: 1, alpha: .55 }
  const progress = Math.max(0, Math.min(1, frame.progress))
  const scale = frame.step.kind === 'allocation' && frame.step.direction === 'forward' ? .92 + .08 * (1 - (1 - progress) ** 3) : 1
  return { scale, alpha: progress === 1 ? 0 : (.18 + .5 * Math.sin(Math.PI * progress)) * (1 - progress) }
}
