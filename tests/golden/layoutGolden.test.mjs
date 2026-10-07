import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from '../../src/examples/traces.ts'
import { layoutForTrace } from '../../src/app/layoutForTrace.ts'

/**
 * Phase 0 (task 0.1) golden: moving curated layout code into src/examples must not
 * change any layout. Hashes were recorded from the pre-move `createLayout` for every
 * curated trace, as curated and as JVM-captured, over a set of prefixes.
 * Phase 5 deliberately replaces only generic JVM geography with Spatial 2.0.
 * Curated hashes remain the Phase 0 extraction baseline; these are presentation
 * snapshots, separate from execution/graph/history semantic goldens.
 * Regenerate only with an approved behaviour change: VJ_WRITE_GOLDEN=1.
 */
const goldenPath = new URL('./layoutGolden.json', import.meta.url)
const capture = { origin: 'jvm', sourceHashes: {}, recordedAt: '2026-09-30T00:00:00.000Z' }

function variants() {
  const result = []
  for (const [name, load] of [['person', loadPersonTrace], ['recursion', loadRecursionTrace],
    ['arrays', loadArrayTrace], ['control', loadControlTrace]]) {
    const trace = load()
    for (const [mode, doc] of [['curated', trace], ['jvm', { ...trace, capture }]]) {
      const cursors = new Set([1, Math.floor(trace.events.length / 3), Math.floor(trace.events.length / 2), trace.events.length])
      for (let cursor = 7; cursor < trace.events.length; cursor += 7) cursors.add(cursor)
      for (const cursor of [...cursors].sort((a, b) => a - b))
        result.push([`${name}:${mode}:${cursor}`, { ...doc, events: doc.events.slice(0, cursor) }])
    }
  }
  return result
}

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

describe('layout golden (curated extraction and Spatial 2.0 JVM geography)', () => {
  it('matches preserved curated and approved generic JVM layouts at every prefix', () => {
    const actual = Object.fromEntries(variants().map(([key, trace]) => [key, hash(layoutForTrace(trace))]))
    if (process.env.VJ_WRITE_GOLDEN === '1' || !existsSync(goldenPath)) {
      if (process.env.VJ_WRITE_GOLDEN !== '1') throw new Error('Missing layoutGolden.json; record it with VJ_WRITE_GOLDEN=1 from the pre-extraction code')
      writeFileSync(goldenPath, `${JSON.stringify(actual, null, 1)}\n`)
    }
    const expected = JSON.parse(readFileSync(goldenPath, 'utf8'))
    expect(Object.keys(actual).length).toBeGreaterThan(90)
    expect(actual).toEqual(expected)
  })
})
