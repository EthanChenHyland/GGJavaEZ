import { ESLint } from 'eslint'
import { expect, test } from 'vitest'

/** Spec task 0.2 / INV-15 / R15: prove the architectural lint rules fire where intended. */
const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname })
async function rules(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((message) => message.ruleId)
}

test('generic modules cannot import the examples module, Theaters or demo data', async () => {
  expect(await rules("import { loadPersonTrace } from '../examples/traces'\nexport const x = loadPersonTrace", 'src/world/probe.ts')).toContain('no-restricted-imports')
  expect(await rules("import { createCuratedLayout } from '../examples/curatedLayout'\nexport const x = createCuratedLayout", 'src/scene/probe.ts')).toContain('no-restricted-imports')
  expect(await rules("import t from '../theater/array'\nexport const x = t", 'src/navigation/probe.ts')).toContain('no-restricted-imports')
  expect(await rules("import raw from '../examples/demos/person/person.trace.json'\nexport const x = raw", 'src/runtime/probe.ts')).toContain('no-restricted-imports')
})

test('the composition seam, the examples module and tests may use curated examples', async () => {
  expect(await rules("import { createCuratedLayout } from '../examples/curatedLayout'\nexport const x = createCuratedLayout", 'src/app/probe.ts')).not.toContain('no-restricted-imports')
  expect(await rules("import { loadPersonTrace } from './traces'\nexport const x = loadPersonTrace", 'src/examples/probe.ts')).not.toContain('no-restricted-imports')
  expect(await rules("import { loadPersonTrace } from '../examples/traces'\nexport const x = loadPersonTrace", 'src/world/probe.test.ts')).not.toContain('no-restricted-imports')
})

test('fixture names and curated coordinates are rejected in generic code, including src/app', async () => {
  for (const [code, file] of [
    ["export const label = 'Person #17'", 'src/world/probe.ts'],
    ["export const caption = `a > b → swap`", 'src/app/probe.ts'],
    ["export const isReader = (name: string) => name === 'java.util.Scanner'", 'src/runtime/probe.ts'],
    ["export const m = 'factorial'", 'src/motion/probe.ts'],
    ["export const p = [2.1, 2.18, -0.65]", 'src/scene/probe.ts'],
  ]) expect(await rules(code, file), code).toContain('visual-java/no-fixture-literals')
})

test('fixture words are matched as words, not substrings, and examples may name fixtures', async () => {
  expect(await rules("export const a = 'personal swapped Scanners'", 'src/world/probe.ts')).not.toContain('visual-java/no-fixture-literals')
  expect(await rules("export const label = 'Person'", 'src/examples/probe.ts')).not.toContain('visual-java/no-fixture-literals')
})
