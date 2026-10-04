import { expect, it } from 'vitest'
import { persistentRecord, persistentPut, persistentDelete, persistentArray, persistentAppend, persistentSet, persistentPop } from './storage'
it('retains Record enumeration and JSON semantics across insert/update/delete/reinsert', () => {
  let record = persistentRecord<number>({ a: 1, b: 2 })
  const old = record
  record = persistentPut(record, 'a', 3)
  record = persistentDelete(record, 'b')
  record = persistentPut(record, 'b', 4)
  expect(Object.keys(record)).toEqual(['a', 'b'])
  expect(JSON.stringify(record)).toBe('{"a":3,"b":4}')
  expect(old).toEqual({ a: 1, b: 2 })
  expect(() => { record.a = 9 }).toThrow('immutable')
  expect(() => Reflect.deleteProperty(record, 'a')).toThrow('immutable')
  const nullable = persistentRecord<number | null>({ '12': 12, a: null, '2': 2 })
  expect(nullable.a).toBeNull()
  expect(Object.keys(nullable)).toEqual(['2', '12', 'a'])
  expect(JSON.stringify(nullable)).toBe('{"2":2,"12":12,"a":null}')
})
it('retains arrays across radix levels, replacement and pop without mutating saved roots', () => {
  let vector = persistentArray<number>([])
  const saved = []
  for (let index = 0; index < 1100; index++) {
    vector = persistentAppend(vector, index)
    if (index === 31 || index === 1023) saved.push(vector)
  }
  expect(Array.isArray(vector)).toBe(true)
  expect(vector.slice(1020, 1028)).toEqual([1020,1021,1022,1023,1024,1025,1026,1027])
  vector = persistentSet(vector, 1024, -1)
  vector = persistentPop(vector)
  expect(vector.length).toBe(1099)
  expect(vector[1024]).toBe(-1)
  expect(saved.map(root => root.length)).toEqual([32,1024])
  expect(saved[1][1023]).toBe(1023)
  expect(saved[0][32]).toBeUndefined()
  expect(saved[0][64]).toBeUndefined()
  expect(Object.getOwnPropertyDescriptor(vector, 'length')?.value).toBe(1099)
  expect(JSON.parse(JSON.stringify(vector))).toEqual(Array.from(vector))
  expect(() => vector.push(4)).toThrow('immutable')
})
it('preserves distinct keys with an exact 32-bit hash collision through updates and deletion', () => {
  const left = 'slot:3hr:566548867', right = 'slot:2n9d:318972845'
  const first = persistentRecord({ [left]: 1, [right]: 2, unrelated: 3 })
  const second = persistentPut(first, right, 4)
  const third = persistentDelete(second, left)
  const fourth = persistentPut(third, left, 5)
  expect(first).toEqual({ [left]: 1, [right]: 2, unrelated: 3 })
  expect(second[left]).toBe(1)
  expect(second[right]).toBe(4)
  expect(third[left]).toBeUndefined()
  expect(Object.keys(fourth)).toEqual([right, 'unrelated', left])
  expect(fourth[left]).toBe(5)
})
it('keeps saved roots equal to ordinary records during seeded mixed updates', () => {
  let record = persistentRecord<number>({}), seed = 42
  const oracle: Record<string, number> = {}
  const saved: Array<{ record: Record<string, number>; oracle: Record<string, number> }> = []
  for (let i = 0; i < 2500; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const key = i % 3 ? `value:${seed % 300}` : String(seed % 300)
    if (seed % 7 === 0) { record = persistentDelete(record, key); delete oracle[key] }
    else { record = persistentPut(record, key, i); oracle[key] = i }
    if (i % 100 === 0) saved.push({ record, oracle: { ...oracle } })
  }
  for (const snapshot of [...saved, { record, oracle }]) {
    expect(Object.keys(snapshot.record)).toEqual(Object.keys(snapshot.oracle))
    expect(JSON.stringify(snapshot.record)).toBe(JSON.stringify(snapshot.oracle))
  }
})
