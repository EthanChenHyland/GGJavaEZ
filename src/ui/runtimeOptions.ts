import type { Selection } from '../contracts/interaction'
import type { SceneModel } from '../contracts/world'

export const runtimeOptionBudget = 256
export interface RuntimeOption { id: string; kind: 'frame' | 'object' | 'class' | 'slot'; label: string }
/** A bounded DOM list; searching still traverses every actual recorded identity.
 * Selection stays represented even outside the recent overview window. */
export function runtimeOptions(scene: SceneModel, selection: Selection, query = ''): RuntimeOption[] {
  const term = query.trim().toLowerCase(), options: RuntimeOption[] = []
  const ids = new Set<string>()
  const add = (item: RuntimeOption) => {
    if (ids.has(item.id) || options.length >= runtimeOptionBudget) return
    ids.add(item.id); options.push(item)
  }
  const nodes = [...scene.frames, ...scene.objects, ...(scene.classes ?? [])]
  // First locate selection, independent of type/window. Hidden face slots remain
  // inspectable and searchable; they are not rendered as invented terminals.
  if (selection && selection.kind !== 'reference') for (const node of nodes) {
    if (node.id === selection.id) add({ id:node.id, kind:node.kind, label:node.label })
    const slots = node.kind === 'frame' ? node.slots : [...node.fields, ...(node.kind === 'object' ? node.array?.cells ?? [] : [])]
    const slot = slots.find(slot => slot.id === selection.id)
    if (slot) add({ id:slot.id, kind:'slot', label:`${node.label} · ${slot.name}` })
    if (options.length) break
  }
  const ordinals = new Map(scene.frames.map((node, index) => [node.id, index + 1]))
  const candidates = term || nodes.length <= 100 ? nodes : [...nodes.slice(0, 48), ...nodes.slice(-80)]
  for (const node of candidates) {
    const label = node.kind === 'frame' ? `${node.label} · invocation ${ordinals.get(node.id)}` : node.kind === 'class' ? `${node.label} · class state` : node.label
    if (!term || `${label} ${node.id}`.toLowerCase().includes(term)) add({ id:node.id, kind:node.kind, label })
  }
  for (const node of candidates) {
    const slots = node.kind === 'frame' ? node.slots.filter(slot => slot.role !== 'return') : node.kind === 'object' ? node.array?.cells ?? [] : node.fields
    for (const slot of slots) {
      const label = `${node.label} · ${slot.name}`
      if (!term || `${label} ${slot.id}`.toLowerCase().includes(term)) add({ id:slot.id, kind:'slot', label })
      if (options.length >= runtimeOptionBudget) return options
    }
  }
  return options
}
