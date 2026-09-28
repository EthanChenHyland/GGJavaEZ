import type { EventId, FrameId, ObjectId, ReferenceId, ArrayActivity, ArrayMutation, ReturnTransfer, RuntimeValue, SlotId, SlotOwner } from './runtime'

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

export type WorldBounds = { center: Vec3; size: Vec3; points?: Vec3[] }

export interface LayoutState {
  anchors: Record<string, WorldAnchor>
  homeTarget: Vec3
  /** Reserved for the entire trace, never recomputed from live frame count. */
  stackDepth?: number
  bounds?: WorldBounds
  layoutKind?: 'standard' | 'deepStack' | 'array'
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

export interface SceneArrayCell extends SceneSlot { index: number; anchor: WorldAnchor }

export interface SceneObjectNode {
  kind: 'object'
  id: ObjectId
  label: string
  className: string
  displayId: number
  anchor: WorldAnchor
  fields: SceneSlot[]
  array?: { elementType: 'int'; length: number; cells: SceneArrayCell[] }
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
  presentation?: 'spatial' | 'theater'
  layoutKind?: LayoutState['layoutKind']
  arrayActivity?: ArrayActivity | null
  arrayMutations?: ArrayMutation[]
  returnFlow?: ReturnTransfer & { from: Vec3; to: Vec3 | null; fromLabel: string; toLabel: string | null; fromDepth: number; toDepth: number | null }
}
