import type { FrameId, ObjectId, SlotId, ReferenceId, EventId, SourceLocation, RuntimeTypeMetadata } from './runtime';
import type { RecordingStatus } from '../instrumentation/contracts';
export type Ownership = RuntimeTypeMetadata['ownership'];
export type Vec3 = readonly [
    number,
    number,
    number
];
export type EntityId = string;
export type DetailLevel = 'FAR' | 'MEDIUM' | 'CLOSE';
export type Region = 'stack' | 'heap' | 'library' | 'class' | 'io';
export interface WorldAnchor {
    entityId: EntityId;
    region: Region;
    position: Vec3; // box centre
    size: Vec3;
    ports: Readonly<Record<SlotId, Vec3>>; // canonical local-solid Ports; virtualized cells use ArrayWindow.mapping
    bodyPort: Vec3;
}
export interface Evidence {
    kind: 'observed' | 'derived' | 'unavailable';
    introducedSeq: number | null;
    changedSeq: number | null;
    eventIds: readonly EventId[];
    derivation?: string;
    unavailableReason?: string;
}
export type ValueText = ValueObservation & ({
    kind: 'primitive' | 'string' | 'null';
    text: string;
    exact: string;
} | {
    kind: 'reference';
    text: string;
    exact: string;
    targetId: ObjectId;
    targetType: string;
} | {
    kind: 'not-recorded';
    text: '⟨not recorded⟩';
    exact: '⟨not recorded⟩';
});
export interface ValueObservation {
    observation: 'OBSERVED' | 'TRUNCATED' | 'UNAVAILABLE' | 'PARTIALLY_OBSERVED';
    recordedLength?: number;
    reason?: string;
}
export interface SceneRow {
    slotId: SlotId;
    name: string;
    type: string;
    value: ValueText;
    role: 'this' | 'parameter' | 'local' | 'field' | 'static';
    declaringClass?: string;
    scopeDepth?: number;
    port: Vec3 | null;
    evidence: Evidence;
}
export type FrameStatus = {
    kind: 'running';
    line: number | null;
} | {
    kind: 'paused';
    line: number | null;
} | {
    kind: 'returning';
} | {
    kind: 'returned';
    value: ValueText | null;
} // value only without a proven destination (10.8)
 | {
    kind: 'threw';
    exception: string;
} | {
    kind: 'unwound';
    exception: string;
} | {
    kind: 'caught';
    exception: string;
    line: number | null;
} | {
    kind: 'terminated';
};
export interface SceneFrame {
    kind: 'frame';
    id: FrameId;
    invocationNumber: number;
    title: string; // Type.method(ParamTypes) / <clinit>
    callerId: FrameId | null;
    depth: number;
    rows: readonly SceneRow[];
    scopeDividers?: readonly {
        afterRow: number;
        label: string;
        depth: number;
    }[];
    status: FrameStatus;
    live: boolean;
    topOfStack: boolean;
    exceptionRole: 'origin' | 'unwound' | 'caught' | null;
    sourceLine: SourceLocation | null; // current line, or call line while waiting on a callee
    anchor: WorldAnchor;
    ownership: Ownership;
    evidence: Evidence;
}
export interface SceneObject {
    kind: 'object';
    id: ObjectId;
    displayId: number;
    title: string; // runtime class in Java source form
    groups: readonly {
        declaringClass: string;
        rows: readonly SceneRow[];
    }[];
    fieldCount: number;
    summaryUnavailable?: boolean;
    allocationSite: SourceLocation | null;
    anchor: WorldAnchor;
    ownership: Ownership;
    evidence: Evidence;
    mutation: {
        slotId: SlotId;
    } | null; // field write at the Cursor Event (12.12–12.13)
}
export interface SceneArray {
    kind: 'array';
    id: ObjectId;
    displayId: number;
    title: string;
    componentType: string;
    length: number;
    cells: readonly {
        index: number;
        slotId: SlotId;
        value: ValueText;
        evidence: Evidence;
    }[]; // observed/sparse cells, not length-sized geometry
    activity: {
        kind: 'read' | 'write';
        index: number;
    } | null;
    outOfBounds: {
        index: number;
    } | null;
    anchor: WorldAnchor;
    ownership: Ownership;
    evidence: Evidence;
}
export interface SceneCollection {
    kind: 'collection';
    id: ObjectId;
    displayId: number;
    title: string;
    collectionKind: 'List' | 'Set' | 'Map' | 'Queue' | 'Deque';
    size: number;
    recordedEntries: number; // size − recordedEntries = not recorded (15.9)
    entries: readonly ({
        key?: ValueText;
        keySlotId?: SlotId;
        keyPort?: Vec3 | null;
        value: ValueText;
        port: Vec3 | null;
        slotId: SlotId;
        evidence: Evidence;
    })[];
    mutation: {
        kind: 'add' | 'remove' | 'put' | 'poll';
        entryIndex: number | null;
    } | null;
    anchor: WorldAnchor;
    ownership: Ownership;
    evidence: Evidence;
}
export interface SceneClass {
    kind: 'class';
    id: string;
    title: string;
    packageName: string;
    initialization: 'started' | 'completed' | 'observed';
    rows: readonly SceneRow[];
    anchor: WorldAnchor;
    evidence: Evidence;
}
export type SceneEntity = SceneFrame | SceneObject | SceneArray | SceneCollection | SceneClass;
export interface SceneReference {
    id: ReferenceId; // ref:<slotId>
    sourceId: EntityId;
    sourceSlotId: SlotId;
    targetId: ObjectId;
    role: 'frame-object' | 'object-object' | 'class-object';
    overlay: 'return' | 'exception' | null; // colour precedence exception > return (16.5)
    evidence: Evidence;
}
/** One accepted normalized owner/slot binding interval. Ending metadata is
 * present only after its ending event belongs to the applied prefix. */
