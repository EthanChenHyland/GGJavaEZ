import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

test('generic provenance accepts bytecode identities rather than label/name/source correlations', async () => {
  const contracts = await readFile('src/contracts/executionGraph.ts', 'utf8');
  const origins = contracts.slice(contracts.indexOf('export type ValueOrigin'), contracts.indexOf('export type Evidence'));
  expect(origins).toContain("kind: 'local'; slotId: string");
  expect(origins).not.toMatch(/\b(name|label|line|source)\s*:/);
  const motion = await readFile('src/motion/semanticTransition.ts', 'utf8');
  expect(motion).not.toContain('correlatedSource');
  expect(motion).not.toMatch(/candidate\.name\s*===\s*destinationName/);
  const state = await readFile('src/runtime/state.ts', 'utf8');
  expect(state).not.toContain('eslint-disable visual-java/no-fixture-literals');
  expect(state).not.toContain("reader.className) &&");
  expect(state).not.toContain("'java.util.Scanner'");
});
