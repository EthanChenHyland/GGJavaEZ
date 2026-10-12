import { useEffect, useLayoutEffect, useMemo, useRef,type RefObject } from 'react';
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Object3D, Color, Vector3 } from 'three';
import type { Intersection, Raycaster } from 'three';
import type { Selection } from '../contracts/interaction';
import type { PresentationPlan, SceneEntity, SceneModel, Vec3, WorldAnchor } from '../contracts/worldV2';
import { color, world } from '../theme/tokens';
import { glassMaterial, unitBox, roundedDepthMaterial, roundedDistanceMaterial } from './RuntimeMaterials';
import { expandRoundedBoxVertex, unitRoundedBox, unitRoundedOutline } from './geometry/roundedBox';
import { faceRows } from './faceModel';
import {collectionEntryFace} from '../world/collectionFace';
import { useQualityStore, type QualityTier } from './quality/qualityStore';
import { resolveArrayWindowPick, type ArrayWindowPick } from '../world/arrayWindow';
import { useCameraStore } from '../camera/cameraStore';
type Pick = NonNullable<Selection>;
interface SolidPress {pick:Pick;arrayPick?:ArrayWindowPick;recordingId:string}
interface Solid {
    anchor: WorldAnchor;
    pick: Pick;
    pickable: boolean;
    role: 'stack' | 'heap' | 'class' | 'face';
    opacity: number;
    tint: string;
    edge?: string;
    arrayPick?: ArrayWindowPick;
}
function entityPick(node: SceneEntity): Pick { return { kind: node.kind === 'frame' ? 'frame' : node.kind === 'class' ? 'class' : 'object', id: node.id }; }
export function buildSolidBatch(scene: SceneModel, plan: PresentationPlan): Solid[] {
    const solids: Solid[] = [];
    for (const [id, presented] of plan.entities) {
        const node = scene.entities[id], role = node.kind === 'frame' ? 'stack' : node.kind === 'class' ? 'class' : 'heap', palette = color[role];
        const [x, y, z] = node.anchor.position, [w, h, d] = node.anchor.size, top = y + h / 2, face = z + d / 2 + .025;
        const pick = entityPick(node), opacity = presented.opacity;
        const edge = presented.highlight === 'exception' ? color.semantic.exception : presented.highlight === 'mutation' ? color.semantic.mutation : presented.highlight ? color.semantic.execution : palette.edge;
        solids.push({ anchor: node.kind === 'array' ? { ...node.anchor, position: [x, top - .45, z], size: [w, .9, .12] } : node.anchor, pick, pickable: presented.pickable, role, opacity, tint: palette.core, edge });
        const plate = (slot: string, position: Vec3, size: Vec3, tint: string, plateOpacity = opacity, arrayPick?: ArrayWindowPick) => solids.push({ anchor: { ...node.anchor, entityId: slot, position, size, ports: {}, bodyPort: position }, pick: slot === id ? pick : { kind: 'slot', id: slot }, pickable: presented.pickable, role: 'face', opacity: plateOpacity, tint, arrayPick });
        if (presented.mode !== 'detailed')
            continue;
        if (node.kind !== 'array')
            plate(id, [x, y, face - .01], [w - .18, h - .18, .035], palette.face);
        if (node.kind === 'collection') {
            const { sizeRow } = world.collection;
            const header = world.object.header, bottom = y - h / 2 + world.object.pad;
            const sizeY = top - header - sizeRow / 2;
            if (presented.detail !== 'FAR' && sizeY - sizeRow * .36 >= bottom)
                plate(id, [x, sizeY, face + .01], [w - .45, sizeRow * .73, .05], color.heap.chip);
            const visible=new Set(faceRows(node,presented).visible.map(row=>row.slotId));
            for (const [index, entry] of node.entries.slice(0,world.collection.rows*world.collection.columns).entries()) {
                if(!visible.has(entry.slotId))continue;
                const geometry=collectionEntryFace(node.anchor,index,node.collectionKind==='Map');if(!geometry)continue;
                plate(entry.slotId,[geometry.value[0],geometry.value[1],face+.01],[geometry.valueWidth,geometry.height,.05],color.heap.chip);
                if(geometry.key&&entry.keySlotId)plate(entry.keySlotId,[geometry.key[0],geometry.key[1],face+.01],[geometry.valueWidth,geometry.height,.05],color.heap.chip);
            }
            continue;
        }
        const model = faceRows(node, presented);
        for (const [rowIndex, row] of model.visible.entries()) {
            const ry = node.anchor.ports[row.slotId]?.[1] ?? top - model.header - model.pitch * (rowIndex + .5);
            plate(row.slotId, [x, ry, face + .01], [w - .45, model.pitch * .73, .05], 'chip' in palette ? palette.chip : palette.face);
        }
        if (node.kind === 'array')
            for (const [id, cell] of plan.cellWindows.get(node.id)?.mapping ?? []) {
                const [cx, cy, cz] = cell.anchor.position;
                const window=plan.cellWindows.get(node.id)!;
                const arrayPick: ArrayWindowPick={recordingId:window.recordingId,arrayId:node.id,windowRevision:window.windowRevision,index:cell.index,slotId:id,presentedSlot:cell.presentedSlot};
                solids.push({ anchor: cell.anchor, pick: { kind: 'slot', id }, pickable: presented.pickable, role: 'heap', opacity, tint: color.heap.core, edge: node.activity?.index === cell.index ? node.activity.kind==='write'?color.semantic.mutation:color.semantic.execution : color.heap.edge, arrayPick });
                plate(id, [cx, cy, cz + .79], [1.4, 1.4, .025], color.heap.face, opacity, arrayPick);
            }
    }
    for (const cluster of plan.clusters) {
        const role=cluster.anchor.region==='stack'?'stack':cluster.anchor.region==='class'?'class':'heap',palette=color[role];
        const pick:Pick={kind:'cluster',id:cluster.id},[x,y,z]=cluster.anchor.position,[w,h,d]=cluster.anchor.size;
        solids.push({anchor:cluster.anchor,pick,pickable:cluster.pickable,role,opacity:cluster.opacity,tint:palette.core,edge:cluster.selected?color.semantic.execution:palette.edge});
        const position:Vec3=[x,y,z+d/2+.015];
        solids.push({anchor:{...cluster.anchor,entityId:`${cluster.id}:face`,position,size:[w-.18,h-.18,.035],ports:{},bodyPort:position},pick,pickable:cluster.pickable,role:'face',opacity:cluster.opacity,tint:palette.face});
    }
    return solids;
}
const noRaycast = () => undefined;
/** Preserve the canonical cuboid pick envelope; GPU bevels never remap a hit. */
function canonicalSolidRaycast(this: InstancedMesh, raycaster: Raycaster, intersects: Intersection[]) {
    const geometry = this.geometry;
    this.geometry = unitBox;
    try { InstancedMesh.prototype.raycast.call(this, raycaster, intersects); }
    finally { this.geometry = geometry; }
}
function Instances({ items, onSelect, onFocus, tier, plan, recordingId, cursor,press }: {
    items: Solid[];
    onSelect(selection: Pick): void;
    onFocus(selection: Pick): void;
    tier: QualityTier;
    plan: PresentationPlan;
    recordingId: string;
    cursor: number;
    press:RefObject<SolidPress|null>;
}) {
    const ref = useRef<InstancedMesh>(null), role = items[0].role, opacity = items[0].opacity;
    const validPress=(item:Solid|undefined)=>{
        const started=press.current;
        if(!item?.pickable||!started||started.recordingId!==recordingId||started.pick.kind!==item.pick.kind||started.pick.id!==item.pick.id)return false;
        if(!started.arrayPick)return true;
        const window=plan.cellWindows.get(started.arrayPick.arrayId);
        return !!window&&!!resolveArrayWindowPick(window,started.arrayPick);
    };
    const capacity = Math.max(32, 2 ** Math.ceil(Math.log2(items.length || 1)));
    // Instance buffers belong to this mesh, while geometry/materials are shared.
    useLayoutEffect(() => { const mesh=ref.current;return()=>mesh?.dispose(); }, [capacity]);
    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh)
            return;
        const transform = new Object3D(), tint = new Color();
        mesh.count = items.length;
        items.forEach((item, index) => { transform.position.set(...item.anchor.position); transform.scale.set(...item.anchor.size); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); if (role === 'face')
            mesh.setColorAt(index, tint.set(item.tint)); });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [items, role]);
    return <instancedMesh ref={ref} args={[undefined, undefined, capacity]} geometry={role === 'face' ? unitBox : unitRoundedBox} material={role === 'face' ? undefined : glassMaterial(role, opacity, tier)} userData={{runtimeBloomRole:'protected'}} customDepthMaterial={role === 'face' ? undefined : roundedDepthMaterial()} customDistanceMaterial={role === 'face' ? undefined : roundedDistanceMaterial()} dispose={null} castShadow={role !== 'face'} receiveShadow raycast={items.some(item => item.pickable) ? canonicalSolidRaycast : noRaycast} onPointerDown={event=>{const item=items[event.instanceId??-1];press.current=item?.pickable?{pick:item.pick,arrayPick:item.arrayPick,recordingId}:null;if(item?.pickable)event.stopPropagation()}} onClick={event => { const item = items[event.instanceId ?? -1]; if (validPress(item)) {
        event.stopPropagation();
        onSelect(item!.pick);
    } }} onDoubleClick={event => { const item = items[event.instanceId ?? -1]; if (validPress(item)) {
        event.stopPropagation();
        if(item!.pick.kind==='cluster')useCameraStore.getState().travelCluster(item!.pick.id,recordingId,cursor);
        else onFocus(item!.pick);
    } }}>
    {role === 'face' && <meshBasicMaterial color="white" transparent={opacity<1} opacity={opacity} depthWrite={opacity>=1} toneMapped={false}/>}
  </instancedMesh>;
}
function Edges({ items }: {
    items: Solid[];
}) {
    const geometry = useMemo(() => {
        const positions: number[] = [], colors: number[] = [], source = unitRoundedOutline.getAttribute('position'), normals = unitRoundedOutline.getAttribute('normal'), tint = new Color();
        const point = new Vector3(), normal = new Vector3(), expanded = new Vector3();
        for (const item of items) {
            tint.set(item.edge!).multiplyScalar(1.65);
            for (let i = 0; i < source.count; i++) {
                point.fromBufferAttribute(source, i); normal.fromBufferAttribute(normals, i);
                expandRoundedBoxVertex(point, normal, item.anchor.size, expanded);
                expanded.addScaledVector(normal,.008);
                positions.push(expanded.x + item.anchor.position[0], expanded.y + item.anchor.position[1], expanded.z + item.anchor.position[2]);
                colors.push(tint.r, tint.g, tint.b);
            }
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        return geometry;
    }, [items]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return <lineSegments geometry={geometry} userData={{runtimeBloomRole:'emitter'}} raycast={noRaycast}><lineBasicMaterial vertexColors transparent depthWrite={false} opacity={items[0].opacity} toneMapped={false}/></lineSegments>;
}
export function SolidBatch({ scene, plan, onSelect, onFocus }: {
    scene: SceneModel;
    plan: PresentationPlan;
    onSelect(selection: Pick): void;
    onFocus(selection: Pick): void;
}) {
    const tier = useQualityStore(state => state.active);
    // A face and body can resolve the same semantic pick in different draw
    // batches across click/double-click dispatch. Own the closest press once
    // for the complete solid surface, rather than losing it at a batch boundary.
    const press=useRef<SolidPress|null>(null);
    const batches = useMemo(() => {
        const groups = new Map<string, Solid[]>(), edges = new Map<number, Solid[]>();
        for (const item of buildSolidBatch(scene, plan)) {
            const key = `${item.role}:${item.opacity}`, group = groups.get(key) ?? [];
            group.push(item);
            groups.set(key, group);
            if (item.edge) {
                const group = edges.get(item.opacity) ?? [];
                group.push(item);
                edges.set(item.opacity, group);
            }
        }
        return { groups, edges };
    }, [scene, plan]);
    return <>{[...batches.groups].map(([key, items]) => <Instances key={key} items={items} tier={tier} plan={plan} recordingId={scene.recordingId} cursor={scene.cursor} press={press} onSelect={onSelect} onFocus={onFocus}/>)}{[...batches.edges].map(([key, items]) => <Edges key={key} items={items}/>)}</>;
}
