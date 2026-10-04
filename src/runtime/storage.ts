/** Persistent hash trie records and radix vectors with existing Record/Array facades.
 * Updating a collection copies only its changed path, never the entity/history prefix.
 * Facades reject writes in every build; newly created semantic values are frozen.
 * Use JSON serialization for wire transfer: these internal proxies are not structured-cloneable.
 */
type Node<T> = { children?: Node<T>[]; value?: T }
const BITS = 5
const WIDTH = 32
function get<T>(root: Node<T>, index: number, depth: number): T | undefined {
  let node: Node<T> | undefined = root
  for (let level = depth; level > 0 && node; level--) node = node.children?.[Math.floor(index / WIDTH ** level) % WIDTH]
  return node?.children?.[index % WIDTH]?.value
}
function put<T>(root: Node<T>, index: number, depth: number, value: T): Node<T> {
  const children = root.children?.slice() ?? []
  const digit = Math.floor(index / WIDTH ** depth) % WIDTH
  children[digit] = depth === 0 ? { value } : put(children[digit] ?? {}, index, depth - 1, value)
  return { children }
}
interface Vector<T> { root: Node<T>; length: number; depth: number }
function vectorPut<T>(vector: Vector<T>, index: number, value: T): Vector<T> {
  let { root, depth } = vector
  while (index >= WIDTH ** (depth + 1)) { root = { children: [root] }; depth++ }
  return { root: put(root, index, depth, value), depth, length: Math.max(vector.length, index + 1) }
}
function reject(): never { throw new TypeError('Runtime snapshots are immutable') }
const immutable = { set: reject, deleteProperty: reject, defineProperty: reject, setPrototypeOf: reject, preventExtensions: reject }
const vectors = new WeakMap<object, Vector<unknown>>()
const records = new WeakMap<object, PersistentRecord<unknown>>()
function numericKey(key: PropertyKey): number | null {
  if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return null
  const index = Number(key)
  return Number.isSafeInteger(index) ? index : null
}
function vectorFacade<T>(vector: Vector<T>): T[] {
  const target: T[] = []
  // Keep the actual backing array empty. Setting its length on every append can
  // allocate O(length) hole storage in V8, despite the persistent radix data.
  const proxy = new Proxy(target, {
    ...immutable,
    get(target, key, receiver) {
      if (key === 'length') return vector.length
      const index = numericKey(key)
      return index !== null ? index < vector.length ? get(vector.root, index, vector.depth) : undefined : Reflect.get(target, key, receiver)
    },
    has(target, key) { const index = numericKey(key); return index !== null ? index < vector.length : Reflect.has(target, key) },
    ownKeys() { return [...Array.from({ length: vector.length }, (_, i) => String(i)), 'length'] },
    getOwnPropertyDescriptor(target, key) {
      // The target's length is writable/nonconfigurable, so this compatible
      // descriptor can expose virtual length without allocating backing holes.
      if (key === 'length') return { ...Reflect.getOwnPropertyDescriptor(target, key)!, value: vector.length }
      const index = numericKey(key)
      return index !== null && index < vector.length
        ? { value: get(vector.root, index, vector.depth), enumerable: true, configurable: true, writable: false }
        : Reflect.getOwnPropertyDescriptor(target, key)
    },
  })
  vectors.set(proxy, vector)
  return proxy
}
function vectorOf<T>(array: T[]): Vector<T> {
  const existing = vectors.get(array)
  if (existing) return existing as Vector<T>
  let vector: Vector<T> = { root: {}, depth: 0, length: 0 }
  for (const value of array) vector = vectorPut(vector, vector.length, freezeValue(value))
  return vector
}
export function persistentAppend<T>(array: T[], value: T): T[] {
  const vector = vectorOf(array)
  return vectorFacade(vectorPut(vector, vector.length, freezeValue(value)))
}
export function persistentSet<T>(array: T[], index: number, value: T): T[] {
  return vectorFacade(vectorPut(vectorOf(array), index, freezeValue(value)))
}
export function persistentArray<T>(array: T[]): T[] { return vectors.has(array) ? array : vectorFacade(vectorOf(array)) }
export function persistentPop<T>(array: T[]): T[] {
  const vector = vectorOf(array)
  if (vector.length === 0) return array
  // Clear the removed leaf so popped stack entries are not retained by future heads.
  const shorter = vectorPut(vector, vector.length - 1, undefined as T)
  return vectorFacade({ ...shorter, length: Math.max(0, vector.length - 1) })
}
interface Entry<T> { key: string; hash: number; value: T | undefined; ordinal: number }
type HashNode<T> = Entry<T> | { bitmap: number; branches: HashNode<T>[] } | { collisions: Entry<T>[] }
interface PersistentRecord<T> { root: HashNode<T> | undefined; keys: Vector<string> }
function hash(key: string): number {
  let result = 2166136261
  for (let i = 0; i < key.length; i++) result = Math.imul(result ^ key.charCodeAt(i), 16777619)
  return result >>> 0
}
function popcount(bits: number): number {
  bits -= (bits >>> 1) & 0x55555555
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333)
  return (((bits + (bits >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}
/** Packed branches allocate no holes and stop at the first unique hash prefix.
 * Full 32-bit collisions retain keys, never equate distinct keys by their hash.
 */
function hashEntry<T>(node: HashNode<T> | undefined, key: string, hashed: number): Entry<T> | undefined {
  let shift = 0
  while (node && 'bitmap' in node) {
    const bit = 1 << ((hashed >>> shift) & 31)
    if (!(node.bitmap & bit)) return undefined
    node = node.branches[popcount(node.bitmap & (bit - 1))]
    shift += BITS
  }
  return node && ('key' in node ? node.key === key ? node : undefined : node.collisions.find(entry => entry.key === key))
}
function hashPut<T>(node: HashNode<T> | undefined, entry: Entry<T>, shift = 0): HashNode<T> {
  if (!node) return entry
  if ('bitmap' in node) {
    const bit = 1 << ((entry.hash >>> shift) & 31)
    const index = popcount(node.bitmap & (bit - 1)), branches = node.branches.slice()
    if (node.bitmap & bit) branches[index] = hashPut(branches[index], entry, shift + BITS)
    else branches.splice(index, 0, entry)
    return { bitmap: node.bitmap | bit, branches }
  }
  if ('key' in node && node.key === entry.key) return entry
  const hashed = 'key' in node ? node.hash : node.collisions[0].hash
  if (hashed === entry.hash) return { collisions: [...('key' in node ? [node] : node.collisions).filter(item => item.key !== entry.key), entry] }
  const priorDigit = (hashed >>> shift) & 31, nextDigit = (entry.hash >>> shift) & 31
  return priorDigit === nextDigit
    ? { bitmap: 1 << priorDigit, branches: [hashPut(node, entry, shift + BITS)] }
    : { bitmap: (1 << priorDigit) | (1 << nextDigit), branches: priorDigit < nextDigit ? [node, entry] : [entry, node] }
}
function recordEntry<T>(record: PersistentRecord<T>, key: string): Entry<T> | undefined { return hashEntry(record.root, key, hash(key)) }
function recordGet<T>(record: PersistentRecord<T>, key: string): T | undefined { return recordEntry(record, key)?.value }
function recordPut<T>(record: PersistentRecord<T>, key: string, value: T | undefined): PersistentRecord<T> {
  const index = hash(key)
  const previous = hashEntry(record.root, key, index)
  const exists = previous?.value !== undefined
  const next = { key, hash: index, value: freezeValue(value), ordinal: exists ? previous!.ordinal : record.keys.length }
  return { root: hashPut(record.root, next),
    keys: !exists && value !== undefined ? vectorPut(record.keys, record.keys.length, key) : record.keys }
}
function recordKeys<T>(record: PersistentRecord<T>): string[] {
  const result: string[] = [], integers: string[] = []
  for (let i = 0; i < record.keys.length; i++) {
    const key = get(record.keys.root, i, record.keys.depth)!
    const entry = recordEntry(record, key)
    if (entry?.value !== undefined && entry.ordinal === i) {
      const index = numericKey(key)
      if (index !== null && index < 4294967295) integers.push(key)
      else result.push(key)
    }
  }
  return integers.length ? [...integers.sort((a, b) => Number(a) - Number(b)), ...result] : result
}
function recordFacade<T>(record: PersistentRecord<T>): Record<string, T> {
  const proxy = new Proxy({} as Record<string, T>, {
    ...immutable,
    get(target, key, receiver) {
      const value = typeof key === 'string' ? recordGet(record, key) : undefined
      return value !== undefined ? value : Reflect.get(target, key, receiver)
    },
    has(target, key) { return typeof key === 'string' && recordGet(record, key) !== undefined || Reflect.has(target, key) },
    ownKeys() { return recordKeys(record) },
    getOwnPropertyDescriptor(_target, key) {
      const value = typeof key === 'string' ? recordGet(record, key) : undefined
      return value === undefined ? undefined : { value, enumerable: true, configurable: true, writable: false }
    },
  })
  records.set(proxy, record)
  return proxy
}
function recordOf<T>(record: Record<string, T>): PersistentRecord<T> {
  const existing = records.get(record)
  if (existing) return existing as PersistentRecord<T>
  let result: PersistentRecord<T> = { root: undefined, keys: { root: {}, depth: 0, length: 0 } }
  for (const [key, value] of Object.entries(record)) result = recordPut(result, key, value)
  return result
}
export function persistentRecord<T>(record: Record<string, T>): Record<string, T> { return records.has(record) ? record : recordFacade(recordOf(record)) }
export function persistentPut<T>(record: Record<string, T>, key: string, value: T): Record<string, T> {
  return recordFacade(recordPut(recordOf(record), key, value))
}
export function persistentDelete<T>(record: Record<string, T>, key: string): Record<string, T> {
  return recordFacade(recordPut(recordOf(record), key, undefined))
}
/** Walk only new branches: frozen values and persistent collection roots are boundaries. */
export function freezeValue<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value) && !vectors.has(value) && !records.has(value)) {
    for (const child of Object.values(value)) freezeValue(child)
    Object.freeze(value)
  }
  return value
}

/** Import an untrusted mutable event once; never duplicate persistent snapshot collections. */
export function immutableEvent<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  const copy = Array.isArray(value) ? value.map(item => immutableEvent(item))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableEvent(item)]))
  return freezeValue(copy) as T
}
