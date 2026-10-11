import { Vector3 } from 'three';
import type { Vec3, WorldAnchor } from '../contracts/worldV2';
import type { Rect } from '../shell/shellLayout';
import { frontFace, projectionCamera, screenPoint, type OrbitPose, type Size } from './projection';

// Subpixel interior margins keep floating-point extrema within closed bounds.
const heightRange = [.38 + 1e-9, .52 - 1e-9] as const;
const widthRange = [.25 + 1e-9, .35 - 1e-9] as const;
const desiredHeight = .45;
const iterations = 40;
// Stay inside projection.ts's 100000 u far plane. All searches are bounded.
const maxDistance = 90000;

/** Requirement 19.5: height takes precedence over the preferred width band.
 * `safe` supplies the projected face centre, not a smaller width-fitting box.
 * If even the height-constrained face cannot fit `safe`, it remains at the
 * closest attainable width rather than silently violating the height range.
 * Degenerate geometry / an exhausted projection envelope returns a finite pose;
 * no pose can promise containment and the specified height for every aspect.
 */
export function focusFraming(
    anchor: WorldAnchor,
    angles: { yaw: number; pitch: number },
    safe: Rect,
    viewport: Size,
): OrbitPose {
    const fallback: OrbitPose = {
        target: anchor.position.every(Number.isFinite) ? [...anchor.position] : [0, 0, 0],
        distance: 24,
        yawDeg: Number.isFinite(angles.yaw) ? angles.yaw : 21,
        pitchDeg: Number.isFinite(angles.pitch) ? angles.pitch : -8,
    };
    if (![...anchor.position, ...anchor.size, safe.x, safe.y, safe.width, safe.height,
        viewport.width, viewport.height, angles.yaw, angles.pitch].every(Number.isFinite)
        || anchor.size.some(value => value <= 0) || safe.width <= 0 || safe.height <= 0
        || viewport.width <= 0 || viewport.height <= 0) return fallback;

    const points = frontFace(anchor);
    if (!points.every(point => point.every(Number.isFinite))) return fallback;
    const center: Vec3 = [anchor.position[0], anchor.position[1], anchor.position[2] + anchor.size[2] / 2];
    const basis = projectionCamera({ ...fallback, target: center }, viewport);
    const right = new Vector3().setFromMatrixColumn(basis.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(basis.matrixWorld, 1);
    const towardEye = new Vector3().setFromMatrixColumn(basis.matrixWorld, 2);
    const local = points.map(point => {
        const offset = new Vector3(...point).sub(new Vector3(...center));
        return { x: offset.dot(right), y: offset.dot(up), z: offset.dot(towardEye) };
    });
    const focalPixels = basis.projectionMatrix.elements[5] * viewport.height / 2;
    const desiredX = (safe.x + safe.width / 2 - viewport.width / 2) / focalPixels;
    const desiredY = (viewport.height / 2 - safe.y - safe.height / 2) / focalPixels;
    const minDistance = Math.max(.02, ...local.map(point => point.z + .02));
    if (!Number.isFinite(minDistance) || minDistance >= maxDistance) return fallback;

    // Right/up translation leaves orientation and each corner's depth intact.
    // The extrema's midpoint is continuous and strictly decreasing in shift;
    // corner-wise roots bracket it even when the extreme corner changes.
    const centerShift = (axis: 'x' | 'y', desired: number, distance: number): number => {
        const roots = local.map(point => point[axis] - desired * (distance - point.z));
        let lo = Math.min(...roots), hi = Math.max(...roots);
        for (let i = 0; i < iterations; i++) {
            const shift = (lo + hi) / 2;
            const coordinates = local.map(point => (point[axis] - shift) / (distance - point.z));
            if ((Math.min(...coordinates) + Math.max(...coordinates)) / 2 > desired) lo = shift;
            else hi = shift;
        }
        return (lo + hi) / 2;
    };
    const measure = (distance: number) => {
        const shift = right.clone().multiplyScalar(centerShift('x', desiredX, distance))
            .addScaledVector(up, centerShift('y', desiredY, distance));
        const pose: OrbitPose = {
            target: [center[0] + shift.x, center[1] + shift.y, center[2] + shift.z],
            distance, yawDeg: angles.yaw, pitchDeg: angles.pitch,
        };
        const camera = projectionCamera(pose, viewport);
        const projected = points.map(point => screenPoint(point, camera, viewport));
        return {
            pose,
            width: Math.max(...projected.map(point => point.x)) - Math.min(...projected.map(point => point.x)),
            height: Math.max(...projected.map(point => point.y)) - Math.min(...projected.map(point => point.y)),
        };
    };
    // At a fixed screen centre each candidate corner-pair span has a constant
    // numerator divided by (2 * distance - zi - zj). Its maximum therefore
    // decreases with distance, including changes in which corners are extreme.
    const distanceFor = (axis: 'width' | 'height', pixels: number, lo: number, hi: number): number => {
        if (measure(lo)[axis] <= pixels) return lo;
        if (measure(hi)[axis] >= pixels) return hi;
        for (let i = 0; i < iterations; i++) {
            const mid = (lo + hi) / 2;
            if (measure(mid)[axis] > pixels) lo = mid;
            else hi = mid;
        }
        return (lo + hi) / 2;
    };

    const near = distanceFor('height', heightRange[1] * viewport.height, minDistance, maxDistance);
    const far = distanceFor('height', heightRange[0] * viewport.height, minDistance, maxDistance);
    const minWidth = widthRange[0] * viewport.width, maxWidth = widthRange[1] * viewport.width;
    let distance: number;
    if (measure(far).width > maxWidth) distance = far; // Wide: smallest height allowed.
    else if (measure(near).width < minWidth) distance = near; // Tall: largest height allowed.
    else {
        const widthNear = distanceFor('width', maxWidth, near, far);
        const widthFar = distanceFor('width', minWidth, near, far);
        const preferred = distanceFor('height', desiredHeight * viewport.height, near, far);
        distance = Math.max(widthNear, Math.min(widthFar, preferred));
    }
    const result = measure(distance);
    return [...result.pose.target, result.width, result.height, distance].every(Number.isFinite)
        ? result.pose : fallback;
}
