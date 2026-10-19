import type { MaterialRole, PresentationPlan, PresentedCurve, SceneModel, WorldAnchor } from '../contracts/world'
import type { AnimationStep, OverlayFrame } from './transitionPlayer'
import {faceRows} from '../world/faceRows'
import {facePlate} from '../world/facePlate'
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
    const rows=node.kind==='collection'?node.entries.filter(entry=>model.visible.some(row=>row.slotId===entry.slotId)).flatMap(entry=>[{slotId:entry.slotId,value:entry.value},...(entry.keySlotId&&entry.key?[{slotId:entry.keySlotId,value:entry.key}]:[])]):model.visible
    for(const row of rows){
      const anchor=facePlate(node,presented,row.slotId,model)
      if(anchor)subjects.set(row.slotId,{id:row.slotId,ownerId:id,opacity:presented.opacity,referenceTarget:row.value.kind==='reference'?row.value.targetId:undefined,anchor})
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
