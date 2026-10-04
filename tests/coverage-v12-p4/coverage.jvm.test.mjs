import { describe, expect, test } from 'vitest';
import { assertBehavior, assertFact } from './facts.mjs';
import { CASE_FILTER, JVM_ENABLED, inventory, recordProject } from './runner.mjs';
import { assertArchiveAndReplay } from './replay.mjs';
import { beginProbe, finishProbe, writeCaseEvidence } from './evidence.mjs';

const projects = (await inventory()).filter(project => !CASE_FILTER || project.name.includes(CASE_FILTER));

describe.skipIf(!JVM_ENABLED)('Phase 4 production JVM acceptance (lead serialized slot)', () => {
  test.each(projects)('$name preserves Java behavior and observed semantic facts through replay', async ({ name, projectDir, spec }) => {
    const baseline = beginProbe();
    let run;
    try {
      run = await recordProject(projectDir, spec);
      assertBehavior(run);
      for (const fact of spec.facts) assertFact(run, fact);
      expect(run.batches.length).toBeGreaterThan(0);
      expect(run.batches.at(-1).to).toBe(run.rawEvents.length);
      for (let index = 0; index < run.batches.length; index++) {
        expect(run.batches[index].from).toBe(index ? run.batches[index - 1].to : 0);
        expect(run.batches[index].to).toBeGreaterThan(run.batches[index].from);
        if (index) expect(run.batches[index].historyLength).toBeGreaterThanOrEqual(run.batches[index - 1].historyLength);
      }
      expect(run.history.stats.length).toBe(run.trace.events.length);
      expect(run.history.stats.checkpointCount).toBeLessThanOrEqual(run.history.stats.maxCheckpoints);
      await assertArchiveAndReplay(run);
      const probe = finishProbe(run, baseline);
      await writeCaseEvidence({ name, spec, run, accepted: true, probe });
    } catch (error) {
      await writeCaseEvidence({ name, spec, run, accepted: false, error });
      throw error;
    } finally { run?.history.dispose(); }
  }, 300000);
});
