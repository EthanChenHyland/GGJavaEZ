import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import visualJava from './eslint/visual-java-rules.js'

/** Generic runtime modules: everything under src/ except the curated examples module and
 * the composition layer (src/app/ selects examples through one seam: layoutForTrace/catalog). */
const genericSources = ['src/**/*.{ts,tsx}']
const exemptFromBoundary = ['src/examples/**', 'src/theater/**', 'src/app/**', 'src/main.tsx', 'src/**/*.test.{ts,tsx}', 'src/testing/**']

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // INV-15 / R15.1: generic modules never import curated examples or specialized Theaters.
    files: genericSources,
    ignores: exemptFromBoundary,
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/examples', '**/examples/*', '**/examples/**'], message: 'Generic runtime code must not import src/examples (INV-15). Compose curated behaviour in src/app/.' },
        { group: ['**/theater', '**/theater/*', '**/theater/**'], message: 'Generic Spatial must not depend on a specialized Theater (R16.2).' },
        { group: ['**/demos/**'], message: 'Curated fixture data belongs to src/examples (INV-15).' },
      ] }],
    },
  },
  {
    // R15.2: no fixture names or hand-tuned fixture coordinates in generic runtime code.
    // The composition layer (src/app) is included: it renders generic runtime chrome too.
    files: genericSources,
    ignores: ['src/examples/**', 'src/theater/**', 'src/**/*.test.{ts,tsx}', 'src/testing/**'],
    plugins: { 'visual-java': visualJava },
    rules: { 'visual-java/no-fixture-literals': 'error' },
  },
)
