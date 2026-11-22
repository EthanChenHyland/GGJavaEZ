import type { MaterialRole, PresentationPlan, PresentedCurve, SceneModel, Vec3, WorldAnchor } from '../contracts/world'
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
  // A proved transfer can start at a frame-side port without an inline row.
  // Its actual port participates in visibility checks even when the recipient
  // is outside the viewport. There is no proxy for an unpresented return.
  for (const curve of plan.curves) {
    if (curve.kind !== 'return' || !curve.sourceAnchor || !curve.points[0]) continue
    const owner = subjects.get(curve.sourceAnchor.entityId)
    if (!owner || scene.entities[owner.id]?.kind !== 'frame') continue
    const id = `return:${owner.id}`, point = curve.points[0]
    if (subjects.has(id)) continue
    subjects.set(id, { id, ownerId: owner.id, opacity: owner.opacity, anchor: {
      entityId: id, region: owner.anchor.region, position: point, size: [Math.min(.55, owner.anchor.size[0] * .16), .23, .036],
      bodyPort: point, ports: {},
    } })
  }
  return subjects
}

/** Match only a recorded graph edge or an exact current reference identity. */
export function motionCurve(step: AnimationStep, subjects: ReadonlyMap<string, MotionSubject>, curves: ReadonlyMap<string, PresentedCurve>): PresentedCurve | undefined {
  if (step.transition.evidence === 'local' || !step.transition.from || !step.transition.to) return undefined
  if (step.transition.routeId || step.flowId) return curves.get(step.transition.routeId ?? step.flowId!)
  if (step.kind === 'receiver' && step.transition.from.kind === 'object' && step.transition.to.kind === 'slot') {
    const holder = subjects.get(step.transition.to.id)
    return holder?.referenceTarget === step.transition.from.id ? curves.get(referenceIdForSlot(holder.id)) : undefined
  }
  if (step.kind !== 'reference' || step.transition.from?.kind !== 'slot' || step.transition.to?.kind !== 'object') return undefined
  const source = subjects.get(step.transition.from.id)
  return source?.referenceTarget === step.transition.to.id ? curves.get(referenceIdForSlot(source.id)) : undefined
}
export function motionRole(step: AnimationStep): MaterialRole {
  if (step.kind === 'throw' || step.kind === 'unwind' || step.kind === 'catch' || step.kind === 'uncaught') return 'exception'
  if (step.kind === 'entry' || step.kind === 'completion') return 'call'
  if (step.kind === 'allocation' || step.kind === 'receiver') return 'heap'
  if (step.kind === 'return') return 'return'
  if (step.kind === 'field-write' || step.kind === 'array-write' || step.kind === 'assignment') return 'mutation'
  if (step.kind === 'output') return step.transition.to?.id === 'stderr' ? 'stderr' : 'stdout'
  if (step.kind === 'input') return 'stdin'
  return 'reference'
}

type Shape = 'rise' | 'volume' | 'underline' | 'bracket' | 'field' | 'cell' | 'return' | 'inward' | 'outward' | 'throw' | 'drop' | 'catch'
interface MotionMark { id: string; shape: Shape; progress: number; opacity: number }
const shapes = {
  entry: 'rise', allocation: 'volume', argument: 'underline', receiver: 'bracket', assignment: 'underline',
  'field-write': 'field', reference: 'bracket', 'array-read': 'return', 'array-write': 'cell', return: 'return',
  input: 'inward', output: 'outward', throw: 'throw', unwind: 'drop', catch: 'catch', uncaught: 'bracket', completion: 'drop',
} as const
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const release = (progress: number, at: number) => clamp((1 - progress) / (1 - at))

/** Endpoint staging is independent of route availability. Unknown sources have
 * no source cue. Reverse playback retains the prefix's settled endpoints. */
export function motionMarks(frame: OverlayFrame): MotionMark[] {
  const { kind, transition: { from, to }, direction } = frame.step
  const phase = clamp(frame.progress), settled = frame.static || direction === 'reverse'
  const fade = frame.static ? 1 : release(phase, .58)
  const local = !from || !to
  const marks: MotionMark[] = []
  const mark = (point: typeof to, shape: Shape, progress: number, opacity: number) => {
    if (point && opacity > 0) marks.push({ id: point.id, shape, progress: settled ? 1 : progress, opacity: opacity * fade })
  }
  if (kind === 'throw' || kind === 'unwind' || kind === 'uncaught') {
    const impact = local || settled ? 1 : release(phase, .23)
    mark(from, shapes[kind], phase, .88 * impact)
    mark(to, 'bracket', phase, kind === 'uncaught' || settled ? .72 : .76 * clamp((phase - .2) * 3))
    return marks
  }
  if (from && to && kind !== 'reference' && kind !== 'receiver') {
    mark(from, kind === 'return' ? 'return' : 'bracket', phase, .36 * (settled ? 1 : release(phase, .2)))
  }
  const emphasis = !settled && (kind === 'argument' || kind === 'return' || kind === 'catch') && !local
    ? .28 + .56 * clamp((phase - .27) * 3) : .76
  mark(to ?? from, shapes[kind], phase, emphasis)
  return marks
}

/** Point ranges along an already-presented route. A growing call or binding
 * is distinct from a traveling argument or a longer return transfer. */
