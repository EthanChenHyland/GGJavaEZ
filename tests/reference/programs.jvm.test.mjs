import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { recordProject } from '../coverage-v12-p4/runner.mjs';
import { createLayoutEngine } from '../../src/world/layoutEngine.ts';
import { createSceneProjector } from '../../src/world/sceneProjector.ts';

const root = 'fixtures/reference-exact';
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const enabled = process.env.VJ_REFERENCE_JVM === '1' && process.env.VJ_PHASE4_JVM === '1';
const full = { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false };

describe.skipIf(!enabled)('reference programs through the production BuildService and real recorded JVM', () => {
  test.each(Object.entries(manifest))('%s preserves exact output and final SceneModel inventory', async (name, spec) => {
    let run;
    try {
      run = await recordProject(join(root, name), spec);
      const layout = createLayoutEngine(); layout.append(run.trace.events);
      const scene = createSceneProjector(run.trace).project(run.state, layout.state, { sessionEnded: true, pausedAtLiveHead: false, liveHead: run.trace.events.length, recording: run.snapshot.recording ?? full });
      const counts = { frames: scene.order.frames.length, objects: scene.order.objects.length, classes: scene.order.classes.length, references: scene.references.length };
      const report = { name, mainClass: spec.mainClass, javaVersion: run.jdk.version, executed: true, exitCode: run.snapshot.exitCode, stdout: run.snapshot.stdout, stderr: run.snapshot.stderr, recording: run.snapshot.recording, normalizedEvents: run.trace.events.length, counts };
      const directory = '.ggjavaez/qa/reference-exact/programs';
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `${name}.json`), JSON.stringify(report, null, 2) + '\n');
      if (spec.expectedExit === 'nonzero') { expect(run.snapshot.exitCode).not.toBeNull(); expect(run.snapshot.exitCode).not.toBe(0); }
      else expect(run.snapshot.exitCode).toBe(spec.expectedExit);
      expect(run.snapshot.stdout).toBe(spec.stdout);
      if (spec.stderr !== undefined) expect(run.snapshot.stderr).toBe(spec.stderr);
      for (const text of spec.stderrContains ?? []) expect(run.snapshot.stderr).toContain(text);
      expect(run.rawEvents.length).toBeGreaterThan(0);
      expect(run.trace.events.length).toBeGreaterThan(0);
      expect(run.snapshot.recording.state).toBe('FULL');
      expect(run.history.stats.length).toBe(run.trace.events.length);
      expect(counts).toEqual(spec.sceneCounts);
    } finally { run?.history.dispose(); }
  }, 120000);
});
