import { describe, expect, it } from 'vitest'
import type { SceneFrameNode, SceneModel, SceneObjectNode, WorldAnchor } from '../contracts/world'
import { detailedScene, detailBudget } from './detailedScene'
const anchor = (id: string): WorldAnchor => ({ entityId: id, region: 'stack', position: [0, 0, 0], size: [5, 3, 1], ports: {}, bodyPort: [0, 0, 0] })
const frames: SceneFrameNode[] = Array.from({ length: 1756 }, (_, index) => ({ kind: 'frame', id: `f${index}`, label: 'call()', depth: 0, historical: true, active: false, anchor: anchor(`f${index}`), slots: [] }))
const objects: SceneObjectNode[] = Array.from({ length: 136 }, (_, index) => ({ kind: 'object', id: `o${index}`, label: 'Node', className: 'Node', displayId: index, anchor: anchor(`o${index}`), fields: [] }))
const scene: SceneModel = { frames, objects, references: [], activeEventId: null, detailLevel: 'meso' }
describe('bounded detail in retained runtime worlds', () => {
  it('bounds detailed faces without mutating or reshuffling the full anchor catalog', () => {
    const result = detailedScene(scene, null)
    expect(result.frames).toHaveLength(detailBudget.frames)
    expect(result.objects).toHaveLength(detailBudget.objects)
    expect(scene.frames).toHaveLength(1756)
    expect(result.frames[0]).toBe(frames[1756 - detailBudget.frames])
  })
  it('restores any historical record and its exact anchor on selection', () => {
    const result = detailedScene(scene, { kind: 'frame', id: 'f0' })
    expect(result.frames[0]).toBe(frames[0])
    expect(result.frames).toHaveLength(detailBudget.frames + 1)
    expect(detailedScene(scene, { kind: 'object', id: 'o0' }).objects[0]).toBe(objects[0])
  })
  it('protects the entire live stack and both selected reference endpoints', () => {
    const live = { ...scene, frames: frames.map((node, index) => index < 3 ? { ...node, historical: false } : node), references: [{ id: 'edge', source: { kind: 'frame' as const, frameId: 'f1', slotId: 's' }, targetObjectId: 'o1', from: [0, 0, 0] as const, to: [1, 1, 1] as const }] }
    const result = detailedScene(live, { kind: 'reference', id: 'edge' })
    expect(result.frames.slice(0, 3).map(node => node.id)).toEqual(['f0', 'f1', 'f2'])
    expect(result.objects[0]).toBe(objects[1])
    expect(result.references).toEqual(live.references)
  })
})
