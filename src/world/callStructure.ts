import type { SceneModel, Vec3 } from '../contracts/world'

export interface CallEdge { id: string; callerId: string; calleeId: string; points: Vec3[] }

/** Keep the long connection channel behind solid faces so frame labels remain unobscured. */
export function connectorBackPlane(scene: SceneModel): number {
  const solids = [...scene.frames, ...scene.objects]
  return solids.length ? Math.min(...solids.map((node) => node.anchor.position[2] - node.anchor.size[2] / 2)) - 0.55 : -2
}

/** A call is an observed parent-child edge. Siblings never form a false call chain. */
export function callEdgesForScene(scene: SceneModel, behindZ = connectorBackPlane(scene)): CallEdge[] {
  const byId = new Map(scene.frames.map((frame) => [frame.id, frame]))
  return scene.frames.flatMap((child) => {
    const parent = child.callerFrameId && byId.get(child.callerFrameId)
    if (!parent) return []
    const fromFace: Vec3 = [parent.anchor.position[0], parent.anchor.position[1] - parent.anchor.size[1] / 2 - 0.04, parent.anchor.position[2] + parent.anchor.size[2] / 2 + 0.055]
    const toFace: Vec3 = [child.anchor.position[0], child.anchor.position[1] + child.anchor.size[1] / 2 + 0.04, child.anchor.position[2] + child.anchor.size[2] / 2 + 0.055]
    const from: Vec3 = [fromFace[0], fromFace[1], behindZ]
    const to: Vec3 = [toFace[0], toFace[1], behindZ]
    const middleY = (from[1] + to[1]) / 2
    return [{ id: `${parent.id}:${child.id}`, callerId: parent.id, calleeId: child.id,
      points: [fromFace, from, [from[0], middleY, behindZ], [to[0], middleY, behindZ], to, toFace] as Vec3[] }]
  })
}
