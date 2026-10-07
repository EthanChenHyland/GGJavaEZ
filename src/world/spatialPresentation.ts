import type { Selection } from '../contracts/interaction'
import { sceneSourceId } from '../contracts/world'
import type { TraceEvent } from '../contracts/runtime'
import type { DetailLevel, SceneArrayCell, SceneClassNode, SceneFrameNode, SceneModel, SceneObjectNode, Vec3, WorldAnchor, WorldBounds } from '../contracts/world'
import type { FlowEndpoint, SemanticTransition } from '../motion/semanticTransition'

export type PresentationNode = SceneFrameNode | SceneObjectNode | SceneClassNode
export type FlowDisplay = 'relevant' | 'current' | 'all'
export const spatialBudgets = {
  macro: { frames: 6, objects: 6, classes: 2, clusters: 20, references: 12, calls: 8, flows: 6, picking: 16, cells: 8, quiet: 0 },
  meso: { frames: 12, objects: 16, classes: 4, clusters: 12, references: 32, calls: 20, flows: 12, picking: 40, cells: 48, quiet: 512 },
  micro: { frames: 24, objects: 32, classes: 8, clusters: 4, references: 64, calls: 40, flows: 20, picking: 64, cells: 128, quiet: 256 },
} as const
export const homeGroupBudget = 12
export const homeExternalGroupBudget = 2
export const focusReferenceBudget = 6

export interface SpatialCluster {
  id: string
  kind: PresentationNode['kind']
  label: string
  /** Counts include detailed members; quietCount explicitly reports aggregation. */
  count: number
  quietCount: number
  anchor: WorldAnchor
  representative: PresentationNode
  body: boolean
}
export interface SpatialPresentation {
  scene: SceneModel
  quiet: PresentationNode[]
  quietVolumes: PresentationNode[]
  pickableQuiet: PresentationNode[]
  clusters: SpatialCluster[]
  labelledClusters: SpatialCluster[]
  priorityIds: ReadonlySet<string>
  faceIds: ReadonlySet<string>
  selectedIds: ReadonlySet<string>
  cellWindows: ReadonlyMap<string, SceneArrayCell[]>
  flows: SemanticTransition[]
  /** Full identities stay in sceneModel; these are bounded collision geometry. */
  geometryScene: SceneModel
  /** Camera-independent overview of actual cluster representatives, never relayout. */
  homeBounds: WorldBounds | undefined
  homeScene: SceneModel
}
export interface SpatialPresentationOptions {
  detailLevel?: DetailLevel
  event?: TraceEvent | null
  transition?: SemanticTransition | null
  flowHistory?: readonly SemanticTransition[]
  flowDisplay?: FlowDisplay
  selectedFlowId?: string | null
  viewTarget?: Vec3
  viewPosition?: Vec3
  focus?: boolean
}

function sourceId(edge: SceneModel['references'][number]): string {
  return sceneSourceId(edge.source)
}

/** Bounds describe only real reserved cuboids. No camera-dependent coordinates. */
export function presentationBounds(anchors: readonly WorldAnchor[], includePoints = true): WorldBounds | undefined {
  if (!anchors.length) return undefined
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const points: Vec3[] = []
  for (const anchor of anchors) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], anchor.position[axis] - anchor.size[axis] / 2)
      max[axis] = Math.max(max[axis], anchor.position[axis] + anchor.size[axis] / 2)
    }
    if (includePoints) for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([
      anchor.position[0] + x * anchor.size[0] / 2,
      anchor.position[1] + y * anchor.size[1] / 2,
      anchor.position[2] + z * anchor.size[2] / 2,
    ])
  }
  return { center: min.map((value, axis) => (value + max[axis]) / 2) as unknown as Vec3,
    size: min.map((value, axis) => max[axis] - value) as unknown as Vec3, ...(includePoints ? { points } : {}) }
}

function rows(node: PresentationNode) {
  return node.kind === 'frame' ? node.slots : node.kind === 'object' && node.array ? [...node.fields, ...node.array.cells] : node.fields
}

/** Caller ancestry is memoized once per planning pass, including recursive chains.
 * Branch IDs come from observed caller IDs, never invocation labels. */
