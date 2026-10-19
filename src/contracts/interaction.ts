import type { FrameId, ObjectId, ReferenceId, SlotId } from './runtime'

export type Selection =
  | { kind: 'frame'; id: FrameId }
  | { kind: 'object'; id: ObjectId }
  | { kind: 'class'; id: string }
  | { kind: 'slot'; id: SlotId }
  | { kind: 'reference'; id: ReferenceId }
  | { kind: 'flow'; id: string }
  | { kind: 'cluster'; id: string }
  | { kind: 'bundle'; id: string }
  | null
