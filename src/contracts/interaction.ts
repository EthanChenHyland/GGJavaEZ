import type { FrameId, ObjectId, ReferenceId, SlotId } from './runtime'
import type { DetailLevel, Vec3 } from './world'

export type Selection =
  | { kind: 'frame'; id: FrameId }
  | { kind: 'object'; id: ObjectId }
  | { kind: 'slot'; id: SlotId }
  | { kind: 'reference'; id: ReferenceId }
  | null

export type CameraMode = 'HOME' | 'GUIDED_FOLLOW' | 'FREE_EXPLORE' | 'FOCUS_ENTITY' | 'TRACE_PATH' | 'THEATER'

export interface CameraPose {
  position: Vec3
  target: Vec3
}

export type CameraIntent =
  | { kind: 'representation'; presentation: 'spatial' | 'theater' }
  | { kind: 'home' }
  | { kind: 'resetView' }
  | { kind: 'zoom'; direction: 'in' | 'out' }
  | { kind: 'followExecution' }
  | { kind: 'focus'; selection: NonNullable<Selection> }
  | { kind: 'tracePath'; referenceId: ReferenceId }
  | { kind: 'returnToPrevious' }

export interface NavigationState {
  mode: CameraMode
  pose: CameraPose
  previousPose: CameraPose | null
  detailLevel: DetailLevel
}

export interface PlaybackState {
  cursor: number
  playing: boolean
  speed: 0.5 | 1 | 2 | 4
}
