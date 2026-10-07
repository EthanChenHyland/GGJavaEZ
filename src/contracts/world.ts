import type { EventId, FrameId, ObjectId, ReferenceId, ArrayActivity, ArrayMutation, ReturnTransfer, RuntimeValue, SlotId, SlotOwner, RuntimeTypeMetadata } from './runtime'

export type Vec3 = readonly [number, number, number]
export type Region = 'stack' | 'heap' | 'class' | 'io'
export type DetailLevel = 'macro' | 'meso' | 'micro'

export interface WorldAnchor {
  entityId: FrameId | ObjectId
  region: Region
  position: Vec3
  size: Vec3
  /** Port coordinates in world space, keyed by stable slot IDs. */
  ports: Record<SlotId, Vec3>
  bodyPort: Vec3
}

export type WorldBounds = { center: Vec3; size: Vec3; points?: Vec3[] }

export interface LayoutState {
  anchors: Record<string, WorldAnchor>
  homeTarget: Vec3
  /** Reserved for the entire trace, never recomputed from live frame count. */
  stackDepth?: number
  bounds?: WorldBounds
  layoutKind?: 'standard' | 'deepStack' | 'array' | 'scoped' | 'spatial2'
  scopes?: Record<string, SceneScopeNode & { frameId: FrameId }>
  theater?: { anchors: Record<string, WorldAnchor>; bounds: WorldBounds; homeTarget: Vec3 }
}

export interface SceneSlot {
  id: SlotId
  name: string
  javaType: string
  value: RuntimeValue
  displayValue?: string
  role?: 'local' | 'parameter' | 'operand' | 'return'
  port: Vec3
  scopeId?: string
  scopeDepth?: number
}

export interface SceneScopeNode {
  id: string
  label: string
  parentId: string | null
  depth: number
  slotIds: string[]
  anchor: WorldAnchor
}

export interface SceneFrameNode {
  kind: 'frame'
  id: FrameId
  callerFrameId?: FrameId | null
  /** An observed ancestor across opaque code is not a proven direct CALL. */
  callerEvidence?: 'observed' | 'unavailable'
  className?: string
  metadata?: RuntimeTypeMetadata
  label: string
  depth: number
  active: boolean
  /** Exception history shown after the JVM has unwound this frame. */
  historical?: boolean
  /** A retained invocation record, never an active JVM stack frame. */
  invocationStatus?: 'active' | 'completed' | 'unwound' | 'failed' | 'stopped'
  exceptionState?: 'origin' | 'unwound' | 'caught' | 'finally'
  anchor: WorldAnchor
  slots: SceneSlot[]
  scopes?: SceneScopeNode[]
}

export interface SceneArrayCell extends SceneSlot { index: number; anchor: WorldAnchor }

export interface SceneObjectNode {
  kind: 'object'
  id: ObjectId
  label: string
  className: string
  displayId: number
  anchor: WorldAnchor
  fields: SceneSlot[]
  /** Bounded semantic summary, shown without implying project implementation fields. */
  summaryLabel?: string
  metadata?: RuntimeTypeMetadata
  array?: { elementType: string; length: number; cells: SceneArrayCell[] }
}

export interface SceneClassNode {
  kind: 'class'
  id: string
  className: string
  label: string
  initialization: 'started' | 'completed' | 'observed'
  anchor: WorldAnchor
  fields: SceneSlot[]
  metadata?: RuntimeTypeMetadata
}

export type SceneSlotOwner = SlotOwner | { kind: 'class'; classId: string; slotId: SlotId }
export const sceneSourceId = (source: SceneSlotOwner): string => source.kind === 'frame' ? source.frameId : source.kind === 'class' ? source.classId : source.objectId

export interface SceneReferenceEdge {
  id: ReferenceId
  source: SceneSlotOwner
  targetObjectId: ObjectId
  from: Vec3
  to: Vec3
  /** Slightly proud of the solid so the visible curve visibly attaches to its face. */
  fromFace?: Vec3
  toFace?: Vec3
  /** Reference last recorded in a completed invocation; no longer a live JVM root. */
  historical?: boolean
}

export interface SceneIoEndpoint {
  id: 'stdin' | 'stdout' | 'stderr'
  observations: number
  preview: string
  anchor: WorldAnchor
}

export interface SceneModel {
  io?: SceneIoEndpoint[]
  frames: SceneFrameNode[]
  objects: SceneObjectNode[]
  classes?: SceneClassNode[]
  references: SceneReferenceEdge[]
  activeEventId: EventId | null
  detailLevel: DetailLevel
  stackDepth?: number
  bounds?: LayoutState['bounds']
  presentation?: 'spatial' | 'theater'
  layoutKind?: LayoutState['layoutKind']
  arrayActivity?: ArrayActivity | null
  arrayMutations?: ArrayMutation[]
  returnFlow?: ReturnTransfer & { from: Vec3; to: Vec3 | null; fromLabel: string; toLabel: string | null; fromDepth: number; toDepth: number | null }
}
