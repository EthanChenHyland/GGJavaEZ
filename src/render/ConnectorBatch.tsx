import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree,type ThreeEvent } from '@react-three/fiber';
import { Color, InstancedBufferAttribute, InstancedMesh, Object3D, Vector3 } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { PresentedBundle,PresentedCurve } from '../contracts/world';
import { connectorMaterial,roleColor } from './RuntimeMaterials';
import {instanceAlphaMaterial} from './instanceAlpha';
import {connectorPortMarkers,type ReferenceChipPort} from './referenceChipPorts';
import {canonicalConnectorRaycast,type ConnectorPickData} from './geometry/connectorRaycast';
const noReferencePorts:readonly ReferenceChipPort[]=[];
// Binding ownership wins shared paths; a residual Flow represents its grouped
// edges and must remain inspectable beside an identical individual Flow.
const pickPriority=(curve:PresentedCurve|PresentedBundle)=>curve.kind==='connector'||curve.kind==='binding-history'?0:'flowIds'in curve?1:2;
type Hover=(id:string|null,pointer?:readonly[number,number])=>void;
function Curves({ curves, halo, onSelect,onHover,order }: {
    curves: readonly (PresentedCurve|PresentedBundle)[];
    halo: boolean;
    onSelect(id: string): void;
    onHover?:Hover;
    order:ReadonlyMap<string,number>;
}) {
    const { size } = useThree();
    const widthPx=halo?2.5:curves[0].widthPx;
    const material=useMemo(()=>connectorMaterial(halo,widthPx),[halo,widthPx]);
    useEffect(()=>()=>material.dispose(),[material]);
    const data = useMemo(() => {
        const positions: number[] = [], colors: number[] = [], opacity: number[] = [], ids: string[] = [], color = new Color();
        for (const curve of curves) {
            // Quiet links retain their local halo. Only explicit selection and
            // strong semantic accents enter the wider HDR bloom on the core.
            const accent = curve.widthPx === 3.5 || curve.colorRole === 'exception' || curve.colorRole === 'mutation' || curve.colorRole === 'return';
            color.set(roleColor[curve.colorRole]).multiplyScalar(accent ? 1.1 : .98);
            for (let i = 1; i < curve.points.length; i++) {
                positions.push(...curve.points[i - 1], ...curve.points[i]);
                colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
                ids.push(curve.id); opacity.push(curve.opacity);
            }
        }
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(positions);
        geometry.setColors(colors);
        geometry.setAttribute('instanceCurveOpacity',new InstancedBufferAttribute(new Float32Array(opacity),1));
        const line = new LineSegments2(geometry, material);
        line.computeLineDistances();
        line.frustumCulled = false;
        line.userData.runtimeBloomRole = 'emitter';
        line.userData.runtimeConnectorPick={ids,order,halo} satisfies ConnectorPickData;
        line.raycast=canonicalConnectorRaycast;
        return { line, ids, geometry, material };
    }, [curves, material,order,halo]);
    useLayoutEffect(() => { data.material.resolution.set(size.width, size.height); }, [data, size.width, size.height]);
    useEffect(() => () => data.geometry.dispose(), [data]);
    return <primitive object={data.line} onPointerMove={halo&&onHover?(event:ThreeEvent<PointerEvent>)=>{
        const id=data.ids[event.faceIndex??-1];
        const obscured=event.intersections.some(hit=>hit.distance+1e-4<event.distance&&hit.object.userData.runtimeBloomRole==='protected');
        if(event.buttons||!id||obscured){onHover(null);return;}
        event.stopPropagation();onHover(id,[event.clientX,event.clientY]);
    }:undefined} onPointerOut={halo&&onHover?()=>onHover(null):undefined} onClick={halo ? undefined : (event: {
        faceIndex?: number | null;
        stopPropagation(): void;
    }) => { const id = data.ids[event.faceIndex ?? -1]; if (id) {
        event.stopPropagation();
        onSelect(id);
    } }}/>;
}
function Endpoints({ curves,hoverId,referencePorts }: {
    curves: readonly PresentedCurve[];
    hoverId?:string|null;
    referencePorts:readonly ReferenceChipPort[];
}) {
    const ref = useRef<InstancedMesh>(null);
    const material=useMemo(instanceAlphaMaterial,[]);
    const markers=useMemo(()=>connectorPortMarkers(curves,referencePorts,hoverId),[curves,referencePorts,hoverId]);
    const alpha=useMemo(()=>new InstancedBufferAttribute(new Float32Array(markers.map(marker=>marker.opacity)),1),[markers]);
    useEffect(()=>()=>material.dispose(),[material]);
    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh)
            return;
        const transform = new Object3D(), color = new Color();
        markers.forEach((marker,index) => { color.set(roleColor[marker.colorRole]).multiplyScalar(marker.hovered?1.65:1.1);
            transform.scale.setScalar(marker.hovered?1.5:1);
            transform.position.set(...marker.point);
            transform.updateMatrix();
            mesh.setMatrixAt(index, transform.matrix);
            mesh.setColorAt(index, color);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [markers]);
    return <instancedMesh userData={{runtimeBloomRole:'emitter',runtimeConnectorPorts:true,runtimeReferenceChipPortCount:referencePorts.length}} ref={ref} material={material} args={[undefined, undefined, markers.length]} raycast={() => undefined}><sphereGeometry args={[.08, 8, 6]}><primitive object={alpha} attach="attributes-runtimeAlpha"/></sphereGeometry></instancedMesh>;
}
function Arrows({ curves }: {
    curves: readonly PresentedCurve[];
}) {
    const ref = useRef<InstancedMesh>(null), items = curves.filter(c => c.arrow);
    const material=useMemo(instanceAlphaMaterial,[]);
    const alpha=useMemo(()=>new InstancedBufferAttribute(new Float32Array(items.map(curve=>curve.opacity)),1),[curves]);
    useEffect(()=>()=>material.dispose(),[material]);
    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh)
            return;
        const transform = new Object3D(), up = new Vector3(0, 1, 0), color = new Color();
        items.forEach((curve, index) => { const to = new Vector3(...curve.points.at(-1)!), direction = to.clone().sub(new Vector3(...curve.points.at(-2)!)).normalize(); transform.position.copy(to).addScaledVector(direction, -.12); transform.quaternion.setFromUnitVectors(up, direction); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index, color.set(roleColor[curve.colorRole]).multiplyScalar(1.1)); });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [items]);
    if (!items.length)
        return null;
    return <instancedMesh userData={{runtimeBloomRole:'emitter'}} ref={ref} material={material} args={[undefined, undefined, items.length]} raycast={() => undefined}><coneGeometry args={[.08, .24, 6]}><primitive object={alpha} attach="attributes-runtimeAlpha"/></coneGeometry></instancedMesh>;
}
/** Pixel-width cores and halos are merged by three bounded emphasis bands. */
export function ConnectorBatch({ curves, onSelect,onHover,hoverId,referencePorts=noReferencePorts }: {
    curves: readonly (PresentedCurve|PresentedBundle)[];
    onSelect(id: string): void;
    onHover?:Hover;
    hoverId?:string|null;
    referencePorts?:readonly ReferenceChipPort[];
}) {
    const order=useMemo(()=>new Map([...curves].sort((a,b)=>pickPriority(a)-pickPriority(b)).map((curve,index)=>[curve.id,index])),[curves]);
    const bands = useMemo(() => {
        const groups = new Map<string, PresentedCurve[]>();
        for (const curve of curves) {
            const key = `${curve.widthPx}`, group = groups.get(key) ?? [];
            group.push(curve);
            groups.set(key, group);
        }
        return [...groups];
    }, [curves]);
    return <>{curves.length > 0 && <Curves curves={curves} order={order} halo onSelect={onSelect} onHover={onHover}/>} {bands.map(([key, group]) => <Curves key={key} curves={group} order={order} halo={false} onSelect={onSelect}/>)}{(curves.length>0||referencePorts.length>0)&&<Endpoints curves={curves} hoverId={hoverId} referencePorts={referencePorts}/>} {curves.length>0&&<Arrows curves={curves}/>}</>;
}
