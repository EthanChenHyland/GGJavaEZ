import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { TraceEvent } from '../contracts/runtime';
import type { WorldAnchor } from '../contracts/worldV2';
import { loadPersonTrace } from '../examples/traces';
import { generateRawTrace } from '../testing/traceGen';
import { normalizeTrace } from '../instrumentation/normalize';
import { computeArrayWindow } from './arrayWindow';
import { createLayoutEngine } from './layoutEngine';
const intersects = (a: WorldAnchor, b: WorldAnchor) => a.position.every((v, axis) => Math.abs(v - b.position[axis]) < (a.size[axis] + b.size[axis]) / 2 - 1e-6);
function generated(seed: number) {
    const raw = generateRawTrace({ seed, rawEvents: 35, classes: 3, maxDepth: 5, callRate: .4, allocateRate: .65 });
    return normalizeTrace(raw.rawEvents, raw.manifest, { status: 'complete', exitCode: 0, diagnostic: null }).trace;
}
describe('first-observation spatial layout', () => {
    it('Property 20: append never changes any reserved body or existing port (100 runs)', () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), seed => {
            const trace = generated(seed), engine = createLayoutEngine();
            for (let end = 1; end <= trace.events.length; end++) {
                const prior = engine.state;
                engine.append(trace.events.slice(0, end));
                for (const [id, anchor] of Object.entries(prior.anchors)) {
                    const next = engine.state.anchors[id];
                    expect(next.position).toEqual(anchor.position);
                    expect(next.size).toEqual(anchor.size);
                    for (const [slot, port] of Object.entries(anchor.ports))
                        expect(next.ports[slot]).toEqual(port);
                }
            }
            const batch = createLayoutEngine();
            batch.append(trace.events);
            expect(engine.state).toEqual(batch.state);
        }), { numRuns: 100 });
    });
    it('Property 21: real call trees descend below callers and occupy separate deck slots (100 runs)', () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), seed => {
            const trace = generated(seed), engine = createLayoutEngine();
            engine.append(trace.events);
            const frames = Object.values(engine.state.anchors).filter(a => a.region === 'stack');
            for (let i = 0; i < frames.length; i++) {
                expect(frames[i].size[0]).toBe(4.8);
                for (let j = i + 1; j < frames.length; j++)
                    expect(intersects(frames[i], frames[j])).toBe(false);
            }
            for (const entry of trace.events)
                if (entry.type === 'ENTER_METHOD' && entry.callerFrameId) {
                    const parent = engine.state.anchors[entry.callerFrameId], child = engine.state.anchors[entry.frameId];
                    expect(child.position[1] + child.size[1] / 2).toBeCloseTo(parent.position[1] - parent.size[1] / 2 - .1);
                }
        }), { numRuns: 100 });
    });
    it('Property 22: statement locations never choose frame geometry (100 runs)', () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), seed => {
            const trace = generated(seed), a = createLayoutEngine(), b = createLayoutEngine();
            a.append(trace.events);
            b.append(trace.events.map(e => ({ ...e, source: e.source ? { ...e.source, line: 1 + seed % 400 } : null })));
            expect(a.state).toEqual(b.state);
        }), { numRuns: 100 });
    });
    it('Property 23: project heap, library summaries and stack reservations stay separate (100 runs)', () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), seed => {
            const trace = generated(seed), engine = createLayoutEngine();
            engine.append(trace.events);
            const anchors = Object.values(engine.state.anchors), heap = anchors.filter(a => a.region === 'heap'), frames = anchors.filter(a => a.region === 'stack');
            for (let i = 0; i < heap.length; i++) {
                expect(heap[i].position[0] - heap[i].size[0] / 2).toBeGreaterThanOrEqual(5.8 - 1e-9);
                for (const frame of frames)
                    expect(frame.position[0] + frame.size[0] / 2).toBeLessThan(heap[i].position[0] - heap[i].size[0] / 2);
                for (let j = i + 1; j < heap.length; j++)
                    expect(intersects(heap[i], heap[j])).toBe(false);
            }
            for (const library of anchors.filter(a => a.region === 'library')) {
                expect(library.size).toEqual([4.2, 2.4, 1.6]);
                expect(library.position[2] + library.size[2] / 2).toBeLessThanOrEqual(-3.15);
            }
        }), { numRuns: 100 });
    });
    it('Property 24: canonical small-array anchors equal semantic window cell geometry (100 runs)', () => {
        fc.assert(fc.property(fc.integer({ min: 0, max: 128 }), length => {
            const event: TraceEvent = { eventId: 'opaque/allocation', seq: 0, type: 'ALLOCATE_ARRAY', objectId: 'a', displayId: 9, elementType: 'int', length, elements: [], source: { fileId: 'f', line: 1 }, label: 'allocate', importance: 'normal' };
            const engine = createLayoutEngine();
            engine.append([event]);
            const parent = engine.state.anchors.a, window = computeArrayWindow({ recordingId: 'r', arrayId: 'a', recordedLength: length, nominalCellBudget: 128, anchor: parent });
            for (const [id, mapping] of window.mapping) {
                expect(engine.state.anchors[id].position).toEqual(mapping.anchor.position);
                expect(engine.state.anchors[id].size).toEqual(mapping.anchor.size);
                expect(parent.ports[id]).toEqual(mapping.port);
            }
        }), { numRuns: 100 });
    });
    it('rejects cursor-like rewind attempts and returns the same snapshot until append', () => {
        const engine = createLayoutEngine(), trace = loadPersonTrace();
        engine.append(trace.events);
        expect(engine.state).toBe(engine.state);
        expect(() => engine.append(trace.events, 0)).toThrow('Layout append expected');
        expect(() => engine.append([])).toThrow('discard accepted');
    });
});
