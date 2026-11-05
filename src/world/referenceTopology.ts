import type {
  ArrayWindow, PresentedCluster, PresentedEntity, SceneEntity, SceneModel,
  SceneReference, Vec3, WorldAnchor,
} from '../contracts/world'
import { faceRows,faceRowPort,faceRowPosition } from './faceRows'
import {collectionEntryFace} from './collectionFace'
import {arrayReferenceChipPort,collectionReferenceChipPort} from './structureValueChipGeometry'

export interface ReferenceTopologyInput {
  scene: SceneModel
  entities: ReadonlyMap<string, PresentedEntity>
  clusters: readonly PresentedCluster[]
  cellWindows: ReadonlyMap<string, ArrayWindow>
  individualLimit: number
  mandatoryIds: ReadonlySet<string>
  priorityIds?: ReadonlySet<string>
  enabled?: boolean
  references?: readonly SceneReference[]
  historical?: boolean
}
export interface IndividualReference {
  reference: SceneReference
  sourcePoint: Vec3
  destinationPoint: Vec3
  sourceAnchor: WorldAnchor
  destinationAnchor: WorldAnchor
}
export interface ReferenceBundle {
  id: string
  from: string
  to: string
  sourcePoint: Vec3
  destinationPoint: Vec3
  sourceAnchor: WorldAnchor
  destinationAnchor: WorldAnchor
  references: readonly SceneReference[]
  count: number
}
export interface UnavailableReference { reference: SceneReference; reason: string }
export interface InternalReference { reference: SceneReference; clusterId: string }
export interface ReferenceTopology {
  individual: readonly IndividualReference[]
  bundles: readonly ReferenceBundle[]
  unavailable: readonly UnavailableReference[]
  internal: readonly InternalReference[]
  scopeExcluded: readonly SceneReference[]
  counts: {
    current: number
    drawable: number
    individual: number
    bundled: number
    bundleCurves: number
    unavailable: number
    internal: number
    scopeExcluded: number
  }
}

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const validPoint = (point: Vec3 | null | undefined): point is Vec3 =>
  !!point && point.length === 3 && point.every(Number.isFinite)
const validAnchor = (anchor: WorldAnchor): boolean => validPoint(anchor.position)
  && validPoint(anchor.size) && anchor.size.every(size => size > 0)

/** The actual array solid is its title plate, not its reserved cell envelope.
 * These dimensions match SolidBatch/buildSolidBatch; no canonical anchor changes.
 */
function representedBody(node: SceneEntity): WorldAnchor {
  if (node.kind !== 'array') return node.anchor
  const [x, y, z] = node.anchor.position
  const position: Vec3 = [x, y + node.anchor.size[1] / 2 - .45, z]
  return { ...node.anchor, position, size: [node.anchor.size[0], .9, .12],
    ports: {}, bodyPort: [position[0], position[1], z + .06] }
}

/** Stable tie order: +X, -X, +Y, -Y, +Z, -Z. Distance is measured to
 * the face centre before a .06-unit outward normal offset is applied.
 */
function nearestFace(anchor: WorldAnchor, origin: Vec3): Vec3 {
  let best: Vec3 = anchor.position, minimum = Infinity
  for (const axis of [0, 1, 2] as const) for (const sign of [1, -1]) {
    const centre = [...anchor.position] as [number, number, number]
    centre[axis] += sign * anchor.size[axis] / 2
    const distance = centre.reduce((sum, value, index) => sum + (value - origin[index]) ** 2, 0)
    if (distance < minimum) {
      minimum = distance
      centre[axis] += sign * .06
      best = centre
    }
  }
  return best
}

interface Endpoint { id: string; anchor: WorldAnchor; collapsed: boolean }
interface Candidate extends IndividualReference { from: Endpoint; to: Endpoint }
type SourcePort = { point: Vec3; anchor: WorldAnchor } | { reason: string }

/** Pure current-reference partition over the already chosen presentation cut.
 * Mandatory admission applies only to proven individual candidates. A mandatory
 * reference with a collapsed endpoint remains structural; an absent port remains
 * unavailable. Neither case manufactures a semantic port or expands the cut.
 */
