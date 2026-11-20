import { expect, it } from 'vitest';
import fc from 'fast-check';
import { generateRawTrace } from '../testing/traceGen';
import { normalizeTrace } from '../instrumentation/normalize';
import { seek } from '../runtime';
import { createLayoutEngine } from './layoutEngine';
import { createSceneProjector } from './sceneProjector';
import { planPresentation } from './presentationPlanner';
import { budgets } from '../theme/tokens';
import type { DetailLevel } from '../contracts/world';
import {clusterSize} from './clusterAnchor';
import {heroTrace} from '../testing/heroTrace';
import {projectTrace} from '../testing/projectTrace';
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
        const counts=plan.referencePresentation.counts;
        expect(counts.current).toBe(scene.references.length);
        expect(counts.current).toBe(counts.individual+counts.bundled+counts.unavailable+counts.internal+counts.scopeExcluded);
        const references=[...plan.curves.filter(curve=>curve.kind==='connector').map(curve=>curve.id),...plan.bundles.filter(bundle=>bundle.kind==='connector').flatMap(bundle=>{
            expect(bundle.count).toBe(bundle.referenceIds!.length);return bundle.referenceIds!;
        }),...plan.referencePresentation.unavailable.map(item=>item.id),...plan.referencePresentation.internal.map(item=>item.id),...plan.referencePresentation.scopeExcluded];
        expect(references.slice().sort()).toEqual(scene.references.map(ref=>ref.id).sort());
        expect(new Set(references).size).toBe(counts.current);
        for(const curve of plan.curves.filter(curve=>curve.kind==='connector')){
            const ref=scene.references.find(ref=>ref.id===curve.id)!;
            expect(curve.colorRole).toBe(ref.overlay??(ref.role==='object-object'?'heap':ref.role==='class-object'?'class':'reference'));
            const context=new Set([selected,...(plan.framing.focus?.neighbours??[])]);
            const direct=(ref.sourceId===selected||ref.targetId===selected)&&context.has(ref.sourceId)&&context.has(ref.targetId);
            if(selected&&!direct)expect(curve.opacity).toBeLessThanOrEqual(.25);
        }
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
        expect(plan.framing.focus?.neighbours.length??0).toBeLessThanOrEqual(6);
    }), { numRuns: 100 });
});

it('caps indirect neighbour references and call links during Focus, including Trace All and foreign selection',()=>{
 const{trace}=heroTrace(),projection=projectTrace(trace),scene=projection.project(trace.events.length),before=JSON.stringify(scene)
 const focus='first-record',foreign=scene.references.find(ref=>ref.sourceId==='second-record'&&ref.targetId==='second-label')!
 expect(foreign).toBeTruthy();expect(scene.callLinks.length).toBeGreaterThan(0)
 for(const active of[false,true])for(const selected of[false,true]){
  const plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:selected?{kind:'reference',id:foreign.id}:null,focusTargetId:focus,trace:{active,scope:'all'}})
  expect(plan.framing.focus!.neighbours).toContain('second-record')
  expect(plan.framing.focus!.neighbours).not.toContain('second-label')
  const connection=plan.curves.find(curve=>curve.id===foreign.id)!
  expect(connection).toBeTruthy();expect(connection.opacity).toBeLessThanOrEqual(.25)
  const calls=plan.curves.filter(curve=>curve.kind==='call')
  expect(calls.length).toBeGreaterThan(0);for(const call of calls)expect(call.opacity).toBeLessThanOrEqual(.25)
  expect(plan.referencePresentation.counts.current).toBe(scene.references.length)
 }
 expect(JSON.stringify(scene)).toBe(before)
})

it('preserves recorded callers as dim context outside the reference-only Frame Focus neighbourhood',()=>{
 const{trace}=heroTrace(),projection=projectTrace(trace),scene=projection.project(trace.events.length)
 const input={scene,layout:projection.layout,detailLevel:'CLOSE' as const,selection:{kind:'frame' as const,id:'setter'},focusTargetId:'setter',trace:{active:false,scope:'relevant' as const}}
 const plan=planPresentation(input)
 expect(plan.framing.focus!.neighbours).toContain('first-record')
 expect(plan.framing.focus!.neighbours).not.toContain('entry')
 expect(plan.framing.focus!.neighbours.length).toBeLessThanOrEqual(6)
 expect(scene.callLinks.some(call=>call.callerId==='entry'&&call.calleeId==='setter')).toBe(true)
 expect(plan.entities.get('entry')!.opacity).toBeLessThanOrEqual(.25)
 expect(plan.framing.focus).toEqual(planPresentation(input).framing.focus)
})
