import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test, describe } from 'vitest';
import { recordProject } from '../coverage-v12-p4/runner.mjs';
import { assertArchiveAndReplay } from '../coverage-v12-p4/replay.mjs';
import { beginProbe, finishProbe, writeCaseEvidence } from '../coverage-v12-p4/evidence.mjs';
import { projectTrace } from '../../src/testing/projectTrace.ts';

const root = 'fixtures/torture-v12-p5_5';
const enabled = process.env.VJ_PHASE5_5_JVM === '1' && process.env.VJ_PHASE4_JVM === '1';
const names = (await readdir(root)).filter(name => !process.env.VJ_TORTURE_CASE || name.includes(process.env.VJ_TORTURE_CASE)).sort();
const digest = value => createHash('sha256').update(value).digest('hex');

describe.skipIf(!enabled)('Phase 5.5 fresh torture projects — one serialized JVM per case', () => {
  test.each(names)('%s preserves actual output, immutable history and stable geometry', async name => {
    const projectDir = join(root, name);
    const spec = JSON.parse(await readFile(join(projectDir, 'expected.facts.json'), 'utf8'));
    const baseline = beginProbe();
    let run;
    try {
      run = await recordProject(projectDir, spec);
      const { snapshot, state, trace } = run;
      if (spec.expectedExit === 'nonzero') expect(snapshot.exitCode).not.toBe(0);
      else expect(snapshot.exitCode).toBe(spec.expectedExit);
      if (spec.stdout !== undefined) expect(snapshot.stdout).toBe(spec.stdout);
      if (spec.stderr !== undefined) expect(snapshot.stderr).toBe(spec.stderr);
      for (const text of spec.stderrContains ?? []) expect(snapshot.stderr).toContain(text);
      if (spec.outputLines) {
        expect(snapshot.stdout).toBe('READY\nINPUT 0 🟣中文 4096\n' + Array.from({ length: spec.outputLines }, (_, i) => `OUT ${i}\n`).join('') + 'FINISHED\n');
        expect(snapshot.stderr).toBe(Array.from({ length: spec.outputLines }, (_, i) => `ERR ${i}\n`).join(''));
      }
      expect(run.capability.diagnostics.filter(text => text.startsWith('Raw event'))).toEqual([]);
      expect(['FULL', 'STOPPED_LIMIT']).toContain(snapshot.recording.state);
      if (snapshot.recording.state === 'STOPPED_LIMIT') {
        expect(run.rawEvents.filter(event => event.type === 'capture_saturated')).toHaveLength(1);
        expect(trace.events.at(-1).type).toBe('CAPTURE_STOP');
        expect(state.status).toBe('partial');
      }
      expect(Object.keys(state.frames).length).toBeGreaterThan(0);
      expect(run.batches.at(-1).to).toBe(run.rawEvents.length);
      await assertArchiveAndReplay(run);
      const projection = projectTrace(trace, { sessionEnded: ['exited', 'failed', 'stopped'].includes(snapshot.status), recording: snapshot.recording });
      const layout = projection.layout, scene = projection.project(trace.events.length);
      const before = JSON.stringify(layout.anchors);
      for (const cursor of [1, Math.floor(trace.events.length / 2), trace.events.length, 0]) {
        projection.project(cursor);
        expect(JSON.stringify(layout.anchors)).toBe(before);
      }
      if (name.startsWith('01')) {
        expect(Object.values(state.objects).some(object => Object.keys(object.fields).length >= 100)).toBe(true);
        expect(Object.values(state.frames).some(frame => frame.methodName.length > 90)).toBe(true);
      }
      if (name.startsWith('02')) {
        const sparse = Object.values(state.objects).find(object => object.array?.length === 10001);
        expect(sparse).toBeDefined();
        expect(sparse.array.elements.length).toBeLessThanOrEqual(32);
        expect(sparse.array.sparseElements['10000'].value).toEqual({ kind: 'primitive', javaType: 'int', value: 73 });
      }
      if (name.startsWith('03')) {
        expect(snapshot.recording.state).toBe('STOPPED_LIMIT');
        expect(snapshot.recording.budget).toBe('live frames');
      }
      if (name.startsWith('07')) {
        expect(snapshot.recording.state).toBe('FULL');
        expect(scene.order.frames.length).toBeGreaterThanOrEqual(160);
        expect(Math.max(...scene.order.frames.map(id => scene.entities[id].depth))).toBeGreaterThanOrEqual(70);
      }
      if (name.startsWith('08')) {
        expect(snapshot.recording.state).toBe('FULL');
        expect(scene.order.classes.length).toBeGreaterThanOrEqual(24);
      }
      const probe = finishProbe(run, baseline);
      await writeCaseEvidence({ name, spec, run, accepted: true, probe });
      const output = process.env.VJ_TORTURE_REPORT;
      if (output) {
        await mkdir(output, { recursive: true });
        await writeFile(join(output, `${name}.json`), JSON.stringify({ name, recording: snapshot.recording,
          exitCode: snapshot.exitCode, stdoutBytes: Buffer.byteLength(snapshot.stdout), stderrBytes: Buffer.byteLength(snapshot.stderr),
          stdoutSha256: digest(snapshot.stdout), stderrSha256: digest(snapshot.stderr), rawEvents: run.rawEvents.length,
          semanticEvents: trace.events.length, frames: scene.order.frames.length, objects: scene.order.objects.length,
          references: scene.references.length, anchors: Object.keys(layout.anchors).length,
          timings: run.timings, probe, jdkVersion: run.jdk.version, status: state.status }, null, 2) + '\n');
      }
    } finally { run?.history.dispose(); }
  }, 300000);
});
