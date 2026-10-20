import { expect, it } from 'vitest';
import fc from 'fast-check';
import { Vector3 } from 'three';
import type { Vec3 } from '../contracts/world';
import { fitToSafeFrame, projectionCamera, screenPoint, nextDetailLevel } from './projection';
import { camera as tokens } from '../theme/tokens';
it('uses the closest fitting distance rather than adding a fixed zoom-out margin', () => {
    const viewport = { width: 1000, height: 1000 }, safe = { x: 100, y: 100, width: 800, height: 800 };
    const pose = fitToSafeFrame([[-2, -1, 0], [2, 1, 0]], { yaw: 0, pitch: 0 }, safe, viewport);
    expect(pose.distance).toBeCloseTo(2 / (.8 * Math.tan(tokens.fov * Math.PI / 360)), 6);
});
it('fits real XYZ bounds into the safe frame at all five viewport targets', () => {
    const sizes = [{ width: 1728, height: 1117 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 760, height: 900 }, { width: 1440, height: 650 }];
    const points = [[-2.4, 0, .55], [2.4, -9, -3], [11, 0, 2], [16, -8, -2]] as const;
    for (const viewport of sizes) {
        const safe = { x: viewport.width * .3, y: viewport.height * .15, width: viewport.width * .6, height: viewport.height * .6 }, pose = fitToSafeFrame(points, tokens.hero, safe, viewport), camera = projectionCamera(pose, viewport);
        for (const point of points) {
            const p = screenPoint(point, camera, viewport);
            expect(p.x).toBeGreaterThanOrEqual(safe.x);
            expect(p.x).toBeLessThanOrEqual(safe.x + safe.width);
            expect(p.y).toBeGreaterThanOrEqual(safe.y);
            expect(p.y).toBeLessThanOrEqual(safe.y + safe.height);
        }
    }
});
it('fits asymmetric XYZ worlds with no possible closer image-plane pan (150 generated worlds)', () => {
    const coordinate = (min: number, max: number) => fc.double({ min, max, noNaN: true });
    fc.assert(fc.property(
        fc.array(fc.tuple(coordinate(-20, 20), coordinate(-15, 15), coordinate(-10, 10)), { minLength: 3, maxLength: 24 }),
        fc.constantFrom([1728, 1117], [1440, 900], [1280, 800], [760, 900], [1440, 650]),
        fc.integer({ min: 4, max: 12 }), fc.integer({ min: -16, max: -10 }),
        (points, [width, height], yaw, pitch) => {
            const viewport = { width, height }, safe = { x: .27 * width, y: .10 * height, width: .715 * width, height: .75 * height };
            const before = structuredClone(points), pose = fitToSafeFrame(points, { yaw, pitch }, safe, viewport);
            const camera = projectionCamera(pose, viewport);
            expect(points).toEqual(before);
            for (const point of points) {
                const screen = screenPoint(point, camera, viewport);
                expect(screen.z).toBeGreaterThan(-1); expect(screen.z).toBeLessThan(1);
                expect(screen.x).toBeGreaterThanOrEqual(safe.x - 1e-6); expect(screen.x).toBeLessThanOrEqual(safe.x + safe.width + 1e-6);
                expect(screen.y).toBeGreaterThanOrEqual(safe.y - 1e-6); expect(screen.y).toBeLessThanOrEqual(safe.y + safe.height + 1e-6);
            }
            if (pose.distance <= tokens.minDistance * 1.00002) return;
            const closer = projectionCamera({ ...pose, distance: pose.distance * .99999 }, viewport);
            let xLow = -Infinity, xHigh = Infinity, yLow = -Infinity, yHigh = Infinity, clipped = false;
            // Independent witness in projected Three.js coordinates: every
            // possible camera-plane pan must belong to both interval cuts.
            for (const point of points) {
                const screen = screenPoint(point, closer, viewport), depth = -new Vector3(...point as Vec3).applyMatrix4(closer.matrixWorldInverse).z;
                if (depth <= closer.near) { clipped = true; break; }
                const pixelsPerUnit = height / (2 * depth * Math.tan(closer.fov * Math.PI / 360));
                xLow = Math.max(xLow, (screen.x - safe.x - safe.width) / pixelsPerUnit);
                xHigh = Math.min(xHigh, (screen.x - safe.x) / pixelsPerUnit);
                yLow = Math.max(yLow, (safe.y - screen.y) / pixelsPerUnit);
                yHigh = Math.min(yHigh, (safe.y + safe.height - screen.y) / pixelsPerUnit);
            }
            expect(clipped || xLow > xHigh || yLow > yHigh).toBe(true);
        }), { numRuns: 150, seed: 20261020 });
});
it('canonical semantic zoom converges at fixed measurements and preserves hysteresis (100 runs)', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 500, noNaN: true }), fc.integer({ min: 400, max: 1800 }), fc.constantFrom('CLOSE' as const, 'MEDIUM' as const, 'FAR' as const), (height, h, initial) => {
        const once = nextDetailLevel(initial, height, h), twice = nextDetailLevel(once, height, h);
        expect(nextDetailLevel(twice, height, h)).toBe(twice);
        expect(nextDetailLevel(initial, null, h)).toBe(initial);
        expect(nextDetailLevel('CLOSE', .14 * h, h)).toBe('CLOSE');
        expect(nextDetailLevel('FAR', .055 * h, h)).toBe('FAR');
    }), { numRuns: 100 });
});
