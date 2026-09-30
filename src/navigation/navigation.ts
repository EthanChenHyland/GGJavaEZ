import { create } from 'zustand'
import type { CameraIntent, CameraMode, CameraPose, NavigationState, Selection } from '../contracts/interaction'
import type { ReferenceId } from '../contracts/runtime'
import type { DetailLevel, SceneModel, SceneReferenceEdge, Vec3, WorldAnchor } from '../contracts/world'
import { worldUnits } from '../theme/tokens'

export const defaultHomePose: CameraPose = {
  position: worldUnits.homePosition,
  target: worldUnits.homeTarget,
}

export type NavigationWorld = {
  anchors: Record<string, WorldAnchor>
  references: readonly SceneReferenceEdge[]
  homeTarget?: Vec3
}

/** Live geometry participates in collision/selection; framing stays trace-reserved. */
export function navigationWorldForScene(scene: SceneModel, homeTarget?: Vec3): NavigationWorld {
  const reserved = !!scene.bounds && ((scene.stackDepth ?? 0) > 1 || (scene.layoutKind === 'array' || scene.layoutKind === 'scoped'))
  return {
    anchors: Object.fromEntries([
      ...scene.frames.map((node) => [node.id, node.anchor] as const),
      ...(scene.layoutKind === 'scoped' ? scene.frames.flatMap((node) => node.slots.map((slot) => [slot.id, {
        entityId: slot.id, region: 'stack' as const,
        position: [node.anchor.position[0], slot.port[1], slot.port[2]] as Vec3,
        size: [node.anchor.size[0] - 0.4, worldUnits.scope.rowGap, 0.1] as Vec3,
        ports: {}, bodyPort: slot.port,
      }] as const)) : []),
      ...scene.objects.map((node) => [node.id, node.anchor] as const),
      ...scene.objects.flatMap((node) => node.array?.cells.map((cell) => [cell.id, cell.anchor] as const) ?? []),
    ]),
    references: scene.references,
    homeTarget: reserved ? homeTarget ?? scene.bounds?.center : homeTarget,
  }
}

/** Collision follows physical runtime geometry, not an array's empty framing envelope. */
export function collisionAnchorsForScene(scene: SceneModel): WorldAnchor[] {
  return [
    ...scene.frames.map((node) => node.anchor),
    ...scene.objects.flatMap((node) => {
      if (!node.array) return [node.anchor]
      const { position, size } = node.anchor
      const header = worldUnits.arrayHeader
      return [
        { ...node.anchor, position: [position[0], position[1] + size[1] / 2 - header.topInset, position[2]] as Vec3,
          size: [Math.min(size[0], header.maxWidth), header.height, Math.min(size[2], header.depth)] as Vec3 },
        ...node.array.cells.map((cell) => cell.anchor),
      ]
    }),
  ]
}

export interface NavigationStore extends NavigationState {
  /** A presentation filter retained while orbiting the inspected entity. */
  isolatedSelection: Selection
  followEnabled: boolean
  selection: Selection
  traceReferenceId: ReferenceId | null
  previousMode: CameraMode | null
  intent: CameraIntent | null
  intentRevision: number
  setRepresentation: (presentation: 'spatial' | 'theater') => void
  home: () => void
  resetView: () => void
  zoomIn: () => void
  zoomOut: () => void
  followExecution: () => void
  freeExplore: (pose?: CameraPose) => void
  focus: (selection: NonNullable<Selection>) => void
  focusEntity: (selection: NonNullable<Selection>) => void
  tracePath: (referenceId: ReferenceId) => void
  returnToPrevious: () => void
  setPose: (pose: CameraPose) => void
  setDetailLevel: (detailLevel: DetailLevel) => void
  rememberPrevious: (pose: CameraPose, mode: CameraMode) => void
}

