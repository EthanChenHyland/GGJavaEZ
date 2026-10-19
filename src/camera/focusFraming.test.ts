import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Vec3, WorldAnchor } from '../contracts/world';
import type { Rect } from '../shell/shellLayout';
import { focusFraming } from './focusFraming';
import { fitToSafeFrame, projectionCamera, screenPoint, type OrbitPose, type Size } from './projection';

const viewports: Size[] = [
    { width: 1728, height: 1117 }, { width: 1440, height: 900 },
    { width: 1280, height: 800 }, { width: 760, height: 900 }, { width: 1440, height: 650 },
];
function anchor(size: Vec3 = [5.2, 6.75, 2.3], position: Vec3 = [8.4, -4, 1.15]): WorldAnchor {
    return { entityId: 'object:17', region: 'heap', position, size, ports: {}, bodyPort: position };
}
// Observe the four actual front corners independently of the solver's helper.
function corners(node: WorldAnchor): Vec3[] {
    const [x, y, z] = node.position, [w, h, d] = node.size;
    return [[x - w / 2, y - h / 2, z + d / 2], [x + w / 2, y - h / 2, z + d / 2],
        [x - w / 2, y + h / 2, z + d / 2], [x + w / 2, y + h / 2, z + d / 2]];
}
function observe(node: WorldAnchor, pose: OrbitPose, viewport: Size) {
    const camera = projectionCamera(pose, viewport);
    const points = corners(node).map(point => screenPoint(point, camera, viewport));
    const left = Math.min(...points.map(point => point.x)), right = Math.max(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y)), bottom = Math.max(...points.map(point => point.y));
    const eyeDirection = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    return {
        points, left, right, top, bottom, width: right - left, height: bottom - top,
        yaw: Math.atan2(eyeDirection.x, eyeDirection.z) * 180 / Math.PI,
        pitch: -Math.atan2(eyeDirection.y, Math.hypot(eyeDirection.x, eyeDirection.z)) * 180 / Math.PI,
    };
}
function safeFrame(viewport: Size): Rect {
    if (viewport.width < 1024) {
        // Explicit Focus rectangle above the open Inspector at .55 H.
        return { x: 112, y: 56, width: viewport.width - 112, height: viewport.height * .55 - 56 };
    }
    return { x: viewport.width * .25, y: viewport.height * .1,
        width: viewport.width * .56, height: viewport.height * .73 };
}
function assertProjection(node: WorldAnchor, pose: OrbitPose, safe: Rect, viewport: Size, yaw: number) {
    const observed = observe(node, pose, viewport);
    expect(observed.height / viewport.height).toBeGreaterThanOrEqual(.38 - 1e-6);
    expect(observed.height / viewport.height).toBeLessThanOrEqual(.52 + 1e-6);
    expect((observed.left + observed.right) / 2).toBeCloseTo(safe.x + safe.width / 2, 3);
    expect((observed.top + observed.bottom) / 2).toBeCloseTo(safe.y + safe.height / 2, 3);
    expect(pose.yawDeg).toBe(yaw);
    expect(pose.pitchDeg).toBe(-8);
    expect(observed.yaw).toBeCloseTo(yaw, 8);
    expect(observed.pitch).toBeCloseTo(-8, 8);
    for (const point of observed.points) {
        expect(point.z).toBeGreaterThan(-1);
        expect(point.z).toBeLessThan(1);
    }
    return observed;
}

it('fixes the narrow 5.2 × 6.75 face height lost by fitting to a hard .30 W box', () => {
    const viewport = { width: 760, height: 900 }, safe = safeFrame(viewport), node = anchor();
    const oldArea = { x: safe.x + safe.width / 2 - viewport.width * .15,
        y: safe.y + safe.height / 2 - viewport.height * .225,
        width: viewport.width * .30, height: viewport.height * .45 };
    const oldPose = fitToSafeFrame(corners(node), { yaw: 21, pitch: -8 }, oldArea, viewport);
    expect(observe(node, oldPose, viewport).height).toBeLessThan(viewport.height * .38);
    const observed = assertProjection(node, focusFraming(node, { yaw: 21, pitch: -8 }, safe, viewport), safe, viewport, 21);
    expect(observed.width / viewport.width).toBeGreaterThanOrEqual(.25 - 1e-6);
    expect(observed.width / viewport.width).toBeLessThanOrEqual(.35 + 1e-6);
    expect(observed.bottom).toBeLessThanOrEqual(viewport.height * .55 + 1e-4);
});

for (const viewport of viewports) {
    it(`frames a real object above Shell surfaces at ${viewport.width} × ${viewport.height}, with either yaw`, () => {
        const safe = safeFrame(viewport);
        for (const yaw of [-21, 21]) {
            const node = anchor(), before = JSON.stringify(node);
            const observed = assertProjection(node, focusFraming(node, { yaw, pitch: -8 }, safe, viewport), safe, viewport, yaw);
            expect(observed.left).toBeGreaterThanOrEqual(safe.x - 1e-4);
            expect(observed.right).toBeLessThanOrEqual(safe.x + safe.width + 1e-4);
            expect(observed.top).toBeGreaterThanOrEqual(safe.y - 1e-4);
            expect(observed.bottom).toBeLessThanOrEqual(safe.y + safe.height + 1e-4);
            expect(JSON.stringify(node)).toBe(before);
        }
    });
}

