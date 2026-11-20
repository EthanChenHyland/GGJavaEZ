import type { TraceEvent } from '../contracts/runtime'
import type { Vec3, WorldAnchor } from '../contracts/world'
import { world as worldTokens } from '../theme/tokens'
import type { WorldLayoutTokens } from './layoutEngine'

// Canonical, concrete standard collection classes only. This is a reservation
// policy, not evidence of recorded entries, collection size, or runtime ownership.
const collectionClasses: ReadonlySet<string> = new Set([
  'java.util.ArrayList',
  'java.util.LinkedList',
  'java.util.Vector',
  'java.util.Stack',
  'java.util.HashSet',
  'java.util.LinkedHashSet',
  'java.util.TreeSet',
  'java.util.HashMap',
  'java.util.LinkedHashMap',
  'java.util.TreeMap',
  'java.util.IdentityHashMap',
  'java.util.WeakHashMap',
  'java.util.PriorityQueue',
  'java.util.ArrayDeque',
  'java.util.concurrent.ConcurrentHashMap',
  'java.util.concurrent.ConcurrentSkipListMap',
  'java.util.concurrent.ConcurrentSkipListSet',
  'java.util.concurrent.ConcurrentLinkedQueue',
  'java.util.concurrent.ConcurrentLinkedDeque',
  'java.util.concurrent.CopyOnWriteArrayList',
  'java.util.concurrent.CopyOnWriteArraySet',
  'java.util.concurrent.ArrayBlockingQueue',
  'java.util.concurrent.LinkedBlockingQueue',
  'java.util.concurrent.LinkedBlockingDeque',
  'java.util.concurrent.PriorityBlockingQueue',
  'java.util.concurrent.DelayQueue',
  'java.util.concurrent.SynchronousQueue',
  'java.util.concurrent.LinkedTransferQueue',
])

/** First-allocation geometry only (design 7.2/7.3, requirements 11.4/11.5).
 * `kind` selects reservation geometry; it does not create runtime collection facts.
 * Library routing and ordinary-object compaction belong to the layout caller.
 */
export function firstObjectPresentation(
  event: Extract<TraceEvent, { type: 'ALLOCATE_OBJECT' | 'ALLOCATE_ARRAY' }>,
  tokens: WorldLayoutTokens = worldTokens,
): { kind: 'object' | 'array' | 'collection'; projectData: boolean; size: Vec3 } {
  const isArray = event.type === 'ALLOCATE_ARRAY'
  const isCollection = !isArray && collectionClasses.has(event.className)
  const isString = !isArray && (event.className === 'java.lang.String' || event.className === 'String')
  const projectData = event.metadata?.ownership === 'PROJECT'
    || (isArray || isCollection || isString) && !!event.source

  if (isArray) {
    const count = event.length ?? event.elements.length
    const cols = Math.max(tokens.array.cellsPerRowMin, Math.min(tokens.array.cellsPerRowMax, count))
    const cellRows = count > 128 ? 8 : Math.ceil(count / cols)
    return { kind: 'array', projectData, size: [
      Math.max(tokens.object.w, cols * (tokens.array.cell + tokens.array.gap) - tokens.array.gap),
      tokens.array.titlePlate + (cellRows ? cellRows * (tokens.array.cell + tokens.array.gap) + tokens.array.indexLabel : .45),
      tokens.array.cell + tokens.array.backplate,
    ] }
  }

  if (isCollection) {
    return { kind: 'collection', projectData, size: [
      tokens.object.w,
      tokens.object.header + tokens.collection.sizeRow + (tokens.collection.rows + 1) * tokens.collection.pitch + tokens.object.pad,
      tokens.object.depth,
    ] }
  }

  const groups = new Set(event.fields.map(slot => slot.declaringClass).filter(Boolean)).size
  return { kind: 'object', projectData, size: [
    tokens.object.w,
    tokens.object.header + tokens.object.pad + tokens.object.row * Math.min(event.fields.length, 13) + .6 * groups,
    tokens.object.depth,
  ] }
}

/** Region alone does not imply a compact face: arrays and known collection
 * types reserve their full structural body even before contents are observed. */
export function compactLibraryFace(anchor: Pick<WorldAnchor, 'region' | 'size'>, tokens: WorldLayoutTokens = worldTokens): boolean {
  return anchor.region === 'library' && anchor.size[0] === tokens.object.libraryW
    && anchor.size[1] === 2.4 && anchor.size[2] === 1.6
}
