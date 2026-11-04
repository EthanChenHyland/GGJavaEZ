import { createOccupancy } from './occupancy';
import type { TraceEvent, RuntimeSlot } from '../contracts/runtime';
import { arrayElementSlotId } from '../contracts/runtime';
import type { LayoutState, WorldAnchor, WorldBounds, Vec3, PlacementInfo, Region, Ownership } from '../contracts/world';
import { world as worldLayoutTokens } from '../theme/tokens';
import { persistentAppend, persistentPut, persistentRecord } from '../runtime/storage';
import {ownershipObservation} from './recordedOwnership';
import {firstObjectPresentation,compactLibraryFace} from './firstObjectPresentation';
import {createClusterMembershipIndex} from './clusterMemberships';
export type { LayoutState } from '../contracts/world';
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
    const memberships=createClusterMembershipIndex();
    const stack: WorldAnchor[] = [], heap: WorldAnchor[] = [], library: WorldAnchor[] = [], classes: WorldAnchor[] = [], io: WorldAnchor[] = [];
    const columns = new Map<string, {
        left: number;
        width: number;
        height: number;
        next: number;
    }>();
    const libraryColumns = new Map<string, {
        x: number; width:number; height:number; depth:number;
        next: number;
    }>();
    let libraryExtraWidth=0;
    const stackOccupancy = createOccupancy(), heapOccupancy = createOccupancy(),libraryOccupancy=createOccupancy();
    const regionBounds: Record<Region, WorldBounds | null> = { stack: null, heap: null, library: null, class: null, io: null };
    const lastChild = new Map<string | null, WorldAnchor>();
    const rows = new Map<string, string[]>();
    // Geometry needs slot order and heap declaring-class labels, never values.
    const rowGroups = new Map<string, Map<string, string>>();
    let nextLeft = t.frame.w / 2 + t.regions.stackHeapGap, root: WorldAnchor | null = null;
    const add = (anchor: WorldAnchor, firstSeq: number, type: string, packageName: string, ownership: Ownership | undefined, capacity?: number) => {
        anchors = persistentPut(anchors, anchor.entityId, anchor);
        placement = persistentPut(placement, anchor.entityId, { firstSeq, clusterPath: [{ kind: 'class', value: type }, { kind: 'type', value: type }, { kind: 'package', value: packageName }, ...(ownership?[{kind:'ownership' as const,value:ownership}]:[]), {kind:'execution-age',value:String(Math.floor(firstSeq/4096))}], ...(capacity === undefined ? {} : { frameRows: capacity }), ...(memberships.history(anchor.entityId).length?{clusterMemberships:memberships.history(anchor.entityId)}:{}) });
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
        else if (anchor.region === 'library'){
            library.push(anchor);libraryOccupancy.add(anchor);
        }
        else if (anchor.region === 'class')
            classes.push(anchor);
        else
            io.push(anchor);
    };
    const ports = (anchor: WorldAnchor, slots: readonly RuntimeSlot[], capacity: number, header: number, pitch: number) => {
        const names = rows.get(anchor.entityId) ?? [];
        let groups=rowGroups.get(anchor.entityId);
        if(anchor.region==='heap'){
            for(const slot of slots){
                if(slot.declaringClass!==undefined){groups??=new Map();groups.set(slot.id,slot.declaringClass)}
                else groups?.delete(slot.id);
            }
            if(groups?.size)rowGroups.set(anchor.entityId,groups);
            else rowGroups.delete(anchor.entityId);
        }
        for (const slot of slots)
            if (!names.includes(slot.id))
                names.push(slot.id);
        if(names.length)rows.set(anchor.entityId, names);
        const next = { ...anchor.ports };
        let groupOffset=0,previousGroup:string|undefined;
        for (let i = 0; i < Math.min(capacity, names.length); i++) {
            const group=groups?.get(names[i]);
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
        const cols = Math.max(t.array.cellsPerRowMin, Math.min(t.array.cellsPerRowMax, count));
        const {size,projectData,kind}=firstObjectPresentation(event,t);
        const region: Region = projectData ? 'heap' : 'library';
        let position: Vec3, realSize = size;
        if (region === 'library') {
            // Arrays and known collection structures retain their typed volume;
            // only ordinary external objects use the compact library block.
            realSize=kind==='object'?[t.object.libraryW,2.4,1.6]:size;
            let column = libraryColumns.get(className);
            if (!column) {
                const ordinaryX=t.frame.w/2+t.regions.stackHeapGap+t.object.libraryW/2+libraryColumns.size*(t.object.libraryW+1.2);
                column = {x:ordinaryX+libraryExtraWidth+(realSize[0]-t.object.libraryW)/2,width:realSize[0],height:realSize[1],depth:realSize[2],next:0};
                libraryExtraWidth+=realSize[0]-t.object.libraryW;
                libraryColumns.set(className, column);
            }
            let candidate:WorldAnchor;
            do{
                const slot=column.next++,rowPitch=column.height===2.4?3.2:column.height+.8,deckStep=column.depth===1.6?2.4:column.depth+.8;
                const front=-t.object.depth/2-t.regions.libraryGapZ-Math.floor(slot/4)*deckStep;
                position=[column.x+(realSize[0]-column.width)/2,t.regions.heapTopY-(slot%4)*rowPitch-realSize[1]/2,front-realSize[2]/2];
                candidate={entityId:event.objectId,region,position,size:realSize,ports:{},bodyPort:position};
            }while(libraryOccupancy.intersects(candidate));
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
        add(anchor, event.seq, className, event.metadata?.packageName ?? className.slice(0, Math.max(0, className.lastIndexOf('.'))), event.metadata?.ownership, Math.min(count, 13));
        if (!isArray) {
            const compact=compactLibraryFace(anchor,t);
            ports(anchor,event.fields,compact?2:Math.min(count,13),compact?.7:t.object.header,compact?.55:t.object.row);
        }
        else if (isArray && count <= 128) {
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
                    const size: Vec3 = [t.frame.w, t.frame.header + t.frame.pad + t.frame.row * capacity, t.frame.depth], parent = event.callerFrameId ? anchors[event.callerFrameId] : null, sibling = lastChild.get(event.callerFrameId);
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
                    add(anchor, event.seq, event.className, event.className.slice(0, Math.max(0,event.className.lastIndexOf('.'))), undefined, capacity);
                    const parentInfo=event.callerFrameId?placement[event.callerFrameId]:undefined;
                    const branch=parentInfo?parentInfo.callerId?parentInfo.clusterPath.find(key=>key.kind==='invocation-branch')?.value:`${event.callerFrameId}/observed-descendants`:event.callerFrameId?`${event.callerFrameId}/unavailable-ancestor`:`${event.frameId}/observed-root`;
                    const parameterTypes=event.locals.length===0||event.locals.some(slot=>slot.role==='parameter')?event.locals.filter(slot=>slot.role==='parameter').map(slot=>slot.javaType):null;
                    placement=persistentPut(placement,event.frameId,{...placement[event.frameId],callerId:event.callerFrameId,method:{owner:event.className,name:event.methodName,parameterTypes},clusterPath:[...placement[event.frameId].clusterPath,{kind:'invocation-branch',value:branch??event.frameId}]});
                    lastChild.set(event.callerFrameId, anchor);
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
                else if (event.type === 'OBJECT_OBSERVE' && event.fields && anchors[event.objectId]&&!(event.library&&['LIST','SET','MAP','QUEUE','DEQUE'].includes(event.library.kind))) {
                    const anchor=anchors[event.objectId],compact=compactLibraryFace(anchor,t);ports(anchor,event.fields,compact?2:Math.max(0,Math.floor((anchor.size[1]-t.object.header-t.object.pad)/t.object.row)),compact?.7:t.object.header,compact?.55:t.object.row);
                }
                else if (event.type === 'CLASS_OBSERVE' && !anchors[event.classId]) {
                    const capacity = Math.min(event.fields.length, t.classShelf.rowsMax) + 1, height = t.classShelf.header + t.frame.pad + t.classShelf.row * capacity;
                    const position: Vec3 = [-t.frame.w / 2 + classes.length * t.classShelf.pitchX + t.classShelf.w / 2, 2.175 + height / 2, -2];
                    const anchor: WorldAnchor = { entityId: event.classId, region: 'class', position, size: [t.classShelf.w, height, t.classShelf.depth], ports: {}, bodyPort: [position[0], position[1], position[2] + t.classShelf.depth / 2] };
                    add(anchor, event.seq, event.className, event.metadata?.packageName ?? event.className.slice(0,Math.max(0,event.className.lastIndexOf('.'))), event.metadata?.ownership, capacity);
                    ports(anchor, event.fields, capacity, t.classShelf.header, t.classShelf.row);
                }
                const channel = event.type === 'CONSOLE_WRITE' ? event.channel : event.type === 'OUTPUT_WRITE' ? 'stdout' : event.type === 'CONSOLE_INPUT' || event.type === 'INPUT_READ' ? 'stdin' : null;
                if (channel && !anchors[channel]) {
                    const index = ['stdin', 'stdout', 'stderr'].indexOf(channel), position: Vec3 = [t.io.x, t.io.y[index], t.io.z];
                    add({ entityId: channel, region: 'io', position, size: t.io.size as unknown as Vec3, ports: {}, bodyPort: [position[0], position[1], position[2] + t.io.size[2] / 2] }, event.seq, channel, '', undefined);
                }
                const observation=ownershipObservation(event);
                if(observation&&placement[observation.id]){
                    const entry=placement[observation.id],history=(entry.ownershipHistory??[]) as {seq:number;value:Ownership}[];
                    if(history.at(-1)?.value!==observation.value)placement=persistentPut(placement,observation.id,{...entry,ownershipHistory:persistentAppend(history,{seq:observation.seq,value:observation.value})});
                }
                if(event.type==='EXECUTION_FACT'&&event.fact.kind==='enter'){
                    const entry=placement[event.fact.invocationId],method=entry?.method;
                    if(method&&method.descriptors?.at(-1)?.descriptor!==event.fact.method.descriptor){
                        const descriptors=(method.descriptors??[]) as {seq:number;owner:string;name:string;descriptor:string}[];
                        placement=persistentPut(placement,event.fact.invocationId,{...entry,method:{...method,descriptors:persistentAppend(descriptors,{seq:event.seq,...event.fact.method})}});
                    }
                }
                memberships.observe(event,placement,(id,entry)=>{placement=persistentPut(placement,id,entry)});
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
