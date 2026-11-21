import { expect, it } from 'vitest'
import { ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three'
import type { ArrayWindow, PresentedEntity, SceneArray, SceneEntity, WorldAnchor } from '../contracts/world'
import { color } from '../theme/tokens'
import { contactFootprints, createFloorContactMaterial, floorSupports } from './floorContact'
import { floorStyle } from './floorModel'

function anchor(entityId: string, x: number, y: number, z = 0): WorldAnchor {
  const position = [x, y, z] as const
  return { entityId, region: 'heap', position, size: [2, 2, 2], ports: {}, bodyPort: position }
}

it('grounds near represented bodies with height attenuation, finite spread and a fixed instance budget', () => {
  const support = (id: string, y: number, opacity = 1, featured = false) => ({ anchor: anchor(id, 2, y, 3), opacity, accent: color.heap.edge, featured })
  const near = support('near', 1.2), higher = support('higher', 2.2), far = support('far', 6), clipped = support('below', .7)
  const [first, second] = contactFootprints([far, near, higher, clipped], 0)
  expect(first.position).toEqual([2, floorStyle.contactLift, 3])
  expect(first.size[0]).toBeLessThan(second.size[0])
  expect(first.opacity).toBeGreaterThan(second.opacity)
  expect(contactFootprints([far, clipped], 0)).toEqual([])
  const dense = Array.from({ length: 70 }, (_, i) => support(String(i), 1.2))
  const featured = support('selected', 1.2, 1, true)
  const cut = contactFootprints([...dense, featured], 0)
  expect(cut).toHaveLength(floorStyle.maxContacts)
  expect(cut[0].id).toBe('selected')
})

it('uses real visible array body and cell anchors with a single changed-cell sheen', () => {
  const nodes = {
    tray: { kind: 'array', id: 'tray', anchor: anchor('tray', 0, 1.2), activity: { index: 3 } } as SceneArray,
    other: { kind: 'object', id: 'other', anchor: anchor('other', 0, .2) } as SceneEntity,
  }
  const entities = new Map<string, PresentedEntity>([
    ['tray', { id: 'tray', mode: 'detailed', opacity: 1, highlight: 'mutation', detail: 'CLOSE', pinned: false, pickable: true }],
  ])
  const plan = { entities, clusters: [], cellWindows: new Map([['tray', {
    mapping: new Map([
      ['mutated', { anchor: anchor('mutated', 2, 1.2), index: 3 }],
      ['neighbor', { anchor: anchor('neighbor', 4, 1.2), index: 4 }],
    ]),
  } as unknown as ArrayWindow]]) }
  const supports = floorSupports({ entities: nodes }, plan)
  const contacts = contactFootprints(supports, 0)
  expect(contacts.map(item => item.id).sort()).toEqual(['mutated', 'neighbor', 'tray:backplate'])
  expect(contacts.find(item => item.id === 'mutated')?.accent).toBe(color.semantic.mutation)
  expect(contacts.find(item => item.id === 'neighbor')?.accent).toBe(color.heap.edge)
  expect(contacts.find(item => item.id === 'tray:backplate')!.size[1]).toBeLessThan(contacts.find(item => item.id === 'neighbor')!.size[1])
  const quiet = { ...plan, entities: new Map([['tray', { ...entities.get('tray')!, mode: 'quiet' as const }]]) }
  expect(floorSupports({ entities: nodes }, quiet).map(item => item.anchor.entityId)).toEqual(['tray'])
})

it('uses the fragment color flag shared by Three vertex and instance colors', () => {
  const material = createFloorContactMaterial()
  const shader = { ...ShaderLib.basic, uniforms: {} } as WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as WebGLRenderer)
  expect(shader.fragmentShader).toContain('#ifdef USE_COLOR')
  expect(shader.fragmentShader).toContain('vColor.rgb * 0.27, sheen / max(coverage, 0.0001)')
  expect(shader.fragmentShader).toContain('coverage * grazing')
  expect(shader.fragmentShader).not.toContain('USE_INSTANCING_COLOR')
  material.dispose()
})
