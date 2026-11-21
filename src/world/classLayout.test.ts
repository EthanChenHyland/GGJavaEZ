import { describe, expect, it } from 'vitest';
import type { RuntimeSlot, TraceEvent } from '../contracts/runtime';
import { world } from '../theme/tokens';
import { createLayoutEngine } from './layoutEngine';

const base = { eventId: 'layout-event', seq: 0, source: null, label: 'Class shelf reservation', importance: 'normal' } as const;
const field = (id: string, value = 0): RuntimeSlot => ({ id, name: id, javaType: 'int', value: { kind: 'primitive', javaType: 'int', value } });
const observe = (index: number): Extract<TraceEvent, { type: 'CLASS_OBSERVE' }> => ({
    ...base, type: 'CLASS_OBSERVE', classId: `class/${index}`, className: `app.Type${index}`, initialization: 'observed',
    fields: Array.from({ length: index % 4 + 1 }, (_, row) => field(`class/${index}/field/${row}`)),
});

describe('class shelf reservations', () => {
    it('keeps class width bounded and clears stack and heap bounds as new shelves wrap into depth', () => {
        const classes = Array.from({ length: 13 }, (_, index) => observe(index));
        const records: TraceEvent[] = [
            ...classes.slice(0, 4),
            { ...base, type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'app.Main', methodName: 'main', locals: [] },
            { ...base, type: 'ALLOCATE_OBJECT', objectId: 'heap', displayId: 1, className: 'app.Value', fields: [], metadata: { ownership: 'PROJECT', runtimeType: 'app.Value', packageName: 'app' } },
            { ...base, type: 'ALLOCATE_OBJECT', objectId: 'string', displayId: 2, className: 'java.lang.String', source: { fileId: 'source', line: 1 }, fields: [field('string-size')] },
            ...classes.slice(4),
        ];
        const events = records.map((record, seq) => ({ ...record, seq, eventId: `layout-event/${seq}` }));
        const engine = createLayoutEngine();
        engine.append(events.slice(0, 4));
        const prefix = engine.state;
        engine.append(events);
        const { anchors, regions } = engine.state;
        const shelf = regions.classState!, stack = regions.stack!, heap = regions.heap!;
        expect(shelf.size[0]).toBeCloseTo(world.classShelf.w + world.classShelf.pitchX);
        expect(shelf.center[1] - shelf.size[1] / 2).toBeGreaterThan(stack.center[1] + stack.size[1] / 2);
        expect(shelf.center[0] + shelf.size[0] / 2).toBeLessThan(heap.center[0] - heap.size[0] / 2);

        const shelves = classes.map(event => anchors[event.classId]);
        for (const early of shelves.slice(0, 4)) expect(early).toBe(prefix.anchors[early.entityId]);
        expect(shelves[0].position[0]).toBeGreaterThan(stack.center[0]);
        expect(Math.abs(shelves[0].position[2] - anchors.main.position[2])).toBeLessThan(world.classShelf.w);
        for (let index = 2; index < shelves.length; index++) {
            const current = shelves[index], priorRow = shelves[index - 2];
            expect(current.position[0]).toBeCloseTo(priorRow.position[0]);
            expect(priorRow.position[2] - current.position[2]).toBeGreaterThan(world.classShelf.depth);
        }
    });

    it('preserves existing anchors, static ports and the heading across repeated observations and mixed appends', () => {
        const first = observe(0), second = observe(1), third = observe(2);
        const changedField = field(first.fields[0].id, 42);
        const records: TraceEvent[] = [
            first, second,
            { ...base, type: 'SET_STATIC', classId: first.classId, slotId: changedField.id, value: changedField.value },
            { ...first, fields: [changedField] },
            third,
        ];
        const events = records.map((record, seq) => ({ ...record, seq, eventId: `layout-event/${seq}` }));
        const engine = createLayoutEngine();
        expect(engine.state.headings.classState).toBeNull();
        engine.append(events.slice(0, 2));
        const prefix = engine.state;
        for (let length = 3; length <= events.length; length++) {
            engine.append(events.slice(0, length));
            expect(engine.state.anchors[first.classId]).toBe(prefix.anchors[first.classId]);
            expect(engine.state.anchors[second.classId]).toBe(prefix.anchors[second.classId]);
            expect(engine.state.headings.classState).toEqual(prefix.headings.classState);
        }
        expect(prefix.anchors[third.classId]).toBeUndefined();
        expect(engine.state.anchors[third.classId].position[0]).toBeCloseTo(prefix.anchors[first.classId].position[0]);
        expect(engine.state.anchors[first.classId].ports[first.fields[0].id]).toBeDefined();
        const batch = createLayoutEngine();
        batch.append(events);
        expect(batch.state).toEqual(engine.state);
    });
});
