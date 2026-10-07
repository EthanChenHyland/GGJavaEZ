import type { CameraPose, Selection } from '../contracts/interaction'
import type { DetailLevel, SceneModel, Vec3, WorldAnchor, WorldBounds } from '../contracts/world'
import { focusEntityIds } from '../world/isolatedScene'
import { contextPose, frontFacePoint, inspectorFocusPose } from './cameraMotion'
import type { InspectorViewport, ViewFraming } from './cameraMotion'
import { distance } from './navigation'

/** Fit the renderer's represented landscape, never a fixture pose or an array flag. */
export function spatial2HomePose(bounds: WorldBounds | undefined, view: ViewFraming, viewport?: InspectorViewport): CameraPose {
  const pivot = bounds?.center ?? [0, 0, 0]
  const direction: Vec3 = [0.3, 0.24, 1]
  const viewing: CameraPose = { target: pivot, position: [pivot[0] + direction[0], pivot[1] + direction[1], pivot[2] + direction[2]] }
  if (bounds && viewport) return inspectorFocusPose(pivot, bounds.size, viewing, [], view, viewport, pivot, 2.4, [0.6, 1.2, 0.4])
  const envelope: WorldAnchor[] = bounds && !bounds.points?.length ? [{
    entityId: 'navigation:represented-world', region: 'stack', position: bounds.center,
    size: bounds.size, ports: {}, bodyPort: bounds.center,
  }] : []
  return contextPose(pivot, viewing, envelope, bounds?.points ?? [], view, bounds ? 2.4 : 10)
}

export function spatial2Viewport(width: number, height: number, inspectorVisible: boolean): InspectorViewport {
  return { width, height, topInset: 94, bottomInset: 100,
    rightInset: inspectorVisible ? 300 : 20, leftInset: 20 }
}

/** Neighbors are observed identities in the represented scene. Remote neighbors
 * stay available for exploration; they cannot shrink the inspected face to a dot. */
export function spatial2FocusPose(selection: NonNullable<Selection>, anchor: Pick<WorldAnchor, 'position' | 'size'>,
  scene: SceneModel, view: ViewFraming, viewport: InspectorViewport): CameraPose {
  const face = frontFacePoint(anchor)
  // About 18 degrees of side reveal; the +Z information face stays primary.
  // Curated scenes retain their existing frontFaceViewingPose constraints.
  const viewing: CameraPose = { target: face, position: [face[0] + 0.32, face[1] + 0.18, face[2] + 1] }
  const fit = (context: WorldAnchor[]) => inspectorFocusPose(face, anchor.size, viewing, context, view, viewport,
    face, 3.2, [0.5, 0.8, 0.3])
  const subject = fit([])
  const maximumRange = distance(subject.position, subject.target) * 1.15
  const ids = focusEntityIds(scene, selection)
  const subjects = focusEntityIds(scene, selection, false)
  const candidates = [...scene.frames, ...scene.objects, ...(scene.classes ?? [])]
    .filter(node => ids.has(node.id) && !subjects.has(node.id))
    .map(node => node.anchor)
    .sort((a, b) => distance(a.position, face) - distance(b.position, face))
    .slice(0, 2)
  const context: WorldAnchor[] = []
  let pose = subject
  for (const candidate of candidates) {
    const next = fit([...context, candidate])
    if (distance(next.position, next.target) > maximumRange) continue
    context.push(candidate)
    pose = next
  }
  return pose
}

/** Typical face scale comes from the full runtime catalog, never an LOD subset.
 * Excludes giant array envelopes and world extents. */
export function spatial2DetailExtent(catalog: SceneModel): number {
  const heights = [...catalog.frames, ...catalog.objects, ...(catalog.classes ?? [])]
    .map(node => node.kind === 'object' && node.array ? node.array.cells[0]?.anchor.size[1] ?? 1.5 : node.anchor.size[1])
    .filter(height => Number.isFinite(height) && height > 0)
    .sort((a, b) => a - b)
  return heights.length ? heights[Math.floor(heights.length / 2)] : 2
}

/** Projected face coverage changes detail for tiny and enormous worlds alike.
 * Separate enter/exit thresholds keep labels stable around each boundary. */
export function spatial2DetailLevel(distanceToSubject: number, faceHeight: number, view: ViewFraming, current: DetailLevel): DetailLevel {
  const coverage = faceHeight / (2 * Math.max(0.01, distanceToSubject) * Math.tan(view.verticalFov / 2))
  if (current === 'macro') return coverage > 0.115 ? 'meso' : 'macro'
  if (current === 'micro') return coverage < 0.36 ? 'meso' : 'micro'
  if (coverage < 0.09) return 'macro'
  if (coverage > 0.44) return 'micro'
  return 'meso'
}
