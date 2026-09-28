import type { EventId, FrameId, ObjectId, ReferenceId, ReturnTransfer, RuntimeValue, SlotId, SlotOwner } from './runtime'

export type Vec3 = readonly [number, number, number]
export type Region = 'stack' | 'heap'
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

export interface LayoutState {
  anchors: Record<string, WorldAnchor>
  homeTarget: Vec3
  /** Reserved for the entire trace, never recomputed from live frame count. */
  stackDepth?: number
  bounds?: { center: Vec3; size: Vec3; points?: Vec3[] }
}

export interface SceneSlot {
  id: SlotId
  name: string
  javaType: string
  value: RuntimeValue
  displayValue?: string
  role?: 'local' | 'parameter' | 'operand' | 'return'
  port: Vec3
}

export interface SceneFrameNode {
  kind: 'frame'
  id: FrameId
  label: string
  depth: number
  active: boolean
  anchor: WorldAnchor
  slots: SceneSlot[]
}

export interface SceneObjectNode {
  kind: 'object'
  id: ObjectId
  label: string
  className: string
  displayId: number
  anchor: WorldAnchor
  fields: SceneSlot[]
}

export interface SceneReferenceEdge {
  id: ReferenceId
  source: SlotOwner
  targetObjectId: ObjectId
  from: Vec3
  to: Vec3
}

export interface SceneModel {
  frames: SceneFrameNode[]
  objects: SceneObjectNode[]
  references: SceneReferenceEdge[]
  activeEventId: EventId | null
  detailLevel: DetailLevel
  stackDepth?: number
  bounds?: LayoutState['bounds']
  returnFlow?: ReturnTransfer & { from: Vec3; to: Vec3 | null; fromLabel: string; toLabel: string | null; fromDepth: number; toDepth: number | null }
}
