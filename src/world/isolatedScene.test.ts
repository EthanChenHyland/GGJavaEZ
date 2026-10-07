import { describe, expect, it } from 'vitest'
import { seek } from '../runtime'
import { loadPersonTrace } from '../examples/traces'
import { layoutForTrace as createLayout } from '../app/layoutForTrace'
import { buildSceneModel } from './sceneModel'
import { focusNeighborBudget, isolatedScene } from './isolatedScene'
import type { SceneFrameNode, SceneModel, SceneObjectNode, Vec3, WorldAnchor } from '../contracts/world'

const trace = loadPersonTrace()
const layout = createLayout(trace)
const at = (cursor: number) => buildSceneModel(seek(trace, cursor), layout, 'meso')

describe('Focus visibility projection', () => {
  it('isolates a field owner without moving it or changing the full runtime world', () => {
    const full = at(18)
    const object = full.objects[0]
    const focused = isolatedScene(full, { kind: 'slot', id: object.fields[0].id })
    expect(focused.objects).toEqual([object])
    expect(focused.frames).toEqual([])
    expect(focused.references).toEqual([])
    expect(focused.objects[0].anchor).toBe(object.anchor)
    expect(full.frames).toHaveLength(3)
  })

  it('retains the same focused call geometry as the method and main complete', () => {
    const id = at(18).frames.at(-1)!.id
    for (const cursor of [18, 19, 21]) {
      const focused = isolatedScene(at(cursor), { kind: 'frame', id })
      expect(focused.frames).toHaveLength(1)
      expect(focused.frames[0].anchor).toBe(layout.anchors[id])
      expect(focused.frames[0].invocationStatus).toBe(cursor === 18 ? 'active' : 'completed')
    }
  })

  it('shows the ordinary world when replay precedes the focused entity', () => {
    const prior = at(1)
    expect(isolatedScene(prior, { kind: 'object', id: 'object:person:17' })).toBe(prior)
  })
})

describe('Spatial 2.0 one-hop Focus context', () => {
  const anchor = (id: string, region: WorldAnchor['region']): WorldAnchor => ({ entityId: id, region, position: [0, 0, 0], size: [3, 2, 1], ports: {}, bodyPort: [0, 0, 0] })
  const frame = (id: string, callerFrameId: string | null): SceneFrameNode => ({ kind: 'frame', id, callerFrameId, label: `${id}()`, active: false,
    historical: true, invocationStatus: 'completed', depth: 0, anchor: anchor(id, 'stack'), slots: [] })
  const object = (id: string): SceneObjectNode => ({ kind: 'object', id, className: 'Node', displayId: 1, label: id, anchor: anchor(id, 'heap'), fields: [] })
  const zero: Vec3 = [0, 0, 0]
  const scene: SceneModel = { layoutKind: 'spatial2', frames: [frame('caller', null), frame('subject', 'caller'), frame('child', 'subject'), frame('grandchild', 'child'), frame('sibling', 'caller')],
    objects: [object('a'), object('b'), object('c')], references: [
      { id: 'ref:subject', source: { kind: 'frame', frameId: 'subject', slotId: 'root' }, targetObjectId: 'a', from: zero, to: zero },
      { id: 'ref:a', source: { kind: 'object', objectId: 'a', slotId: 'next' }, targetObjectId: 'b', from: zero, to: zero },
      { id: 'ref:b', source: { kind: 'object', objectId: 'b', slotId: 'next' }, targetObjectId: 'c', from: zero, to: zero },
    ], activeEventId: null, detailLevel: 'meso' }

  it('retains the direct caller, child and referenced object without following their neighbors', () => {
    const result = isolatedScene(scene, { kind: 'frame', id: 'subject' })
    expect(result.frames.map(node => node.id)).toEqual(['caller', 'subject', 'child'])
    expect(result.objects.map(node => node.id)).toEqual(['a'])
    expect(result.references.map(edge => edge.id)).toEqual(['ref:subject'])
    expect(result.frames[1].anchor).toBe(scene.frames[1].anchor)
    expect(scene.frames).toHaveLength(5)
  })

  it('retains inbound and outbound references but excludes two-hop objects', () => {
    const result = isolatedScene(scene, { kind: 'object', id: 'a' })
    expect(result.frames.map(node => node.id)).toEqual(['subject'])
    expect(result.objects.map(node => node.id)).toEqual(['a', 'b'])
    expect(result.references.map(edge => edge.id)).toEqual(['ref:subject', 'ref:a'])
    expect(isolatedScene(scene, { kind: 'object', id: 'a' }, 'isolate').objects.map(node => node.id)).toEqual(['a'])
  })

  it('includes real class storage and its direct static-to-heap edge', () => {
    const storage = { kind: 'class' as const, id: 'class:Registry', className: 'Registry', label: 'Registry', initialization: 'observed' as const,
      fields: [], anchor: anchor('class:Registry', 'class') }
    const staticScene: SceneModel = { ...scene, classes: [storage], references: [...scene.references, {
      id: 'ref:static', source: { kind: 'class', classId: storage.id, slotId: 'Registry.current' }, targetObjectId: 'a', from: zero, to: zero,
    }] }
    const result = isolatedScene(staticScene, { kind: 'class', id: storage.id })
    expect(result.classes).toEqual([storage])
    expect(result.objects.map(node => node.id)).toEqual(['a'])
    expect(result.frames).toHaveLength(0)
    expect(result.references.map(edge => edge.id)).toEqual(['ref:static'])
  })

  it('bounds high-degree contexts while preserving exact identities', () => {
    const objects = Array.from({ length: 50 }, (_, i) => object(`object:${i}`))
    const dense: SceneModel = { ...scene, objects, references: objects.map(node => ({ id: `ref:${node.id}`,
      source: { kind: 'frame', frameId: 'subject', slotId: node.id }, targetObjectId: node.id, from: zero, to: zero })) }
    const result = isolatedScene(dense, { kind: 'frame', id: 'subject' })
    expect(result.frames.length + result.objects.length).toBeLessThanOrEqual(1 + focusNeighborBudget)
    expect(result.frames.some(node => node.id === 'subject')).toBe(true)
    for (const node of result.objects) expect(dense.objects).toContain(node)
  })

  it('keeps selected geometry across completed, failed and paused frame presentation and scrub', () => {
    for (const status of ['completed', 'failed', 'active'] as const) {
      const snapshot = { ...scene, frames: scene.frames.map(node => node.id === 'subject' ? { ...node, invocationStatus: status } : node) }
      const result = isolatedScene(snapshot, { kind: 'frame', id: 'subject' })
      expect(result.frames.find(node => node.id === 'subject')?.anchor).toBe(scene.frames[1].anchor)
    }
    const prior = { ...scene, frames: [], references: scene.references.filter(edge => edge.source.kind !== 'frame') }
    expect(isolatedScene(prior, { kind: 'frame', id: 'subject' })).toBe(prior)
    const lingering = { ...prior, references: scene.references }
    expect(isolatedScene(lingering, { kind: 'frame', id: 'subject' })).toBe(lingering)
  })
})