/** Presentation state only. Playback and semantic runtime state remain independent. */
export const useNavigationStore = create<NavigationStore>((set) => ({
  mode: 'HOME',
  pose: defaultHomePose,
  previousPose: null,
  detailLevel: 'meso',
  followEnabled: false,
  selection: null,
  isolatedSelection: null,
  traceReferenceId: null,
  previousMode: null,
  intent: null,
  intentRevision: 0,
  setRepresentation: (presentation) => set((state) => ({
    mode: presentation === 'theater' ? 'THEATER' : 'FREE_EXPLORE', isolatedSelection: null,
    followEnabled: false, traceReferenceId: null,
    previousPose: null, previousMode: null,
    intent: { kind: 'representation', presentation }, intentRevision: state.intentRevision + 1,
  })),
  home: () => set((state) => ({
    mode: 'HOME', followEnabled: false, traceReferenceId: null, isolatedSelection: null,
    previousPose: null, previousMode: null,
    intent: { kind: 'home' }, intentRevision: state.intentRevision + 1,
  })),
  resetView: () => set((state) => ({
    mode: 'HOME', followEnabled: false, traceReferenceId: null, isolatedSelection: null,
    previousPose: null, previousMode: null,
    intent: { kind: 'resetView' }, intentRevision: state.intentRevision + 1,
  })),
  zoomIn: () => set((state) => ({
    mode: 'FREE_EXPLORE', followEnabled: false, traceReferenceId: null,
    intent: { kind: 'zoom', direction: 'in' }, intentRevision: state.intentRevision + 1,
  })),
  zoomOut: () => set((state) => ({
    mode: 'FREE_EXPLORE', followEnabled: false, traceReferenceId: null,
    intent: { kind: 'zoom', direction: 'out' }, intentRevision: state.intentRevision + 1,
  })),
  followExecution: () => set((state) => ({
    mode: 'GUIDED_FOLLOW', followEnabled: true, traceReferenceId: null, isolatedSelection: null,
    intent: { kind: 'followExecution' }, intentRevision: state.intentRevision + 1,
  })),
  freeExplore: (pose) => set((state) => ({
    mode: 'FREE_EXPLORE', followEnabled: false, traceReferenceId: null,
    intent: null, intentRevision: state.intentRevision + 1,
    ...(pose ? { pose } : {}),
  })),
  focus: (selection) => useNavigationStore.getState().focusEntity(selection),
  focusEntity: (selection) => set((state) => ({
    mode: 'FOCUS_ENTITY', followEnabled: false, selection, isolatedSelection: selection, traceReferenceId: null,
    previousPose: state.pose, previousMode: state.mode,
    intent: { kind: 'focus', selection }, intentRevision: state.intentRevision + 1,
  })),
  tracePath: (referenceId) => set((state) => ({
    mode: 'TRACE_PATH', followEnabled: false, traceReferenceId: referenceId, isolatedSelection: null,
    previousPose: state.pose, previousMode: state.mode,
    intent: { kind: 'tracePath', referenceId }, intentRevision: state.intentRevision + 1,
  })),
  returnToPrevious: () => set((state) => ({
    mode: state.previousMode ?? 'HOME',
    followEnabled: state.previousMode === 'GUIDED_FOLLOW',
    traceReferenceId: null,
    isolatedSelection: null,
    intent: { kind: 'returnToPrevious' }, intentRevision: state.intentRevision + 1,
  })),
  setPose: (pose) => set({ pose }),
  setDetailLevel: (detailLevel) => set({ detailLevel }),
  rememberPrevious: (previousPose, previousMode) => set({ previousPose, previousMode }),
}))

export const navigationActions = {
  setRepresentation: (presentation: 'spatial' | 'theater') => useNavigationStore.getState().setRepresentation(presentation),
  resetView: () => useNavigationStore.getState().resetView(),
  zoomIn: () => useNavigationStore.getState().zoomIn(),
  zoomOut: () => useNavigationStore.getState().zoomOut(),
  home: () => useNavigationStore.getState().home(),
  followExecution: () => useNavigationStore.getState().followExecution(),
  freeExplore: () => useNavigationStore.getState().freeExplore(),
  focusEntity: (selection: NonNullable<Selection>) => useNavigationStore.getState().focusEntity(selection),
  focus: (selection: NonNullable<Selection>) => useNavigationStore.getState().focusEntity(selection),
  tracePath: (referenceId: ReferenceId) => useNavigationStore.getState().tracePath(referenceId),
  returnToPrevious: () => useNavigationStore.getState().returnToPrevious(),
}

export function homePose(homeTarget: Vec3 = worldUnits.homeTarget): CameraPose {
  const offset = worldUnits.homePosition.map((value, index) => value - worldUnits.homeTarget[index])
  return { target: homeTarget, position: [homeTarget[0] + offset[0], homeTarget[1] + offset[1], homeTarget[2] + offset[2]] }
}

export function selectionPoint(selection: NonNullable<Selection>, world: NavigationWorld): { position: Vec3; size: Vec3 } | null {
  if (selection.kind === 'reference') {
    const edge = world.references.find((reference) => reference.id === selection.id)
    return edge ? { position: midpoint(edge.from, edge.to), size: [distance(edge.from, edge.to), 1, 1] } : null
  }
  if (selection.kind === 'slot') {
    // Indexed locations are volumes, with their own identity and focus extent.
    const cell = world.anchors[selection.id]
    if (cell) return { position: cell.position, size: cell.size }
    for (const anchor of Object.values(world.anchors)) {
      const port = anchor.ports[selection.id]
      if (port) return { position: port, size: [1, 1, 1] }
    }
    return null
  }
  const anchor = world.anchors[selection.id]
  return anchor ? { position: anchor.position, size: anchor.size } : null
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Zoom bands use different enter/exit distances to prevent label flicker. */
export function detailLevelAtDistance(distanceToPivot: number, current: DetailLevel): DetailLevel {
  if (current === 'macro') return distanceToPivot < 18.5 ? 'meso' : 'macro'
  if (current === 'micro') return distanceToPivot > 11.5 ? 'meso' : 'micro'
  if (distanceToPivot > 20) return 'macro'
  if (distanceToPivot < 10) return 'micro'
  return 'meso'
}

/** A larger trace envelope should not hide locals at its canonical overview.
 * Zoom bands describe inspection scale relative to that reserved world, while
 * shallow scenes keep the established absolute Person thresholds.
 */
export function detailDistanceForScene(distanceToPivot: number, overview: CameraPose, scene: Pick<SceneModel, 'stackDepth' | 'bounds' | 'layoutKind'>): number {
  if (!scene.bounds || ((scene.stackDepth ?? 0) <= 1 && scene.layoutKind !== 'array' && scene.layoutKind !== 'scoped')) return distanceToPivot
  const overviewDistance = distance(overview.position, overview.target)
  return distanceToPivot * distance(defaultHomePose.position, defaultHomePose.target) / Math.max(0.01, overviewDistance)
}
