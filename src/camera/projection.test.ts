import { expect, it } from 'vitest';
import fc from 'fast-check';
import { fitToSafeFrame, projectionCamera, screenPoint, nextDetailLevel } from './projection';
import { camera as tokens } from '../theme/tokens';
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
it('canonical semantic zoom converges at fixed measurements and preserves hysteresis (100 runs)', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 500, noNaN: true }), fc.integer({ min: 400, max: 1800 }), fc.constantFrom('CLOSE' as const, 'MEDIUM' as const, 'FAR' as const), (height, h, initial) => {
        const once = nextDetailLevel(initial, height, h), twice = nextDetailLevel(once, height, h);
        expect(nextDetailLevel(twice, height, h)).toBe(twice);
        expect(nextDetailLevel(initial, null, h)).toBe(initial);
        expect(nextDetailLevel('CLOSE', .14 * h, h)).toBe('CLOSE');
        expect(nextDetailLevel('FAR', .055 * h, h)).toBe('FAR');
    }), { numRuns: 100 });
});
