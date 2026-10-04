import { describe, expect, test } from 'vitest';
import { assertBehavior } from './facts.mjs';
import { CASE_FILTER, JVM_ENABLED, inventory, recordProject } from './runner.mjs';
import { SHIFT, renameJava, semanticSignature, sourceLines } from './invariance.mjs';

const renames = {
  '01-static-initialization': { Meter: 'Gauge', Child: 'Derived', Hidden: 'Shadow', total: 'aggregate', token: 'handle', seed: 'initial', before: 'initialCount', after: 'finalCount', alias: 'sameHandle' },
  '03-reference-arrays': { Parcel: 'Packet', code: 'tag', parcel: 'packet', first: 'group', alias: 'sameGroup', selected: 'picked', objects: 'wideView', labels: 'titles', label: 'title' },
  '07-array-list': { Crate: 'Bundle', code: 'tag', one: 'alpha', two: 'beta', chosen: 'picked', list: 'sequence', checkpoint: 'observeBoundary' },
  '19-lambda-capture': { total: 'aggregate', accumulate: 'collect', multiplier: 'scale', values: 'inputs', value: 'operand', action: 'operation' },
};
const projects = (await inventory()).filter(project => renames[project.name] && (!CASE_FILTER || project.name.includes(CASE_FILTER)));

describe.skipIf(!JVM_ENABLED)('Phase 4 identifier and line invariance (lead serialized slot)', () => {
  test.each(projects)('$name preserves graph relationships after renaming and line shifts', async ({ name, projectDir, spec }) => {
    const runs = [];
    try {
      const base = await recordProject(projectDir, spec); runs.push(base); assertBehavior(base);
      const mapping = renames[name], undo = Object.fromEntries(Object.entries(mapping).map(([from, to]) => [to, from]));
      const renamed = await recordProject(projectDir, spec, { transform: source => renameJava(source, mapping) }); runs.push(renamed); assertBehavior(renamed);
      expect(semanticSignature(renamed, undo)).toEqual(semanticSignature(base));
      const shifted = await recordProject(projectDir, spec, { transform: source => SHIFT + source }); runs.push(shifted); assertBehavior(shifted);
      expect(semanticSignature(shifted)).toEqual(semanticSignature(base));
      const lines = SHIFT.split('\n').length - 1;
      expect(sourceLines(shifted)).toEqual(sourceLines(base).map(line => line + lines));
    } finally { for (const run of runs) run.history.dispose(); }
  }, 300000);
});