export function motionTravel(frame: OverlayFrame): { start: number; end: number; opacity: number } | null {
  if (frame.static) return null
  const phase = clamp(frame.progress), { kind } = frame.step
  let start = 0, end = phase, opacity = .9 * release(phase, .75)
  switch (kind) {
    case 'entry': case 'reference': end = clamp(phase * 1.3); break
    case 'argument': case 'output': start = Math.max(0, end - .17); opacity *= kind === 'output' ? .64 : .82; break
    case 'receiver': start = Math.max(0, end - .45); break
    case 'return': end = clamp((phase - .1) / .68); start = Math.max(0, end - .36); break
    case 'throw': end = clamp((phase - .12) / .42); start = Math.max(0, end - .35); break
    case 'unwind': end = clamp(phase * 1.7); start = Math.max(0, end - .24); break
    case 'catch': end = clamp(phase * 1.5); start = Math.max(0, end - .24); break
    case 'input': start = Math.max(0, end - .24); break
    case 'field-write': case 'array-write': case 'assignment': case 'array-read':
      end = clamp(phase * 1.3); start = Math.max(0, end - .22); opacity *= .78; break
    default: return null
  }
  return start < end && opacity > 0 ? { start, end, opacity } : null
}

/** Clip a short strip to the exact committed polyline; no new links, shortcut
 * segments, or allocations proportional to the recording. */
export function visitMotionTravel(points: readonly Vec3[], travel: { start: number; end: number }, reverse: boolean, line: (a: Vec3, b: Vec3) => void): boolean {
  const last = points.length - 1
  if (last < 1 || last > 128) return false
  const start = (reverse ? 1 - travel.end : travel.start) * last
  const end = (reverse ? 1 - travel.start : travel.end) * last
  const interpolate = (a: Vec3, b: Vec3, by: number): Vec3 => [
    a[0] + (b[0] - a[0]) * by, a[1] + (b[1] - a[1]) * by, a[2] + (b[2] - a[2]) * by,
  ]
  let drew = false
  for (let i = Math.floor(start); i < end; i++) {
    const a = points[i], b = points[i + 1]
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue
    line(i < start ? interpolate(a, b, start - i) : a, i + 1 > end ? interpolate(a, b, end - i) : b)
    drew = true
  }
  return drew
}

/** Segment coordinates follow the presented cut (including array remapping).
 * These marks may reveal or retract, but the underlying slot never moves. */
export function visitMotionMark(anchor: WorldAnchor, mark: MotionMark, line: (a: Vec3, b: Vec3) => void) {
  const [x, y, z] = anchor.position, [width, height, depth] = anchor.size
  const phase = mark.progress, ease = 1 - (1 - phase) ** 3
  const front = z + depth / 2 + .018
  const halfWidth = width / 2 + .018, halfHeight = height / 2 + .018
  const left = x - halfWidth, right = x + halfWidth, bottom = y - halfHeight, top = y + halfHeight
  const rule = (x1: number, y1: number, x2: number, y2: number, face = front) => line([x1, y1, face], [x2, y2, face])
  const rect = (l: number, b: number, r: number, t: number, face = front) => {
    rule(l, b, r, b, face); rule(r, b, r, t, face); rule(r, t, l, t, face); rule(l, t, l, b, face)
  }
  switch (mark.shape) {
    case 'volume': {
      const l = x - halfWidth * (.92 + .08 * ease), r = 2 * x - l
      const b = y - halfHeight * (.92 + .08 * ease), t = 2 * y - b, back = front - (depth + .036) * ease
      rect(l, b, r, t); rect(l, b, r, t, back)
      for (const px of [l, r]) for (const py of [b, t]) line([px, py, front], [px, py, back])
      break
    }
    case 'rise': rect(left, bottom, right, bottom + (top - bottom) * (.18 + .82 * ease)); break
    case 'drop': rect(left, bottom, right, phase === 1 ? top : top - height * .66 * ease); break
    case 'underline': rule(left, bottom, left + (right - left) * (.22 + .78 * ease), bottom); break
    case 'inward': rule(right, top, right - (right - left) * (.2 + .8 * ease), top); break
    case 'outward': rule(left, top, left + (right - left) * (.2 + .8 * ease), top); break
    case 'field': rect(left, bottom, left + (right - left) * (.22 + .78 * ease), top); break
    case 'cell': {
      const back = front - (depth + .036) * (.25 + .75 * ease)
      line([left, top, front], [right, top, front]); line([left, top, back], [right, top, back])
      line([left, top, front], [left, top, back]); line([right, top, front], [right, top, back])
      break
    }
    case 'return': {
      const span = halfWidth * (.22 + .78 * ease)
      rule(x - span, bottom, x + span, bottom); rule(x - span, top, x + span, top)
      break
    }
    case 'throw': {
      // An abrupt pair of open rails marks the throw site without flashing it.
      rule(left, bottom, left, top); rule(right, bottom, right, top)
      rule(left, top, left + width * .34, top); rule(right, top, right - width * .34, top)
      break
    }
    case 'catch': case 'bracket': {
      const span = mark.shape === 'catch' ? .3 + .45 * (1 - ease) : .22 + .17 * ease
      for (const side of [-1, 1]) for (const vertical of [-1, 1]) {
        const px = x + side * halfWidth, py = y + vertical * halfHeight
        rule(px, py, px - side * halfWidth * span, py)
        rule(px, py, px, py - vertical * halfHeight * span)
      }
      break
    }
  }
}
