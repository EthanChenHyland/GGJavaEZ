import { PerspectiveCamera, Vector3 } from 'three';
import type { Vec3, WorldAnchor } from '../contracts/world';
import type { Rect } from '../shell/shellLayout';
import { camera as tokens, detailLevel as bands, shell } from '../theme/tokens';
import type { DetailLevel, SceneModel } from '../contracts/world';
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
/** Leave visual breathing room inside the Shell's hard clipping boundary. */
export function compositionFrame(safe: Rect, viewport: Size): Rect {
    const inset = Math.min(safe.width, safe.height) * tokens.compositionInset;
    const right = viewport.width >= shell.viewport.standardW ? Math.max(inset, safe.width * tokens.wideRightInset) : inset;
    return { x: safe.x + inset, y: safe.y + inset, width: safe.width - inset - right, height: safe.height - 2 * inset };
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
    // Express the actual corners in the camera's orthonormal basis about the
    // fixed world centre. At depth d, safe-frame edges bound image-plane pan:
    // max(x + R*z) - R*d <= panX <= min(x + L*z) - L*d.
    // The two intervals first overlap at the closest possible fit. Solving them
    // directly avoids iterative pans and an arbitrary zoom-out margin.
    const yaw = radians(angles.yaw), pitch = radians(-angles.pitch);
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new Vector3(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch));
    const back = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const tangent = Math.tan(radians(tokens.fov / 2)), aspect = viewport.width / viewport.height;
    const left = (2 * safe.x / viewport.width - 1) * tangent * aspect;
    const rightEdge = (2 * (safe.x + safe.width) / viewport.width - 1) * tangent * aspect;
    const bottom = (1 - 2 * (safe.y + safe.height) / viewport.height) * tangent;
    const top = (1 - 2 * safe.y / viewport.height) * tangent;
    let xUpper = Infinity, xLower = -Infinity, yUpper = Infinity, yLower = -Infinity, nearest = -Infinity;
    const offset = new Vector3();
    for (const point of points) {
        offset.set(point[0] - center[0], point[1] - center[1], point[2] - center[2]);
        const x = offset.dot(right), y = offset.dot(up), z = offset.dot(back);
        xUpper = Math.min(xUpper, x + left * z);
        xLower = Math.max(xLower, x + rightEdge * z);
        yUpper = Math.min(yUpper, y + bottom * z);
        yLower = Math.max(yLower, y + top * z);
        nearest = Math.max(nearest, z + .01);
    }
    // A numerical guard, not a perceptible composition margin. It keeps exact
    // boundary points inside after the world-to-camera matrix round trip.
    const closest = Math.max(tokens.minDistance, nearest, (xLower - xUpper) / (rightEdge - left), (yLower - yUpper) / (top - bottom));
    const distance = closest + Math.max(1, closest) * 1e-10;
    const panX = (xLower + xUpper - (rightEdge + left) * distance) / 2;
    const panY = (yLower + yUpper - (top + bottom) * distance) / 2;
    return {
        target: center.map((value, axis) => value + right.getComponent(axis) * panX + up.getComponent(axis) * panY) as unknown as Vec3,
        distance, yawDeg: angles.yaw, pitchDeg: angles.pitch,
    };
}
export function frontFace(anchor: WorldAnchor): Vec3[] {
    const [x, y, z] = anchor.position, [w, h, d] = anchor.size;
    return [[x - w / 2, y - h / 2, z + d / 2], [x + w / 2, y - h / 2, z + d / 2], [x - w / 2, y + h / 2, z + d / 2], [x + w / 2, y + h / 2, z + d / 2]];
}
export function representativeFaceHeight(scene: SceneModel, camera: PerspectiveCamera, viewport: Size): number | null {
    // Retain only the nearest canonical representatives. The active cut,
    // cluster silhouettes and optional labels cannot feed back into zoom.
    const candidates: {node: SceneModel['entities'][string]; distance: number}[] = [];
    const projected = new Vector3();
    for (const node of Object.values(scene.entities)) {
        projected.set(...node.anchor.position).project(camera);
        if (!(projected.z > -1 && projected.z < 1)) continue;
        const distance = Math.hypot(projected.x * viewport.width / 2, projected.y * viewport.height / 2);
        const index = candidates.findIndex(item => distance < item.distance || distance === item.distance && node.id.localeCompare(item.node.id) < 0);
        if (index >= 0) candidates.splice(index, 0, {node, distance});
        else if (candidates.length < bands.representatives) candidates.push({node, distance});
        if (candidates.length > bands.representatives) candidates.pop();
    }
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