it('keeps the desired .45 H when both size bands are feasible', () => {
    const viewport = viewports[1], safe = safeFrame(viewport), node = anchor([5.2, 4.05, 2.3]);
    const observed = assertProjection(node, focusFraming(node, { yaw: -21, pitch: -8 }, safe, viewport), safe, viewport, -21);
    expect(observed.height / viewport.height).toBeCloseTo(.45, 6);
    expect(observed.width / viewport.width).toBeGreaterThan(.25);
    expect(observed.width / viewport.width).toBeLessThan(.35);
});

it('chooses height endpoints for wide and tall runtime bodies instead of shrinking to a width box', () => {
    const viewport = viewports[1], safe = { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const wide = anchor([5.2, 1.95, 2.3]), tall = anchor([5.2, 15.6, 2.3]);
    const wideObserved = assertProjection(wide, focusFraming(wide, { yaw: 21, pitch: -8 }, safe, viewport), safe, viewport, 21);
    expect(wideObserved.width / viewport.width).toBeGreaterThan(.35);
    expect(wideObserved.height / viewport.height).toBeCloseTo(.38, 6);
    const tallObserved = assertProjection(tall, focusFraming(tall, { yaw: -21, pitch: -8 }, safe, viewport), safe, viewport, -21);
    expect(tallObserved.width / viewport.width).toBeLessThan(.25);
    expect(tallObserved.height / viewport.height).toBeCloseTo(.52, 6);
});

it('preserves projection under world translation, depth changes and realistic uniform body scales', () => {
    const viewport = viewports[0], safe = safeFrame(viewport);
    const reference = observe(anchor(), focusFraming(anchor(), { yaw: -21, pitch: -8 }, safe, viewport), viewport);
    for (const scale of [.75, 1, 1.5, 2]) for (const position of [[0, 0, 0], [-14, -12, -9], [35, -26, 13]] as const) {
        const node = anchor([5.2 * scale, 6.75 * scale, 1.1 + scale], position);
        const before = structuredClone(node);
        Object.freeze(node.position); Object.freeze(node.size); Object.freeze(node.ports); Object.freeze(node);
        const observed = assertProjection(node, focusFraming(node, { yaw: -21, pitch: -8 }, safe, viewport), safe, viewport, -21);
        expect(observed.width).toBeCloseTo(reference.width, 3);
        expect(observed.height).toBeCloseTo(reference.height, 3);
        expect(node).toEqual(before);
    }
});

it('honors width priority across realistic field counts using independently observed screen bounds', () => {
    for (const viewport of viewports) for (const height of [1.95, 4.05, 6.75, 10.35, 15.6]) for (const yaw of [-21, 21]) {
        const safe = safeFrame(viewport), node = anchor([5.2, height, 2.3], [-7, -11, -4]);
        const observed = assertProjection(node, focusFraming(node, { yaw, pitch: -8 }, safe, viewport), safe, viewport, yaw);
        const w = observed.width / viewport.width, h = observed.height / viewport.height;
        if (w < .25 - 1e-6) expect(h).toBeCloseTo(.52, 6);
        else if (w > .35 + 1e-6) expect(h).toBeCloseTo(.38, 6);
        else {
            // A deviation from the preferred height is justified only by a
            // width-band boundary; being inside a hard .30 W box is insufficient.
            expect(Math.min(Math.abs(h - .45), Math.abs(w - .25), Math.abs(w - .35))).toBeLessThan(1e-6);
        }
    }
});

it('returns a finite truthful-height pose when an extreme width cannot also fit the supplied rectangle', () => {
    const viewport = viewports[1], safe = safeFrame(viewport), node = anchor([32, 1.3, 1.1]);
    const pose = focusFraming(node, { yaw: 21, pitch: -8 }, safe, viewport);
    expect([...pose.target, pose.distance, pose.yawDeg, pose.pitchDeg].every(Number.isFinite)).toBe(true);
    const observed = assertProjection(node, pose, safe, viewport, 21);
    expect(observed.height / viewport.height).toBeCloseTo(.38, 6);
    expect(observed.width).toBeGreaterThan(safe.width);
});

it('has a finite fallback for degenerate geometry and invalid viewport bounds', () => {
    for (const size of [[5.2, 0, 2.3], [Number.NaN, 6.75, 2.3], [1e7, 1e7, 1e7]] as const) {
        const pose = focusFraming(anchor(size), { yaw: -21, pitch: -8 }, safeFrame(viewports[1]), viewports[1]);
        expect([...pose.target, pose.distance, pose.yawDeg, pose.pitchDeg].every(Number.isFinite)).toBe(true);
        expect(pose.distance).toBeGreaterThan(0);
        expect(pose.yawDeg).toBe(-21); expect(pose.pitchDeg).toBe(-8);
    }
    const pose = focusFraming(anchor(), { yaw: 21, pitch: -8 }, { x: 0, y: 0, width: 0, height: 0 }, { width: 0, height: 0 });
    expect([...pose.target, pose.distance].every(Number.isFinite)).toBe(true);
});
