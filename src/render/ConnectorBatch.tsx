import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, InstancedBufferAttribute, InstancedMesh, Object3D, Vector3 } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { PresentedCurve } from '../contracts/worldV2';
import { roleColor } from './RuntimeMaterials';
import { curveAlphaShaders } from './curveAlpha';
function Curves({ curves, halo, onSelect }: {
    curves: readonly PresentedCurve[];
    halo: boolean;
    onSelect(id: string): void;
}) {
    const { size } = useThree();
    const data = useMemo(() => {
        const positions: number[] = [], colors: number[] = [], opacity: number[] = [], ids: string[] = [], color = new Color();
        for (const curve of curves) {
            color.set(roleColor[curve.colorRole]);
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
        const material = new LineMaterial({ vertexColors: true, linewidth: halo ? 8 : curves[0].widthPx, transparent: true, opacity: halo ? .14 : 1, depthTest: true, depthWrite: false });
        Object.assign(material,curveAlphaShaders(material.vertexShader,material.fragmentShader));
        material.toneMapped = false;
        const line = new LineSegments2(geometry, material);
        line.computeLineDistances();
        line.frustumCulled = false;
        return { line, ids, geometry, material };
    }, [curves, halo]);
    useLayoutEffect(() => { data.material.resolution.set(size.width, size.height); }, [data, size.width, size.height]);
    useEffect(() => () => { data.geometry.dispose(); data.material.dispose(); }, [data]);
    return <primitive object={data.line} onClick={halo ? undefined : (event: {
        faceIndex?: number | null;
        stopPropagation(): void;
    }) => { const id = data.ids[event.faceIndex ?? -1]; if (id) {
        event.stopPropagation();
        onSelect(id);
    } }}/>;
}
function Endpoints({ curves }: {
    curves: readonly PresentedCurve[];
}) {
    const ref = useRef<InstancedMesh>(null);
    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh)
            return;
        const transform = new Object3D(), color = new Color();
        curves.forEach((curve, index) => { color.set(roleColor[curve.colorRole]); for (const [side, point] of [curve.points[0], curve.points.at(-1)!].entries()) {
            transform.position.set(...point);
            transform.updateMatrix();
            mesh.setMatrixAt(index * 2 + side, transform.matrix);
            mesh.setColorAt(index * 2 + side, color);
        } });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [curves]);
    return <instancedMesh ref={ref} args={[undefined, undefined, curves.length * 2]} raycast={() => undefined}><sphereGeometry args={[.08, 8, 6]}/><meshBasicMaterial color="white" toneMapped={false}/></instancedMesh>;
}
function Arrows({ curves }: {
    curves: readonly PresentedCurve[];
}) {
    const ref = useRef<InstancedMesh>(null), items = curves.filter(c => c.arrow);
    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh)
            return;
        const transform = new Object3D(), up = new Vector3(0, 1, 0), color = new Color();
        items.forEach((curve, index) => { const to = new Vector3(...curve.points.at(-1)!), direction = to.clone().sub(new Vector3(...curve.points.at(-2)!)).normalize(); transform.position.copy(to).addScaledVector(direction, -.12); transform.quaternion.setFromUnitVectors(up, direction); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index, color.set(roleColor[curve.colorRole])); });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [items]);
    if (!items.length)
        return null;
    return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} raycast={() => undefined}><coneGeometry args={[.08, .24, 6]}/><meshBasicMaterial color="white" toneMapped={false}/></instancedMesh>;
}
/** Pixel-width cores and halos are merged by three bounded emphasis bands. */
export function ConnectorBatch({ curves, onSelect }: {
    curves: readonly PresentedCurve[];
    onSelect(id: string): void;
}) {
    const bands = useMemo(() => {
        const groups = new Map<string, PresentedCurve[]>();
        for (const curve of curves) {
            const key = `${curve.widthPx}`, group = groups.get(key) ?? [];
            group.push(curve);
            groups.set(key, group);
        }
        return [...groups];
    }, [curves]);
    return <>{curves.length > 0 && <Curves curves={curves} halo onSelect={onSelect}/>} {bands.map(([key, group]) => <Curves key={key} curves={group} halo={false} onSelect={onSelect}/>)}{curves.length > 0 && <><Endpoints curves={curves}/><Arrows curves={curves}/></>}</>;
}