export interface SceneReferenceBinding {
    readonly id: string;
    readonly referenceId: ReferenceId;
    readonly sourceId: EntityId;
    readonly sourceSlotId: SlotId;
    readonly targetId: ObjectId;
    readonly role: SceneReference['role'];
    readonly introducedSeq: number;
    readonly introducedEventId: EventId;
    readonly endSeq: number | null;
    readonly endEventId: EventId | null;
    readonly endKind: 'overwritten' | 'null' | 'unavailable' | 'retired' | null;
}
export interface SceneCallLink {
    id: string;
    callerId: FrameId;
    calleeId: FrameId;
    callSeq: number;
}
export interface SceneReturnFlow {
    id: string; // source ExecutionGraph return-value edge ID
    frameId: FrameId;
    destination: {
        entityId: EntityId;
        slotId: SlotId;
    };
    value: ValueText;
    operands: string | null;
    returnSeq: number;
}
export interface SceneExceptionPath {
    exceptionId: ObjectId | null;
    className: string;
    simpleName: string;
    message: string | null;
    throwFrameId: FrameId | null;
    unwound: readonly FrameId[];
    catchFrameId: FrameId | null;
    uncaught: boolean;
    causes: readonly ObjectId[];
    complete: boolean;
    throwLine: SourceLocation | null;
    stack: readonly string[]; // captured only, possibly empty
    causeEvidence: Evidence;
    stackEvidence: Evidence;
    evidence: Evidence;
}
export interface SceneIo {
    evidence: Evidence;
    id: 'stdin' | 'stdout' | 'stderr';
    lines: number;
    preview: string;
    consumedText: string | null;
    anchor: WorldAnchor;
}
export interface SceneModel {
    revision: number; // increments per projection
    recordingId: string;
    cursor: number;
    liveHead: number;
    entities: Readonly<Record<EntityId, SceneEntity>>;
    order: {
        frames: readonly FrameId[];
        objects: readonly ObjectId[];
        classes: readonly string[];
    };
    references: readonly SceneReference[];
    historicalBindings: readonly SceneReferenceBinding[]; // immutable closed prefix, never future endings
    callLinks: readonly SceneCallLink[];
    returnFlows: readonly SceneReturnFlow[]; // canonical candidates; planner applies mandatory overflow
    exception: SceneExceptionPath | null;
    io: readonly SceneIo[];
    cursorEvent: {
        id: EventId;
        seq: number;
        summary: string;
        subjects: readonly EntityId[];
        /** Exact captured storage for current face admission; not provenance. */
        storageIds: readonly SlotId[];
    } | null;
    liveStack: readonly FrameId[]; // outermost → innermost
    recording: RecordingStatus;
}
export interface WorldBounds {
    center: Vec3;
    size: Vec3;
}
export type ClusterKeyKind = 'class' | 'type' | 'package' | 'ownership' | 'collection' | 'invocation-branch' | 'execution-age';
export interface ClusterKey {
    kind: ClusterKeyKind;
    value: string;
}
export interface PlacementInfo {
    firstSeq: number;
    clusterPath: readonly ClusterKey[];
    frameRows?: number;
    callerId?: string | null;
    method?: {
        owner: string;
        name: string;
        parameterTypes: readonly string[] | null;
        descriptors?: readonly {seq:number;owner:string;name:string;descriptor:string}[];
    };
    /** Recorded structural relationships. Intervals use normalized ordinals,
     * not raw recorder sequence or an inferred allocation-time caller. */
    clusterMemberships?: readonly ClusterMembership[];
    ownershipHistory?: readonly { seq:number;value:Ownership }[];
}
export interface ClusterMembership {
    key: ClusterKey;
    fromSeq: number;
    untilSeq: number | null;
}
export interface LayoutState {
    anchors: Readonly<Record<EntityId, WorldAnchor>>;
    placement: Readonly<Record<EntityId, PlacementInfo>>;
    regions: {
        stack: WorldBounds | null;
        heap: WorldBounds | null;
        library: WorldBounds | null;
        classState: WorldBounds | null;
        io: WorldBounds | null;
    };
    bounds: WorldBounds | null;
    headings: {
        stack: Vec3;
        heap: Vec3;
        classState: Vec3 | null;
        returns: Vec3;
    };
}
export type TraceScope = 'relevant' | 'current' | 'all';
export type MaterialRole = 'stack' | 'heap' | 'class' | 'reference' | 'call' | 'return' | 'exception' | 'mutation' | 'stdout' | 'stderr' | 'stdin';
export interface PresentedEntity {
    id: EntityId;
    mode: 'detailed' | 'quiet';
    detail: DetailLevel;
    opacity: number;
    pinned: boolean;
    pickable: boolean;
    highlight: 'selected' | 'focus' | 'current' | 'mutation' | 'exception' | 'static-change' | null;
    /** Actual captured frame storage requested by selection/current evidence.
     * Presentation slots may change; canonical storage IDs/anchors never do. */
    rowSlotIds?: readonly SlotId[];
}
export interface PresentedCluster {
    id: string;
    key: ClusterKey;
    label: string;
    members: number;
    memberIds: readonly EntityId[]; // exact current residual cut; excludes detailed/quiet entities
    selected: boolean;
    anchor: WorldAnchor;
    opacity: number;
    pickable: boolean;
}
export interface PresentedCurve {
    id: string;
    kind: 'connector' | 'call' | 'flow' | 'return' | 'exception' | 'binding-history';
    points: readonly Vec3[];
    sourceAnchor?: WorldAnchor; // proven presented endpoint geometry, including virtualized cells
    destinationAnchor?: WorldAnchor;
    colorRole: MaterialRole;
    opacity: number;
    widthPx: 2.5 | 3.5;
    arrow: boolean;
    label?: string;
}
interface PresentedBundleBase {
    id: string;
    from: string;
    to: string;
    count: number;
    points: readonly Vec3[];
    colorRole: MaterialRole;
    opacity: number;
    widthPx: 2.5 | 3.5;
    arrow: boolean;
}
export type PresentedBundle = PresentedBundleBase & (
    | { kind: 'connector' | 'binding-history'; referenceIds: readonly ReferenceId[] } // slot bindings, never graph flow IDs
    | { kind: 'flow'; referenceIds?: never; flowIds:readonly string[] }
);
export interface FlowPresentation {
    counts: { recorded: number; drawable: number; individual: number; bundled: number; bundleCurves: number; unavailable: number; scopeExcluded: number };
    individualIds: readonly string[];
    unavailable: readonly { id:string; reason:string }[];
    scopeExcluded: readonly string[];
}
export interface ReferencePresentation {
    counts: { current: number; drawable: number; individual: number; bundled: number; bundleCurves: number; unavailable: number; internal: number; scopeExcluded: number };
    unavailable: readonly { id: ReferenceId; reason: string }[];
    internal: readonly { id: ReferenceId; clusterId: string }[];
    scopeExcluded: readonly ReferenceId[];
}
export interface HistoricalReferencePresentation extends Omit<ReferencePresentation, 'counts'> {
    counts: Omit<ReferencePresentation['counts'], 'current'> & { recorded: number; eligible: number; lifetimeExcluded: number };
    lifetimeExcluded: readonly { id: string; endKind: SceneReferenceBinding['endKind'] }[];
}
export type ArrayIndexReason = 'requested' | 'selected' | 'focused' | 'current';
export interface ArrayWindowSlot {
  index: number
  presentedSlot: number
  anchor: WorldAnchor
  port: Vec3
}
export interface ArrayEllipsis { afterIndex: number; hidden: number }
export interface ArrayWindow {
  recordingId: string
  arrayId: ObjectId
  recordedLength: number
  windowRevision: number
  visible: readonly number[]
  mapping: ReadonlyMap<SlotId, ArrayWindowSlot>
  /** Complete accounting metadata, including summaries without display budget. */
  ellipses: readonly ArrayEllipsis[]
  /** Budgeted structural indicators only: never semantic cells or curve endpoints. */
  presentedEllipses: readonly ArrayEllipsis[]
  hiddenCount: number
  columns: number
  reservedRows: number
  presentedRows: number
  rowOverflow: number
  virtualized: boolean
  budgetOverflow: {
    nominal: number
    actual: number
    mandatoryCount: number
    overflow: number
    optionalCapacity: number
    mandatoryIds: readonly SlotId[]
    reasons: ReadonlyMap<SlotId, readonly ArrayIndexReason[]>
  }
}
export interface ArrayWindowPick {
  recordingId: string
  arrayId: ObjectId
  windowRevision: number
  index: number
  slotId: SlotId
  presentedSlot: number
}