function invocationBranches(frames: readonly SceneFrameNode[]): Map<string, string> {
  const byId = new Map(frames.map(node => [node.id, node]))
  const roots = new Map<string, string>()
  const branches = new Map<string, string>()
  for (const frame of frames) {
    const path: SceneFrameNode[] = []
    const seen = new Set<string>()
    let current: SceneFrameNode | undefined = frame
    while (current && !roots.has(current.id) && !seen.has(current.id)) {
      seen.add(current.id)
      path.push(current)
      current = current.callerFrameId ? byId.get(current.callerFrameId) : undefined
    }
    for (let index = path.length - 1; index >= 0; index--) {
      const node = path[index]
      const parent = node.callerFrameId ? byId.get(node.callerFrameId) : undefined
      const root = parent && roots.get(parent.id) || node.id
      roots.set(node.id, root)
      branches.set(node.id, parent && parent.id !== root ? branches.get(parent.id) ?? node.id : node.id)
    }
  }
  return branches
}

/** Pure representation planner. Never edits records, ports, cells or anchors.
 * Selection/current context wins within strict budgets; a large fan-in cannot
 * turn a protected-neighbor list into unlimited face text or raycasting. */
export function planSpatialPresentation(catalog: SceneModel, selection: Selection, options: SpatialPresentationOptions = {}): SpatialPresentation {
  const level = options.detailLevel ?? catalog.detailLevel
  const budget = spatialBudgets[level]
  const io = catalog.io?.slice(0, 3)
  const nodes: PresentationNode[] = [...catalog.frames, ...catalog.objects, ...(catalog.classes ?? [])]
  const byId = new Map(nodes.map(node => [node.id, node]))
  // Only selected/current/flow endpoints need slot ownership. Avoid a second
  // complete slot catalog in memory for a dense runtime.
  const wantedSlots = new Set<string>()
  if (selection?.kind === 'slot') wantedSlots.add(selection.id)
  const selectedFlow = options.selectedFlowId ? options.flowHistory?.find(item => item.id === options.selectedFlowId) : undefined
  for (const item of [options.transition, selectedFlow, ...(options.flowHistory ?? []).slice(-budget.flows * 4)]) {
    if (item?.from?.kind === 'slot') wantedSlots.add(item.from.id)
    if (item?.to?.kind === 'slot') wantedSlots.add(item.to.id)
  }
  const slotOwners = new Map<string, string>()
  if (wantedSlots.size) for (const node of nodes) for (const slot of rows(node)) if (wantedSlots.has(slot.id)) slotOwners.set(slot.id, node.id)
  const owner = (endpoint: FlowEndpoint | undefined): string | undefined => endpoint?.kind === 'slot' ? slotOwners.get(endpoint.id) : endpoint?.kind === 'io' ? undefined : endpoint?.id
  const selectedIds = new Set<string>()
  if (selection?.kind === 'reference') {
    const edge = catalog.references.find(edge => edge.id === selection.id)
    if (edge) { selectedIds.add(sourceId(edge)); selectedIds.add(edge.targetObjectId) }
  } else if (selection) selectedIds.add(selection.kind === 'slot' ? slotOwners.get(selection.id) ?? selection.id : selection.id)
  for (const endpoint of [selectedFlow?.from, selectedFlow?.to]) { const id = owner(endpoint); if (id) selectedIds.add(id) }
  const currentIds = new Set<string>()
  for (const node of catalog.frames) if (node.active) currentIds.add(node.id)
  const event = options.event
  if (event) {
    if ('frameId' in event && event.frameId) currentIds.add(event.frameId)
    if ('objectId' in event) currentIds.add(event.objectId)
    if ('classId' in event) currentIds.add(event.classId)
    if (event.type === 'EXECUTION_FACT' && event.fact.context.frameId) currentIds.add(event.fact.context.frameId)
  }
  for (const endpoint of [options.transition?.from, options.transition?.to]) { const id = owner(endpoint); if (id) currentIds.add(id) }
  const priorityIds = new Set([...selectedIds, ...currentIds])
  const focused = Boolean(options.focus && [...selectedIds].some(id => byId.has(id)))
  const neighbors = new Set<string>()
  for (const edge of catalog.references) {
    const source = sourceId(edge)
    if (priorityIds.has(source)) neighbors.add(edge.targetObjectId)
    if (priorityIds.has(edge.targetObjectId)) neighbors.add(source)
  }
  for (const frame of catalog.frames) {
    if (priorityIds.has(frame.id) && frame.callerFrameId) neighbors.add(frame.callerFrameId)
    if (frame.callerFrameId && priorityIds.has(frame.callerFrameId)) neighbors.add(frame.id)
  }
  const branches = invocationBranches(catalog.frames)
  const groups = new Map<string, PresentationNode[]>()
  for (const node of nodes) {
    const branch = node.kind === 'frame' ? byId.get(branches.get(node.id) ?? node.id) : undefined
    // Repeated sibling branches from the same caller/type share a summary.
    // Recursive descendants stay with that branch; labels never infer edges.
    const key = node.kind === 'frame' ? `frame:${node.metadata?.ownership ?? 'observed'}:${branch?.kind === 'frame' ? branch.callerFrameId ? `caller:${branch.callerFrameId}` : `root:${branch.id}` : node.id}:${branch?.kind === 'frame' ? branch.className ?? branch.metadata?.runtimeType ?? branch.label : node.label}`
      : `${node.kind}:${node.metadata?.ownership ?? 'observed'}:${node.kind === 'object' ? node.metadata?.runtimeType ?? node.className : node.className}`
    const members = groups.get(key)
    if (members) members.push(node); else groups.set(key, [node])
  }
  const representatives = new Set([...groups.values()].map(group => group[0].id))
  const contextIds = new Set<string>()
  const contextCounts = { frame: 0, object: 0, class: 0 }
  const limits = { frame: budget.frames, object: budget.objects, class: budget.classes }
  // With no current/selected subject, retained references are still runtime
  // architecture. A bounded seed supplies useful completed-world topology.
  if (!priorityIds.size && (options.flowDisplay ?? 'relevant') === 'relevant') {
    let seeds = 0
    for (const edge of catalog.references) {
      if (seeds >= budget.references) break
      const endpoints = [...new Set([sourceId(edge), edge.targetObjectId])].map(id => byId.get(id))
      if (endpoints.some(node => !node)) continue
      const added = endpoints.filter((node): node is PresentationNode => Boolean(node && !contextIds.has(node.id)))
      const increments = { frame: 0, object: 0, class: 0 }
      for (const node of added) increments[node.kind]++
      if (added.some(node => contextCounts[node.kind] + increments[node.kind] > limits[node.kind])) continue
      for (const node of added) { contextIds.add(node.id); contextCounts[node.kind]++ }
      seeds++
    }
  }
  const relevanceIds = priorityIds.size ? priorityIds : contextIds
  const target = options.viewTarget ?? catalog.bounds?.center ?? [0, 0, 0]
  const distance = (node: PresentationNode) => node.anchor.position.reduce((sum, value, axis) => sum + (value - target[axis]) ** 2, 0)
  const viewRadius = options.viewPosition ? Math.max(12, Math.hypot(...options.viewPosition.map((value, axis) => value - target[axis]))) * 2 : Infinity
  const subjectNode = [...selectedIds].map(id => byId.get(id)).find(node => node)
  const subject = subjectNode?.anchor.position ?? target
  const focusRadius = Math.max(5, ...(subjectNode?.anchor.size ?? [5])) * 6
  const subjectDistance = (node: PresentationNode) => node.anchor.position.reduce((sum, value, axis) => sum + (value - subject[axis]) ** 2, 0)
  const focusNeighbors = new Set([...neighbors].map(id => byId.get(id)).filter((node): node is PresentationNode => Boolean(node && subjectDistance(node) <= focusRadius ** 2))
    .sort((a, b) => subjectDistance(a) - subjectDistance(b)).slice(0, focusReferenceBudget).map(node => node.id))
  const rank = (node: PresentationNode) => selectedIds.has(node.id) ? 0 : currentIds.has(node.id) ? 1 : neighbors.has(node.id) || contextIds.has(node.id) ? 2
    : node.kind === 'frame' && !node.historical ? 3 : node.metadata && node.metadata.ownership !== 'PROJECT' ? 6 : representatives.has(node.id) ? 4 : 5
  const choose = <T extends PresentationNode>(items: T[], limit: number): T[] => {
    const eligible = focused ? items.filter(node => priorityIds.has(node.id) || focusNeighbors.has(node.id)) : level === 'macro' ? items.filter(node => rank(node) <= 3)
      : items.filter(node => rank(node) <= 3 || distance(node) <= viewRadius ** 2)
    const picked = new Set(eligible.map((node, index) => ({ node, index, rank: rank(node), distance: distance(node) }))
      .sort((a, b) => a.rank - b.rank || a.distance - b.distance || b.index - a.index).slice(0, limit).map(item => item.node.id))
    return items.filter(node => picked.has(node.id))
  }
  const frames = choose(catalog.frames, budget.frames)
  const objects = choose(catalog.objects, budget.objects)
  const classes = choose(catalog.classes ?? [], budget.classes)
  const detailedIds = new Set([...frames, ...objects, ...classes].map(node => node.id))
  const quiet = nodes.filter(node => !detailedIds.has(node.id) && (!focused || focusNeighbors.has(node.id)))
  const clusters: SpatialCluster[] = []
  for (const [id, members] of groups) {
    const first = members[0]
    const quietCount = members.reduce((sum, node) => sum + Number(!detailedIds.has(node.id)), 0)
    if (!quietCount || focused) continue
    const branch = first.kind === 'frame' ? byId.get(branches.get(first.id) ?? first.id) : undefined
    const caller = branch?.kind === 'frame' && branch.callerFrameId ? byId.get(branch.callerFrameId) : undefined
    clusters.push({ id, kind: first.kind, label: first.kind === 'frame' ? `${branch?.kind === 'frame' ? branch.className ?? branch.label : first.label}${caller ? ` · observed ancestor ${caller.label}` : ''}` : first.className,
      count: members.length, quietCount, anchor: first.anchor, representative: first, body: !detailedIds.has(first.id) })
  }
  let labelledClusters = clusters.filter(cluster => rank(cluster.representative) <= 3 || distance(cluster.representative) <= viewRadius ** 2)
    .sort((a, b) => rank(a.representative) - rank(b.representative) || distance(a.representative) - distance(b.representative)).slice(0, budget.clusters)
  const quietVolumes = level === 'macro' ? [] : choose(quiet, budget.quiet)
  const pickableQuiet = level === 'macro' ? [] : choose(quietVolumes, budget.picking)
  const display = options.flowDisplay ?? 'relevant'
  const touches = (from: string | undefined, to: string | undefined, ids: ReadonlySet<string>) => Boolean(from && ids.has(from) || to && ids.has(to))
  const referenceCandidates = catalog.references.filter(edge => detailedIds.has(sourceId(edge)) && detailedIds.has(edge.targetObjectId)
    && (edge.id === selection?.id || display === 'all' || touches(sourceId(edge), edge.targetObjectId, display === 'current' ? currentIds : relevanceIds)))
  const references = referenceCandidates.map((edge, index) => ({ edge, index, rank: edge.id === selection?.id ? 0 : touches(sourceId(edge), edge.targetObjectId, selectedIds) ? 1 : edge.historical ? 3 : 2,
    distance: edge.from.reduce((sum, value, axis) => sum + (value - edge.to[axis]) ** 2, 0) }))
    .sort((a, b) => a.rank - b.rank || (focused ? a.distance - b.distance : 0) || b.index - a.index).slice(0, focused ? Math.min(focusReferenceBudget, budget.references) : budget.references).map(item => item.edge)
  const faceIds = new Set([...frames, ...objects, ...classes].filter(node => level === 'micro' || priorityIds.has(node.id)).map(node => node.id))
  for (const edge of references) {
    const source = byId.get(sourceId(edge))
    if (source?.kind === 'object' && source.array) { faceIds.add(source.id); wantedSlots.add(edge.source.slotId) }
  }
  const flows: SemanticTransition[] = []
  const history = options.flowHistory ?? []
  // Inspect a bounded history suffix; selection of an older flow is explicit.
  const candidates = selectedFlow ? [selectedFlow, ...history.slice(-budget.flows * 4).reverse()] : history.slice(-budget.flows * 4).reverse()
  const flowIds = new Set<string>()
  for (const item of candidates) {
    if (flows.length >= budget.flows) break
    if (flowIds.has(item.id)) continue
    const from = owner(item.from); const to = owner(item.to)
    const represented = (endpoint: FlowEndpoint | undefined, id: string | undefined) => !endpoint || (endpoint.kind === 'io' ? Boolean(io?.some(item => item.id === endpoint.id)) : Boolean(id && detailedIds.has(id)))
    if (!represented(item.from, from) || !represented(item.to, to)) continue
    if (item.id !== selectedFlow?.id && display !== 'all' && !(display === 'current' ? item.id === options.transition?.id || item.seq === options.transition?.seq : touches(from, to, relevanceIds))) continue
    flowIds.add(item.id); flows.push(item)
  }
  const returnFlow = catalog.returnFlow && detailedIds.has(catalog.returnFlow.frameId) && (!catalog.returnFlow.destination || detailedIds.has(catalog.returnFlow.destination.frameId)) ? catalog.returnFlow : undefined
  const scene: SceneModel = { ...catalog, frames, objects, ...(catalog.classes ? { classes } : {}), ...(io ? { io } : {}), references, detailLevel: level, returnFlow }
  const cellWindows = new Map<string, SceneArrayCell[]>()
  let cellsRemaining: number = budget.cells
  const orderedArrays = [...objects].filter(node => node.array && faceIds.has(node.id)).sort((a, b) => rank(a) - rank(b))
  for (const node of orderedArrays) {
    const cells = node.array!.cells
    const selectedIndex = selection?.kind === 'slot' ? cells.findIndex(cell => cell.id === selection.id) : -1
    const activity = catalog.arrayActivity?.objectId === node.id ? catalog.arrayActivity : null
    const activeIndices = new Set<number>(activity?.kind === 'compare' ? activity.indices : activity ? [activity.index] : [])
    const selectedReferenceSlot = selection?.kind === 'reference' ? catalog.references.find(edge => edge.id === selection.id)?.source.slotId : undefined
    const window = [...cells].sort((a, b) => Number(b.id === selection?.id || b.id === selectedReferenceSlot) - Number(a.id === selection?.id || a.id === selectedReferenceSlot) || Number(wantedSlots.has(b.id)) - Number(wantedSlots.has(a.id)) || Number(activeIndices.has(b.index)) - Number(activeIndices.has(a.index)) || (selectedIndex >= 0 ? Math.abs(a.index - cells[selectedIndex].index) - Math.abs(b.index - cells[selectedIndex].index) : a.index - b.index)).slice(0, Math.min(cellsRemaining, level === 'macro' ? 4 : level === 'meso' ? 12 : 32))
    const included = new Set(window.map(cell => cell.id))
    cellWindows.set(node.id, cells.filter(cell => included.has(cell.id)))
    cellsRemaining -= window.length
  }
  const representedSlot = (id: string, node: PresentationNode | undefined) => node?.kind !== 'object' || !node.array
    || node.fields.some(field => field.id === id) || Boolean(faceIds.has(node.id) && cellWindows.get(node.id)?.some(cell => cell.id === id))
  scene.references = references.filter(edge => representedSlot(edge.source.slotId, byId.get(sourceId(edge))))
  const visibleFlows = flows.filter(item => [item.from, item.to].every(endpoint => endpoint?.kind !== 'slot' || representedSlot(endpoint.id, byId.get(owner(endpoint) ?? ''))))
  // Home uses stable group anchors plus protected detail, not thousands of
  // quiet members' empty enclosing space. It never changes any member position.
  const groupNodes = [...groups.values()].map(members => members[0])
  const ownershipRank = (node: PresentationNode) => node.metadata?.ownership === 'PROJECT' ? 0 : !node.metadata ? 1 : 2
  const orderedGroups = groupNodes.map((node, index) => ({ node, index })).sort((a, b) => ownershipRank(a.node) - ownershipRank(b.node) || a.index - b.index).map(item => item.node)
  const projectBounds = presentationBounds(orderedGroups.filter(node => ownershipRank(node) === 0).slice(0, homeGroupBudget).map(node => node.anchor), false)
  const externalRadius = projectBounds ? Math.max(12, ...projectBounds.size) * 1.5 : Infinity
  const homeGroups = new Map<string, PresentationNode>()
  let externalGroups = 0
  const addHomeGroup = (node: PresentationNode | undefined) => {
    if (!node || homeGroups.has(node.id) || homeGroups.size >= homeGroupBudget) return
    if (ownershipRank(node) === 2 && externalGroups >= homeExternalGroupBudget) return
    if (ownershipRank(node) === 2 && projectBounds && node.anchor.position.reduce((sum, value, axis) => sum + (value - projectBounds.center[axis]) ** 2, 0) > externalRadius ** 2) return
    if (ownershipRank(node) === 2) externalGroups++
    homeGroups.set(node.id, node)
  }
  // Keep the three observed regions legible, then fill with project groups.
  // A large JDK catalog cannot expand Home into an unreadable distant strip.
  for (const kind of ['frame', 'object', 'class'] as const) addHomeGroup(orderedGroups.find(node => node.kind === kind))
  for (const node of orderedGroups) addHomeGroup(node)
  // A terminal prefix's last effect may be hundreds of allocations behind its
  // type representative. Home summarizes those exact memberships; that stale
  // effect must not shrink the entire map. Explicit selection still participates
  // in framing, and Focus/Trace can visit any retained identity in place.
  const terminalOverview = event?.type === 'PROGRAM_END' || event?.type === 'CAPTURE_STOP'
  const homeProtected = terminalOverview ? selectedIds : priorityIds
  const homeNodes = [...new Map([...homeGroups.values(),
    ...[...frames, ...objects, ...classes].filter(node => homeProtected.has(node.id)
      || contextIds.has(node.id) && (!terminalOverview || !projectBounds || node.anchor.position.reduce((sum,value,axis)=>sum+(value-projectBounds.center[axis])**2,0)<=externalRadius**2)),
  ].map(node => [node.id, node])).values()]
  const protectedCells = objects.filter(node => node.array && homeProtected.has(node.id))
    .flatMap(node => (cellWindows.get(node.id) ?? []).map(cell => cell.anchor))
  const homeBounds = presentationBounds([...homeNodes.map(node => node.anchor), ...protectedCells, ...(io ?? []).map(item => item.anchor)])
  const homeScene: SceneModel = { ...scene, bounds: homeBounds,
    frames: homeNodes.filter((node): node is SceneFrameNode => node.kind === 'frame'),
    objects: homeNodes.filter((node): node is SceneObjectNode => node.kind === 'object'),
    classes: homeNodes.filter((node): node is SceneClassNode => node.kind === 'class'), references: [] }
  if (level === 'macro') {
    const overviewIds = new Set(homeGroups.keys())
    labelledClusters = clusters.filter(cluster => overviewIds.has(cluster.representative.id)).slice(0, homeGroupBudget)
  }
  const geometryNodes = [...frames, ...objects, ...classes, ...pickableQuiet,
    ...labelledClusters.filter(cluster => cluster.body).map(cluster => cluster.representative)]
  const unique = [...new Map(geometryNodes.map(node => [node.id, node])).values()]
  const geometryScene: SceneModel = { ...scene, frames: unique.filter((node): node is SceneFrameNode => node.kind === 'frame'),
    objects: unique.filter((node): node is SceneObjectNode => node.kind === 'object').map(node => !node.array ? node
      : detailedIds.has(node.id) && faceIds.has(node.id) ? { ...node, array: { ...node.array, cells: cellWindows.get(node.id) ?? [] } } : { ...node, array: undefined }),
    classes: unique.filter((node): node is SceneClassNode => node.kind === 'class') }
  return { scene, quiet, quietVolumes, pickableQuiet, clusters, labelledClusters, priorityIds, faceIds, selectedIds, cellWindows, flows: visibleFlows, geometryScene, homeBounds, homeScene }
}
