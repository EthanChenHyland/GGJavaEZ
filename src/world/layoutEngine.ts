import { createOccupancy } from './occupancy';
import type { TraceEvent, RuntimeSlot } from '../contracts/runtime';
import { arrayElementSlotId } from '../contracts/runtime';
import type { LayoutState, WorldAnchor, WorldBounds, Vec3, PlacementInfo, Region } from '../contracts/worldV2';
import { world as worldLayoutTokens } from '../theme/tokens';
import { persistentPut, persistentRecord } from '../runtime/storage';
export type { LayoutState } from '../contracts/worldV2';
export type WorldLayoutTokens = typeof worldLayoutTokens;
export interface LayoutEngine {
    readonly length: number;
    append(events: readonly TraceEvent[], from?: number): void;
    readonly state: LayoutState;
}
function boundsOf(anchors: readonly WorldAnchor[]): WorldBounds | null {
    if (!anchors.length)
        return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const anchor of anchors)
        for (let i = 0; i < 3; i++) {
            lo[i] = Math.min(lo[i], anchor.position[i] - anchor.size[i] / 2);
            hi[i] = Math.max(hi[i], anchor.position[i] + anchor.size[i] / 2);
        }
    return { center: lo.map((v, i) => (v + hi[i]) / 2) as unknown as Vec3, size: lo.map((v, i) => hi[i] - v) as unknown as Vec3 };
}
/** Call-tree and first-observation geography. It never reads a cursor, camera or mutable value. */
export function createLayoutEngine(t: WorldLayoutTokens = worldLayoutTokens): LayoutEngine {
    let length = 0, anchors: Record<string, WorldAnchor> = persistentRecord({}), placement: Record<string, PlacementInfo> = persistentRecord({});
    let snapshot: LayoutState | null = null;
    const stack: WorldAnchor[] = [], heap: WorldAnchor[] = [], library: WorldAnchor[] = [], classes: WorldAnchor[] = [], io: WorldAnchor[] = [];
    const columns = new Map<string, {
        left: number;
        width: number;
        height: number;
        next: number;
    }>();
    const libraryColumns = new Map<string, {
        x: number;
        next: number;
    }>();
    const stackOccupancy = createOccupancy(), heapOccupancy = createOccupancy();
    const regionBounds: Record<Region, WorldBounds | null> = { stack: null, heap: null, library: null, class: null, io: null };
    const lastChild = new Map<string, WorldAnchor>();
    const rows = new Map<string, string[]>();
    const recordedSlots = new Map<string, Map<string, RuntimeSlot>>();
    let nextLeft = t.frame.w / 2 + t.regions.stackHeapGap, root: WorldAnchor | null = null;
    const add = (anchor: WorldAnchor, firstSeq: number, type: string, packageName: string, ownership: string, capacity?: number) => {
        anchors = persistentPut(anchors, anchor.entityId, anchor);
        placement = persistentPut(placement, anchor.entityId, { firstSeq, clusterPath: [{ kind: 'type', value: type }, { kind: 'package', value: packageName }, { kind: 'ownership', value: ownership }], ...(capacity === undefined ? {} : { frameRows: capacity }) });
        const prior = regionBounds[anchor.region];
        const boxes = prior ? [{ ...anchor, position: prior.center, size: prior.size }, anchor] : [anchor];
        regionBounds[anchor.region] = boundsOf(boxes);
        if (anchor.region === 'stack') {
            stack.push(anchor);
            stackOccupancy.add(anchor);
        }
        else if (anchor.region === 'heap') {
            heap.push(anchor);
            heapOccupancy.add(anchor);
        }
        else if (anchor.region === 'library')
            library.push(anchor);
        else if (anchor.region === 'class')
            classes.push(anchor);
        else
            io.push(anchor);
    };
    const ports = (anchor: WorldAnchor, slots: readonly RuntimeSlot[], capacity: number, header: number, pitch: number) => {
        const names = rows.get(anchor.entityId) ?? [], details = recordedSlots.get(anchor.entityId) ?? new Map<string,RuntimeSlot>();
        for(const slot of slots)details.set(slot.id, slot); recordedSlots.set(anchor.entityId, details);
        for (const slot of slots)
            if (!names.includes(slot.id))
                names.push(slot.id);
        rows.set(anchor.entityId, names);
        const next = { ...anchor.ports };
        let groupOffset=0,previousGroup:string|undefined;
        for (let i = 0; i < Math.min(capacity, names.length); i++) {
            const group=details.get(names[i])?.declaringClass;
            if(anchor.region==='heap'&&group&&group!==previousGroup){groupOffset+=.6;previousGroup=group}
            if(next[names[i]])continue;
            const rowY=anchor.position[1]+anchor.size[1]/2-header-groupOffset-pitch*(i+.5);
            if(rowY<anchor.position[1]-anchor.size[1]/2+.2)continue;
            next[names[i]] = [anchor.position[0] + anchor.size[0] / 2, anchor.position[1] + anchor.size[1] / 2 - header - groupOffset - pitch * (i + .5), anchor.position[2] + anchor.size[2] / 2 + .06];
        }
        // Slots only gain recorded attachment ports; body identity and extent stay fixed.
        anchors = persistentPut(anchors, anchor.entityId, { ...anchor, ports: next });
    };
    const object = (event: Extract<TraceEvent, {
        type: 'ALLOCATE_OBJECT' | 'ALLOCATE_ARRAY';
    }>) => {
        if (anchors[event.objectId])
            return;
        const isArray = event.type === 'ALLOCATE_ARRAY';
        const className = isArray ? `${event.elementType}[]` : event.className;
        const count = isArray ? event.length ?? event.elements.length : event.fields.length;
        const groups = isArray ? 0 : new Set(event.fields.map(slot => slot.declaringClass).filter(Boolean)).size;
        const cols = Math.max(t.array.cellsPerRowMin, Math.min(t.array.cellsPerRowMax, count));
        const cellRows = count > 128 ? 8 : Math.ceil(count / cols);
        const size: Vec3 = isArray ? [Math.max(t.object.w, cols * (t.array.cell + t.array.gap) - t.array.gap), t.array.titlePlate + (cellRows ? cellRows * (t.array.cell + t.array.gap) + t.array.indexLabel : .45), t.array.cell + t.array.backplate]
            : [t.object.w, t.object.header + t.object.pad + t.object.row * Math.min(count, 13) + .6 * groups, t.object.depth];
        const projectData = event.metadata?.ownership === 'PROJECT' || isArray && !!event.source || (className === 'java.lang.String' || className === 'String') && !!event.source;
        const region: Region = projectData ? 'heap' : 'library';
        let position: Vec3, realSize = size;
        if (region === 'library') {
            let column = libraryColumns.get(className);
            if (!column) {
                column = { x: t.frame.w / 2 + t.regions.stackHeapGap + t.object.libraryW / 2 + libraryColumns.size * (t.object.libraryW + 1.2), next: 0 };
                libraryColumns.set(className, column);
            }
            const slot = column.next++, front = -t.object.depth / 2 - t.regions.libraryGapZ - Math.floor(slot / 4) * 2.4;
            realSize = [t.object.libraryW, 2.4, 1.6];
            position = [column.x, t.regions.heapTopY - (slot % 4) * 3.2 - realSize[1] / 2, front - realSize[2] / 2];
        }
        else {
            let column = columns.get(className);
            if (!column) {
                column = { left: nextLeft, width: size[0], height: size[1], next: 0 };
                columns.set(className, column);
                nextLeft += size[0] + t.object.columnGap;
            }
            let candidate: WorldAnchor;
            do {
                const slot = column.next++;
                position = [column.left + size[0] / 2, t.regions.heapTopY - (slot % t.object.tiers) * (column.height + t.object.tierGap) - size[1] / 2, Math.floor(slot / t.object.tiers) * t.object.pageStepZ];
                candidate = { entityId: event.objectId, region, position, size, ports: {}, bodyPort: [position[0] - size[0] / 2, position[1], position[2] + size[2] / 2] };
            } while (heapOccupancy.intersects(candidate));
        }
        const anchor: WorldAnchor = { entityId: event.objectId, region, position: position!, size: realSize, ports: {}, bodyPort: [position![0] - realSize[0] / 2, position![1], position![2] + realSize[2] / 2] };
        add(anchor, event.seq, className, event.metadata?.packageName ?? className.slice(0, Math.max(0, className.lastIndexOf('.'))), region === 'heap' ? 'PROJECT' : 'LIBRARY', Math.min(count, 13));
        if (!isArray)
            ports(anchor,event.fields,region==='library'?2:Math.min(count,13),region==='library'?.7:t.object.header,region==='library'?.55:t.object.row);
        else if (count <= 128) {
            const cellPorts: Record<string, Vec3> = {};
            for (let index = 0; index < count; index++) {
                const cellId = arrayElementSlotId(event.objectId, index), x = position![0] - realSize[0] / 2 + t.array.cell / 2 + (index % cols) * (t.array.cell + t.array.gap), y = position![1] + realSize[1] / 2 - t.array.titlePlate - t.array.cell / 2 - Math.floor(index / cols) * (t.array.cell + t.array.gap), z = position![2] + realSize[2] / 2 - t.array.cell / 2;
                const port: Vec3 = [x, y, z + t.array.cell / 2];
                cellPorts[cellId] = port;
                anchors = persistentPut(anchors, cellId, { entityId: cellId, region, position: [x, y, z], size: [t.array.cell, t.array.cell, t.array.cell], ports: {}, bodyPort: port });
            }
            anchors = persistentPut(anchors, event.objectId, { ...anchor, ports: cellPorts });
        }
    };
    return {
        get length() { return length; },
        append(events, from = length) {
            if (from !== length)
                throw new Error(`Layout append expected ${length}, received ${from}`);
            if (events.length < length)
                throw new Error('Layout cannot discard accepted events');
            for (let i = from; i < events.length; i++) {
                const event = events[i];
                if (event.type === 'ENTER_METHOD' && !anchors[event.frameId]) {
                    const capacity = Math.max(t.frame.rowsMin, Math.min(t.frame.rowsMax, event.locals.filter(slot => slot.role === 'parameter' || slot.name === 'this').length + t.frame.rowAllowance));
                    const size: Vec3 = [t.frame.w, t.frame.header + t.frame.pad + t.frame.row * capacity, t.frame.depth], parent = event.callerFrameId ? anchors[event.callerFrameId] : null, sibling = lastChild.get(event.callerFrameId ?? 'root');
                    const top = sibling ? sibling.position[1] + sibling.size[1] / 2 : parent ? parent.position[1] - parent.size[1] / 2 - t.frame.stackGap : 0;
                    let front = sibling ? sibling.position[2] + sibling.size[2] / 2 + t.frame.depth + t.frame.deckGapZ : parent ? parent.position[2] + parent.size[2] / 2 - t.frame.depthStepZ : t.frame.depth / 2;
                    let anchor: WorldAnchor;
                    for (;;) {
                        const position: Vec3 = [0, top - size[1] / 2, front - size[2] / 2];
                        anchor = { entityId: event.frameId, region: 'stack', position, size, ports: {}, bodyPort: [-size[0] / 2, top - .5, front] };
                        if (!stackOccupancy.intersects(anchor))
                            break;
                        front += t.frame.depth + t.frame.deckGapZ;
                    }
                    add(anchor, event.seq, event.className, event.className.slice(0, event.className.lastIndexOf('.')), 'PROJECT', capacity);
                    lastChild.set(event.callerFrameId ?? 'root', anchor);
                    root ??= anchor;
                    ports(anchor, event.locals, capacity, t.frame.header, t.frame.row);
                }
                else if (event.type === 'DECLARE_LOCAL') {
                    const anchor = anchors[event.frameId];
                    if (anchor)
                        ports(anchor, [event.slot], placement[event.frameId].frameRows ?? 0, t.frame.header, t.frame.row);
                }
                else if (event.type === 'ALLOCATE_OBJECT' || event.type === 'ALLOCATE_ARRAY')
                    object(event);
                else if (event.type === 'OBJECT_OBSERVE' && event.fields && anchors[event.objectId]) {
                    const anchor=anchors[event.objectId];ports(anchor,event.fields,anchor.region==='library'?2:Math.max(0,Math.floor((anchor.size[1]-t.object.header-t.object.pad)/t.object.row)),anchor.region==='library'?.7:t.object.header,anchor.region==='library'?.55:t.object.row);
                }
                else if (event.type === 'CLASS_OBSERVE' && !anchors[event.classId]) {
                    const capacity = Math.min(event.fields.length, t.classShelf.rowsMax) + 1, height = t.classShelf.header + t.frame.pad + t.classShelf.row * capacity;
                    const position: Vec3 = [-t.frame.w / 2 + classes.length * t.classShelf.pitchX + t.classShelf.w / 2, 2.175 + height / 2, -2];
                    const anchor: WorldAnchor = { entityId: event.classId, region: 'class', position, size: [t.classShelf.w, height, t.classShelf.depth], ports: {}, bodyPort: [position[0], position[1], position[2] + t.classShelf.depth / 2] };
                    add(anchor, event.seq, event.className, event.metadata?.packageName ?? '', 'PROJECT', capacity);
                    ports(anchor, event.fields, capacity, t.classShelf.header, t.classShelf.row);
                }
                const channel = event.type === 'CONSOLE_WRITE' ? event.channel : event.type === 'OUTPUT_WRITE' ? 'stdout' : event.type === 'CONSOLE_INPUT' || event.type === 'INPUT_READ' ? 'stdin' : null;
                if (channel && !anchors[channel]) {
                    const index = ['stdin', 'stdout', 'stderr'].indexOf(channel), position: Vec3 = [t.io.x, t.io.y[index], t.io.z];
                    add({ entityId: channel, region: 'io', position, size: t.io.size as unknown as Vec3, ports: {}, bodyPort: [position[0], position[1], position[2] + t.io.size[2] / 2] }, event.seq, channel, '', 'PROJECT');
                }
            }
            if (length !== events.length) {
                length = events.length;
                snapshot = null;
            }
        },
        get state() {
            if (snapshot)
                return snapshot;
            const regions = { stack: regionBounds.stack, heap: regionBounds.heap, library: regionBounds.library, classState: regionBounds.class, io: regionBounds.io };
            return snapshot = { anchors, placement, regions, bounds: boundsOf(Object.entries(regionBounds).flatMap(([region, bounds]) => bounds ? [{ entityId: region, region: region as Region, position: bounds.center, size: bounds.size, bodyPort: bounds.center, ports: {} }] : [])), headings: { stack: [0, .75, root?.position[2] ?? 0], heap: [5.8, .3, 0], classState: classes.length ? [classes[0].position[0], classes[0].position[1] + classes[0].size[1] / 2 + .7, -2] : null, returns: [2.95, -.5, 1] } };
        },
    };
}
