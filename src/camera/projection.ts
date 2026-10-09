import { PerspectiveCamera, Vector3 } from 'three';
import type { Vec3, WorldAnchor } from '../contracts/worldV2';
import type { Rect } from '../shell/shellLayout';
import { camera as tokens, detailLevel as bands } from '../theme/tokens';
import type { DetailLevel, SceneModel } from '../contracts/worldV2';
export interface OrbitPose {
    target: Vec3;
    distance: number;
    yawDeg: number;
    pitchDeg: number;
}
export interface Size {
    width: number;
    height: number;
}
const radians = (degrees: number) => degrees * Math.PI / 180;
export function cameraPosition(pose: OrbitPose): Vec3 {
    const yaw = radians(pose.yawDeg), pitch = radians(-pose.pitchDeg);
    return [pose.target[0] + Math.sin(yaw) * Math.cos(pitch) * pose.distance, pose.target[1] + Math.sin(pitch) * pose.distance, pose.target[2] + Math.cos(yaw) * Math.cos(pitch) * pose.distance];
}
export function projectionCamera(pose: OrbitPose, viewport: Size): PerspectiveCamera {
    const camera = new PerspectiveCamera(tokens.fov, viewport.width / viewport.height, .01, 100000);
    camera.position.set(...cameraPosition(pose));
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
}
export function screenPoint(point: Vec3, camera: PerspectiveCamera, viewport: Size) {
    const projected = new Vector3(...point).project(camera);
    return { x: (projected.x + 1) * viewport.width / 2, y: (1 - projected.y) * viewport.height / 2, z: projected.z };
}
export function fitToSafeFrame(points: readonly Vec3[], angles: {
    yaw: number;
    pitch: number;
}, safe: Rect, viewport: Size): OrbitPose {
    if (!points.length)
        return { target: [4, -2, 0], distance: 24, yawDeg: angles.yaw, pitchDeg: angles.pitch };
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const point of points)
        for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], point[i]);
            max[i] = Math.max(max[i], point[i]);
        }
    const center = min.map((v, i) => (v + max[i]) / 2) as unknown as Vec3;
    const poseAt = (distance: number) => {
        let pose: OrbitPose = { target: center, distance, yawDeg: angles.yaw, pitchDeg: angles.pitch };
        for (let refine = 0; refine < 2; refine++) {
            const camera = projectionCamera(pose, viewport), projected = points.map(p => screenPoint(p, camera, viewport));
            const x = (Math.min(...projected.map(p => p.x)) + Math.max(...projected.map(p => p.x))) / 2;
            const y = (Math.min(...projected.map(p => p.y)) + Math.max(...projected.map(p => p.y))) / 2;
            const pixel = 2 * distance * Math.tan(radians(tokens.fov / 2)) / viewport.height;
            const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
            const shift = right.multiplyScalar((x - safe.x - safe.width / 2) * pixel).add(up.multiplyScalar((safe.y + safe.height / 2 - y) * pixel));
            pose = { ...pose, target: pose.target.map((v, i) => v + shift.getComponent(i)) as unknown as Vec3 };
        }
        return pose;
    };
    const fits = (pose: OrbitPose) => {
        const camera = projectionCamera(pose, viewport);
        return points.every(point => { const p = screenPoint(point, camera, viewport); return p.z > -1 && p.z < 1 && p.x >= safe.x && p.x <= safe.x + safe.width && p.y >= safe.y && p.y <= safe.y + safe.height; });
    };
    let lo = tokens.minDistance, hi = Math.max(24, Math.hypot(...max.map((v, i) => v - min[i])) * 4);
    while (!fits(poseAt(hi)) && hi < 100000)
        hi *= 2;
    for (let iteration = 0; iteration < 36; iteration++) {
        const mid = (lo + hi) / 2;
        if (fits(poseAt(mid)))
            hi = mid;
        else
            lo = mid;
    }
    return poseAt(hi * 1.03);
}
export function frontFace(anchor: WorldAnchor): Vec3[] {
    const [x, y, z] = anchor.position, [w, h, d] = anchor.size;
    return [[x - w / 2, y - h / 2, z + d / 2], [x + w / 2, y - h / 2, z + d / 2], [x - w / 2, y + h / 2, z + d / 2], [x + w / 2, y + h / 2, z + d / 2]];
}
export function representativeFaceHeight(scene: SceneModel, camera: PerspectiveCamera, viewport: Size): number | null {
    const candidates = Object.values(scene.entities).map(node => ({ node, p: screenPoint(node.anchor.position, camera, viewport) }))
        .filter(item => item.p.z > -1 && item.p.z < 1)
        .sort((a, b) => Math.hypot(a.p.x - viewport.width / 2, a.p.y - viewport.height / 2) - Math.hypot(b.p.x - viewport.width / 2, b.p.y - viewport.height / 2) || a.node.id.localeCompare(b.node.id)).slice(0, bands.representatives);
    const heights = candidates.map(({ node }) => { const points = frontFace(node.anchor).map(p => screenPoint(p, camera, viewport)); return Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)); }).sort((a, b) => a - b);
    return heights.length ? heights[Math.floor(heights.length / 2)] : null;
}
export function nextDetailLevel(current: DetailLevel, height: number | null, viewportHeight: number): DetailLevel {
    if (height === null)
        return current;
    const ratio = height / viewportHeight;
    if (current === 'CLOSE')
        return ratio < bands.closeH * (1 - bands.hysteresis) ? ratio <= bands.farH ? 'FAR' : 'MEDIUM' : 'CLOSE';
    if (current === 'FAR')
        return ratio > bands.farH * (1 + bands.hysteresis) ? ratio >= bands.closeH ? 'CLOSE' : 'MEDIUM' : 'FAR';
    return ratio >= bands.closeH ? 'CLOSE' : ratio <= bands.farH ? 'FAR' : 'MEDIUM';
}
