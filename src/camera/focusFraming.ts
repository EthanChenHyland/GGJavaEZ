import { Vector3 } from 'three';
import type { Vec3, WorldAnchor } from '../contracts/world';
import type { Rect } from '../shell/shellLayout';
import { frontFace, projectionCamera, type OrbitPose, type Size } from './projection';

// Subpixel interior margins keep floating-point extrema within closed bounds.
const heightRange = [.38 + 1e-9, .52 - 1e-9] as const;
const widthRange = [.25 + 1e-9, .35 - 1e-9] as const;
const desiredHeight = .45;
const iterations = 40;
// Stay inside projection.ts's 100000 u far plane. All searches are bounded.
const maxDistance = 90000;
export interface FocusContent {points:readonly Vec3[];area:Rect}

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
    content?: FocusContent,
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
        || viewport.width <= 0 || viewport.height <= 0
        || content&&(![content.area.x,content.area.y,content.area.width,content.area.height].every(Number.isFinite)||content.area.width<=0||content.area.height<=0)) return fallback;

    const points = frontFace(anchor);
    if (![...points,...(content?.points??[])].every(point => point.every(Number.isFinite))) return fallback;
    const center: Vec3 = [anchor.position[0], anchor.position[1], anchor.position[2] + anchor.size[2] / 2];
    const basis = projectionCamera({ ...fallback, target: center }, viewport);
    const right = new Vector3().setFromMatrixColumn(basis.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(basis.matrixWorld, 1);
    const towardEye = new Vector3().setFromMatrixColumn(basis.matrixWorld, 2);
    const coordinates = (point:Vec3) => {
        const offset = new Vector3(...point).sub(new Vector3(...center));
        return { x: offset.dot(right), y: offset.dot(up), z: offset.dot(towardEye) };
    };
    const local = points.map(coordinates),annotation=content?.points.map(coordinates)??[];
    const focalPixels = basis.projectionMatrix.elements[5] * viewport.height / 2;
    const desiredX = (safe.x + safe.width / 2 - viewport.width / 2) / focalPixels;
    const desiredY = (viewport.height / 2 - safe.y - safe.height / 2) / focalPixels;
    const minDistance = Math.max(.02, ...local.map(point => point.z + .02),...annotation.map(point=>point.z+.02));
    if (!Number.isFinite(minDistance) || minDistance >= maxDistance) return fallback;

    // Center when max(projected) + min(projected) is zero relative to the
    // desired screen coordinate. For each corner i, some corner j must make
    // their sum nonpositive. The first shift satisfying all i is the root.
    const centerShift = (axis: 'x' | 'y', desired: number, distance: number): number => {
        let centered = -Infinity;
        for (const a of local) {
            const depthA = distance - a.z;
            const rootA = a[axis] - desired * depthA;
            let firstNonpositive = Infinity;
            for (const b of local) {
                const depthB = distance - b.z;
                const rootB = b[axis] - desired * depthB;
                const pairRoot = (rootA * depthB + rootB * depthA) / (depthA + depthB);
                firstNonpositive = Math.min(firstNonpositive, pairRoot);
            }
            centered = Math.max(centered, firstNonpositive);
        }
        if(!content||!annotation.length)return centered;
        // Keep the real face in its Safe Frame, and its real annotation in
        // uncovered World pixels. Extra caption clearance never sizes the face.
        const interval=(points:typeof local,area:Rect)=>{
            const min=axis==='x'?(area.x-viewport.width/2)/focalPixels:(viewport.height/2-area.y-area.height)/focalPixels;
            const max=axis==='x'?(area.x+area.width-viewport.width/2)/focalPixels:(viewport.height/2-area.y)/focalPixels;
            return [Math.max(...points.map(point=>point[axis]-max*(distance-point.z))),Math.min(...points.map(point=>point[axis]-min*(distance-point.z)))];
        };
        const body=interval(local,safe),caption=interval(annotation,content.area);
        const lower=Math.max(body[0],caption[0]),upper=Math.min(body[1],caption[1]);
        return lower<=upper?Math.max(lower,Math.min(upper,centered)):(lower+upper)/2;
    };
    const measure = (distance: number) => {
        const xShift = centerShift('x', desiredX, distance), yShift = centerShift('y', desiredY, distance);
        let left = Infinity, rightEdge = -Infinity, bottom = Infinity, top = -Infinity;
        for (const point of local) {
            const depth = distance - point.z;
            const x = (point.x - xShift) / depth, y = (point.y - yShift) / depth;
            left = Math.min(left, x);
            rightEdge = Math.max(rightEdge, x);
            bottom = Math.min(bottom, y);
            top = Math.max(top, y);
        }
        return { xShift, yShift, width: (rightEdge - left) * focalPixels, height: (top - bottom) * focalPixels };
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
    const target = new Vector3(...center).addScaledVector(right, result.xShift).addScaledVector(up, result.yShift).toArray();
    return [...target, result.width, result.height, distance].every(Number.isFinite)
        ? { target, distance, yawDeg: angles.yaw, pitchDeg: angles.pitch } : fallback;
}
