import { create } from 'zustand'
import type { CameraIntent, CameraMode, CameraPose, NavigationState, Selection } from '../contracts/interaction'
import type { ReferenceId } from '../contracts/runtime'
import type { DetailLevel, SceneReferenceEdge, Vec3, WorldAnchor } from '../contracts/world'
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

export interface NavigationStore extends NavigationState {
  followEnabled: boolean
  selection: Selection
  traceReferenceId: ReferenceId | null
  previousMode: CameraMode | null
  intent: CameraIntent | null
  intentRevision: number
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
  traceReferenceId: null,
  previousMode: null,
  intent: null,
  intentRevision: 0,
  home: () => set((state) => ({
    mode: 'HOME', followEnabled: false, traceReferenceId: null,
    previousPose: null, previousMode: null,
    intent: { kind: 'home' }, intentRevision: state.intentRevision + 1,
  })),
  resetView: () => set((state) => ({
    mode: 'HOME', followEnabled: false, traceReferenceId: null,
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
    mode: 'GUIDED_FOLLOW', followEnabled: true, traceReferenceId: null,
    intent: { kind: 'followExecution' }, intentRevision: state.intentRevision + 1,
  })),
  freeExplore: (pose) => set((state) => ({
    mode: 'FREE_EXPLORE', followEnabled: false, traceReferenceId: null,
    intent: null, intentRevision: state.intentRevision + 1,
    ...(pose ? { pose } : {}),
  })),
  focus: (selection) => useNavigationStore.getState().focusEntity(selection),
  focusEntity: (selection) => set((state) => ({
    mode: 'FOCUS_ENTITY', followEnabled: false, selection, traceReferenceId: null,
    previousPose: state.pose, previousMode: state.mode,
    intent: { kind: 'focus', selection }, intentRevision: state.intentRevision + 1,
  })),
  tracePath: (referenceId) => set((state) => ({
    mode: 'TRACE_PATH', followEnabled: false, traceReferenceId: referenceId,
    previousPose: state.pose, previousMode: state.mode,
    intent: { kind: 'tracePath', referenceId }, intentRevision: state.intentRevision + 1,
  })),
  returnToPrevious: () => set((state) => ({
    mode: state.previousMode ?? 'HOME',
    followEnabled: state.previousMode === 'GUIDED_FOLLOW',
    traceReferenceId: null,
    intent: { kind: 'returnToPrevious' }, intentRevision: state.intentRevision + 1,
  })),
  setPose: (pose) => set({ pose }),
  setDetailLevel: (detailLevel) => set({ detailLevel }),
  rememberPrevious: (previousPose, previousMode) => set({ previousPose, previousMode }),
}))

export const navigationActions = {
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