export function buildReferenceTopology(input: ReferenceTopologyInput): ReferenceTopology {
  if (!Number.isSafeInteger(input.individualLimit) || input.individualLimit < 0)
    throw new RangeError('individualLimit must be a non-negative safe integer')
  const { scene, entities, cellWindows } = input
  const references = [...(input.references??scene.references)].sort((a, b) => compareId(a.id, b.id))
  const seen = new Set<string>()
  for (const reference of references) {
    if (seen.has(reference.id)) throw new Error(`Duplicate current reference ID: ${reference.id}`)
    seen.add(reference.id)
  }
  const unavailable: UnavailableReference[] = [], internal: InternalReference[] = []
  const scopeExcluded = input.enabled === false ? references : []
  const individual: IndividualReference[] = [], bundles: ReferenceBundle[] = []
  if (input.enabled !== false) {
    const membership = new Map<string, PresentedCluster>()
    for (const cluster of input.clusters) for (const member of cluster.memberIds) {
      if (entities.has(member) || membership.has(member))
        throw new Error(`Presentation cut counts a member more than once: ${member}`)
      membership.set(member, cluster)
    }
    const endpoint = (id: string): Endpoint | undefined => {
      const node = scene.entities[id]
      if (!node) return undefined
      const cluster = membership.get(id)
      if (cluster) return { id: cluster.id, anchor: cluster.anchor, collapsed: true }
      return entities.has(id) ? { id, anchor: representedBody(node), collapsed: false } : undefined
    }
    // Visibility is cached per source entity, not searched again for every slot.
    const visibleRows = new Map<string, ReadonlySet<string>>()
    const faceModels = new Map<string, ReturnType<typeof faceRows>>()
    const collectionPorts = new Map<string, ReadonlyMap<string, Vec3 | null | undefined>>()
    const sourcePort = (reference: SceneReference, source: Endpoint): SourcePort => {
      const node = scene.entities[reference.sourceId], presented = entities.get(node.id)!
      if (presented.mode !== 'detailed') return { reason: 'Source has no visible rows in quiet presentation' }
      if (node.kind === 'array') {
        const window = cellWindows.get(node.id)
        if (!window || window.recordingId !== scene.recordingId || window.arrayId !== node.id)
          return { reason: 'Source array has no current presented cell window' }
        const cell = window.mapping.get(reference.sourceSlotId)
        if (!cell) return { reason: 'Source array cell is hidden in the current window' }
        if (!validPoint(cell.port) || !validAnchor(cell.anchor))
          return { reason: 'Source array cell has no valid presented geometry or port' }
        return { point: input.historical?cell.port:arrayReferenceChipPort(cell.anchor), anchor: cell.anchor }
      }
      let visible = visibleRows.get(node.id)
      if (!visible) {
        const model=faceRows(node,presented)
        faceModels.set(node.id,model)
        visible = new Set(model.visible.map(row => row.slotId))
        visibleRows.set(node.id, visible)
      }
      if (node.kind === 'collection') {
        let ports = collectionPorts.get(node.id)
        if (!ports) {
          const entries = new Map<string, Vec3 | null | undefined>()
          for (const [index,entry] of node.entries.entries()) if (visible.has(entry.slotId)) {
            // An ended binding may have a current null/scalar chip. Its actual
            // visible geometry is still a source; retired/hidden chips are not.
            const geometry=input.historical?collectionEntryFace(node.anchor,index,node.collectionKind==='Map'):null
            entries.set(entry.slotId, input.historical?geometry?.value:entry.port?collectionReferenceChipPort(node.anchor,index,node.collectionKind==='Map'):null)
            if (entry.keySlotId !== undefined) entries.set(entry.keySlotId, input.historical?geometry?.key:entry.keyPort?collectionReferenceChipPort(node.anchor,index,node.collectionKind==='Map',true):null)
          }
          ports = entries
          collectionPorts.set(node.id, ports)
        }
        if (!ports.has(reference.sourceSlotId)) return { reason: 'Source collection entry is not in the visible face rows' }
        const point = ports.get(reference.sourceSlotId)
        return validPoint(point) ? { point, anchor: source.anchor } : { reason: 'Source collection entry has no recorded port' }
      }
      if (!visible.has(reference.sourceSlotId)) return { reason: 'Source slot is not in the visible face rows' }
      // Trace All attaches an ended binding to captured storage geometry even
      // when its current value is null. This does not restore a live value port.
      const rowPoint = input.historical ? faceRowPosition : faceRowPort
      const point = rowPoint(node,presented,reference.sourceSlotId,faceModels.get(node.id)!)
      return validPoint(point) ? { point, anchor: source.anchor } : { reason: 'Visible source slot has no recorded port' }
    }
    const candidates: Candidate[] = []
    for (const reference of references) {
      const from = endpoint(reference.sourceId), to = endpoint(reference.targetId)
      if (!from || !to) {
        unavailable.push({ reference, reason: !from ? 'Source has no current presented entity or cluster geometry' : 'Destination has no current presented entity or cluster geometry' })
        continue
      }
      if (from.collapsed && to.collapsed && from.id === to.id) {
        internal.push({ reference, clusterId: from.id })
        continue
      }
      if (!validAnchor(from.anchor) || !validAnchor(to.anchor)) {
        unavailable.push({ reference, reason: !validAnchor(from.anchor) ? 'Source represented cuboid geometry is invalid' : 'Destination represented cuboid geometry is invalid' })
        continue
      }
      const port = from.collapsed ? { point: nearestFace(from.anchor, to.anchor.position), anchor: from.anchor } : sourcePort(reference, from)
      if ('reason' in port) { unavailable.push({ reference, reason: port.reason }); continue }
      candidates.push({ reference, from, to, sourcePoint: port.point, sourceAnchor: port.anchor,
        destinationPoint: nearestFace(to.anchor, port.point), destinationAnchor: to.anchor })
    }
    const rank = (a: Candidate, b: Candidate) =>
      Number(input.mandatoryIds.has(b.reference.id)) - Number(input.mandatoryIds.has(a.reference.id))
      || Number(input.priorityIds?.has(b.reference.id) ?? false) - Number(input.priorityIds?.has(a.reference.id) ?? false)
      || (b.reference.evidence.changedSeq ?? -1) - (a.reference.evidence.changedSeq ?? -1)
      || compareId(a.reference.id, b.reference.id)
    const eligible = candidates.filter(item => !item.from.collapsed && !item.to.collapsed).sort(rank)
    const mandatoryCount = eligible.filter(item => input.mandatoryIds.has(item.reference.id)).length
    for (const candidate of eligible.slice(0, Math.max(input.individualLimit, mandatoryCount))) {
      const { reference, sourcePoint, destinationPoint, sourceAnchor, destinationAnchor } = candidate
      individual.push({ reference, sourcePoint, destinationPoint, sourceAnchor, destinationAnchor })
    }
    const emitted = new Set(individual.map(item => item.reference.id))
    const groups = new Map<string, { from: Endpoint; to: Endpoint; references: SceneReference[] }>()
    for (const candidate of candidates) {
      if (emitted.has(candidate.reference.id)) continue
      const id = `presentation:${input.historical?'binding-history':'reference'}-bundle:${JSON.stringify([scene.recordingId, candidate.from.id, candidate.to.id])}`
      const group = groups.get(id) ?? { from: candidate.from, to: candidate.to, references: [] }
      group.references.push(candidate.reference)
      groups.set(id, group)
    }
    for (const [id, group] of [...groups].sort(([a], [b]) => compareId(a, b))) {
      const sourceAnchor = group.from.anchor, destinationAnchor = group.to.anchor
      bundles.push({ id, from: group.from.id, to: group.to.id, sourceAnchor, destinationAnchor,
        sourcePoint: nearestFace(sourceAnchor, destinationAnchor.position),
        destinationPoint: nearestFace(destinationAnchor, sourceAnchor.position),
        references: group.references, count: group.references.length })
    }
  }
  const bundled = bundles.reduce((sum, bundle) => sum + bundle.references.length, 0)
  return { individual, bundles, unavailable, internal, scopeExcluded,
    counts: { current: references.length, drawable: individual.length + bundled,
      individual: individual.length, bundled, bundleCurves: bundles.length,
      unavailable: unavailable.length, internal: internal.length, scopeExcluded: scopeExcluded.length } }
}