export interface HomeGroups {
    ids: readonly EntityId[];
    headings: readonly Vec3[];
}
export interface FocusSet {
    targetId: EntityId;
    neighbours: readonly EntityId[];
}
export interface PresentationPlan {
    revision: number;
    sceneRevision: number;
    detailLevel: DetailLevel;
    budgetOverflow: readonly {
        category: string;
        nominal: number;
        actual: number;
        mandatoryIds: readonly string[];
        reasons: readonly string[];
    }[];
    entities: ReadonlyMap<EntityId, PresentedEntity>;
    clusters: readonly PresentedCluster[];
    curves: readonly PresentedCurve[];
    bundles: readonly PresentedBundle[];
    referencePresentation: ReferencePresentation;
    historicalReferencePresentation: HistoricalReferencePresentation;
    flowPresentation: FlowPresentation;
    cellWindows: ReadonlyMap<ObjectId, ArrayWindow>;
    headings: readonly {
        id: 'STACK' | 'HEAP' | 'CLASS STATE' | 'RETURNS';
        position: Vec3;
        opacity: number;
    }[];
    structural: readonly {
        id: string;
        text: string;
        position: Vec3;
    }[];
    exceptionPanel: {
        position: Vec3;
        content: SceneExceptionPath;
    } | null;
    io: readonly {
        id: SceneIo['id'];
        opacity: number;
    }[];
    pinned: ReadonlySet<EntityId>;
    accounting: {
        detailed: number;
        quiet: number;
        clustered: number;
        total: number;
    };
    framing: {
        hero: readonly Vec3[];
        home: HomeGroups;
        focus: FocusSet | null;
    };
}
