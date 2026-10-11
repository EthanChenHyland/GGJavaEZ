import { expect, it } from 'vitest';
import fc from 'fast-check';
import { generateRawTrace } from '../testing/traceGen';
import { normalizeTrace } from '../instrumentation/normalize';
import { seek } from '../runtime';
import { createLayoutEngine } from './layoutEngine';
import { createSceneProjector } from './sceneProjector';
import { planPresentation } from './presentationPlanner';
import { budgets } from '../theme/tokens';
import type { DetailLevel } from '../contracts/worldV2';
import {clusterSize} from './clusterAnchor';
it('presentation cut accounts for every prefix-present identity and retains required entities (100 runs)', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), fc.constantFrom<DetailLevel>('FAR', 'MEDIUM', 'CLOSE'), (seed, detail) => {
        const raw = generateRawTrace({ seed, rawEvents: 80, maxDepth: 8, classes: 8, callRate: .6, allocateRate: .7 }), trace = normalizeTrace(raw.rawEvents, raw.manifest, { status: 'complete', exitCode: 0, diagnostic: null }).trace;
        const layout = createLayoutEngine();
        layout.append(trace.events);
        const projector = createSceneProjector(trace), scene = projector.project(seek(trace, trace.events.length), layout.state, { sessionEnded: true, pausedAtLiveHead: false, liveHead: trace.events.length, recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } });
        const selected = scene.order.frames[0], input = { scene, layout: layout.state, detailLevel: detail, selection: selected ? { kind: 'frame' as const, id: selected } : null, focusTargetId: selected ?? null, trace: { active: false, scope: 'relevant' as const } };
        const plan = planPresentation(input);
        expect(plan.accounting.detailed + plan.accounting.quiet + plan.accounting.clustered).toBe(plan.accounting.total);
        expect(plan.accounting.total).toBe(Object.keys(scene.entities).length);
        expect(plan.clusters.reduce((sum, c) => sum + c.members, 0)).toBe(plan.accounting.clustered);
        const residual=plan.clusters.flatMap(cluster=>{
            expect(cluster.members).toBe(cluster.memberIds.length);
            expect(cluster.anchor.size).toEqual(clusterSize);
            expect(cluster.anchor.ports).toEqual({});
            expect(cluster.pickable).toBe(true);
            return cluster.memberIds;
        });
        expect(new Set(residual).size).toBe(residual.length);
        expect(residual.slice().sort()).toEqual(Object.keys(scene.entities).filter(id=>!plan.entities.has(id)).sort());
        for(const entity of plan.entities.values())if(entity.mode==='detailed')expect(entity.pickable).toBe(true);
        expect([...plan.entities.values()].filter(entity=>entity.mode==='quiet'&&entity.pickable).length).toBeLessThanOrEqual(budgets[detail].pickable);
        for (const id of plan.pinned) {
            expect(plan.entities.get(id)).toMatchObject({ pinned: true, pickable: true, mode: 'detailed' });
        }
        for (const category of ['frames', 'objects', 'classes'] as const) {
            const ids = category === 'frames' ? scene.order.frames : category === 'classes' ? scene.order.classes : scene.order.objects;
            const detailed = ids.filter(id => plan.entities.get(id)?.mode === 'detailed'), mandatory = ids.filter(id => plan.pinned.has(id));
            expect(detailed.length).toBeLessThanOrEqual(Math.max(budgets[detail][category], mandatory.length));
        }
        expect(planPresentation(input)).toEqual(plan);
        if (selected)
            expect(plan.entities.get(selected)?.detail).toBe('CLOSE');
    }), { numRuns: 100 });
});
