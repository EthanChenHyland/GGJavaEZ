import type { SceneModel, Vec3 } from '../contracts/world'

export interface CallEdge { id: string; callerId: string; calleeId: string; points: Vec3[] }

/** Reserve a rear plane for legacy scene consumers; face-attached calls use their own clear channel. */
export function connectorBackPlane(scene: SceneModel): number {
  const solids = [...scene.frames, ...scene.objects]
  return solids.length ? Math.min(...solids.map((node) => node.anchor.position[2] - node.anchor.size[2] / 2)) - 0.55 : -2
}

/** A call is an observed parent-child edge. Siblings never form a false call chain. */
export function callEdgesForScene(scene: SceneModel, _behindZ = connectorBackPlane(scene)): CallEdge[] {
  const byId = new Map(scene.frames.map((frame) => [frame.id, frame]))
  return scene.frames.flatMap((child) => {
    const parent = child.callerFrameId && byId.get(child.callerFrameId)
    if (!parent || child.callerEvidence === 'unavailable') return []
    const fromFace: Vec3 = [parent.anchor.position[0], parent.anchor.position[1] - parent.anchor.size[1] / 2 + 0.07, parent.anchor.position[2] + parent.anchor.size[2] / 2 + 0.055]
    const toFace: Vec3 = [child.anchor.position[0], child.anchor.position[1] + child.anchor.size[1] / 2 - 0.07, child.anchor.position[2] + child.anchor.size[2] / 2 + 0.055]
    const frontZ = Math.max(fromFace[2], toFace[2]) + 0.28
    const from: Vec3 = [fromFace[0], fromFace[1] - 0.16, frontZ]
    const to: Vec3 = [toFace[0], toFace[1] + 0.16, frontZ]
    const middleY = (from[1] + to[1]) / 2
    return [{ id: `${parent.id}:${child.id}`, callerId: parent.id, calleeId: child.id,
      points: [fromFace, from, [from[0], middleY, frontZ], [to[0], middleY, frontZ], to, toFace] as Vec3[] }]
  })
}
