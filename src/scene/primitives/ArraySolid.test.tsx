import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneObjectNode, Vec3 } from '../../contracts/world'
import type { ArrayActivity, ArrayMutation } from '../../contracts/runtime'

const rendered = vi.hoisted(() => ({
  labels: [] as Array<{ text: string; position: Vec3 }>,
  bodies: [] as Array<{ size: Vec3; selected: boolean; accent: string }>,
  paths: [] as Array<{ points: Array<Vec3 | { x: number; y: number; z: number }> }>,
}))
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn(), useThree: () => vi.fn() }))
vi.mock('@react-three/drei', () => ({ Line: (props: typeof rendered.paths[number]) => { rendered.paths.push(props); return null } }))
vi.mock('./RuntimeLabel', () => ({ RuntimeLabel: (props: typeof rendered.labels[number]) => { rendered.labels.push(props); return null } }))
vi.mock('./SolidBody', () => ({ SolidBody: (props: typeof rendered.bodies[number]) => { rendered.bodies.push(props); return null }, SolidFace: () => null }))
vi.mock('./presentationMotion', () => ({ useReducedMotion: () => false }))

import { ArraySolid, type ArraySolidProps } from './ArraySolid'
import { colors } from '../../theme/tokens'

const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
const origin: Vec3 = [3.45, -0.05, -0.65]
function arrayNode(theater = false): SceneObjectNode {
  const size: Vec3 = theater ? [1.5, 1.45, 1.35] : [1.12, 1.15, 1.15]
  // Deliberately nonuniform coordinates: a renderer must preserve the projection it receives.
  const positions: Vec3[] = [[1.2, -0.3, -0.65], [3.45, -0.3, -0.65], [6, -0.3, -0.65]]
  return {
    kind: 'object', id: 'array', className: 'int[]', displayId: 23, label: 'int[] #23', fields: [],
    anchor: { entityId: 'array', region: 'heap', position: origin, size: [8, 3.2, 1.35], ports: {}, bodyPort: origin },
    array: { elementType: 'int', length: 3, cells: positions.map((position, index) => {
      const id = `array:element:${index}`
      const port: Vec3 = [position[0], position[1], position[2] + size[2] / 2]
      return { id, index, name: `[${index}]`, javaType: 'int', value: int([8, 1, 1][index]), port,
        anchor: { entityId: id, region: 'heap', position, size, ports: {}, bodyPort: port } }
    }) },
  }
}
const compare: ArrayActivity = { kind: 'compare', eventId: 'compare', objectId: 'array', indices: [0, 1],
  values: [int(8), int(1)], operator: '>', result: true }
const mutation: ArrayMutation = { eventId: 'write', objectId: 'array', index: 0, before: int(8), after: int(1), from: { kind: 'element', index: 1 } }
function render(props: Partial<ArraySolidProps> = {}) {
  return renderToStaticMarkup(<ArraySolid node={arrayNode()} selection={null} onSelect={() => {}}
    guided playing={false} {...props} />)
}
const texts = () => rendered.labels.map((label) => label.text)

describe('ArraySolid reserved geometry and trace facts', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    rendered.labels.length = 0
    rendered.bodies.length = 0
    rendered.paths.length = 0
    // React DOM is only a test serializer here; R3F owns these host elements in production.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('uses every supplied world position and equal supplied cell volume without deriving a rail', () => {
    const node = arrayNode(true)
    const markup = render({ node, presentation: 'theater' })
    for (const cell of node.array!.cells) expect(markup).toContain(`position="${cell.anchor.position.join(',')}"`)
    expect(rendered.bodies.slice(1).map((body) => body.size)).toEqual(node.array!.cells.map((cell) => cell.anchor.size))
    expect(texts()).toContain('int[]  #23')
    expect(texts()).toContain('length 3')
    expect(texts().filter((text) => /^\d+$/.test(text))).toEqual(['8', '1', '1'])
  })

  it.each([true, false])('renders the supplied comparison result %s with neutral operand labels', (result) => {
    render({ node: arrayNode(true), presentation: 'theater', activity: { ...compare, result } })
    expect(texts()).toContain(`[0] 8 > [1] 1  =  ${result}`)
    expect(texts()).toContain('left')
    expect(texts()).toContain('right')
    expect(texts()).not.toContain('j')
    expect(rendered.bodies.slice(1, 3).every((body) => body.accent === colors.execution)).toBe(true)
    expect(Math.max(...rendered.labels.map((label) => label.position[1]))).toBeLessThan(3)
  })

  it('keeps actual intermediate duplicate values visible during an indexed write', () => {
    const node = arrayNode(true)
    node.array!.cells[0].value = int(1)
    render({ node, presentation: 'theater', activity: { kind: 'write', ...mutation } })
    expect(texts().filter((text) => /^\d+$/.test(text))).toEqual(['1', '1', '1', '1'])
    expect(texts()).toContain('[1] → [0]  ·  8 → 1')
    const points = rendered.paths[0].points
    expect(points[0]).toMatchObject({ x: node.array!.cells[1].port[0], y: node.array!.cells[1].port[1], z: node.array!.cells[1].port[2] })
    expect(points.at(-1)).toMatchObject({ x: node.array!.cells[0].port[0], y: node.array!.cells[0].port[1], z: node.array!.cells[0].port[2] })
  })

  it('uses the supplied local origin for the temp write and does not fabricate missing origins', () => {
    const activity: ArrayActivity = { kind: 'write', ...mutation, from: { kind: 'slot', frameId: 'main', slotId: 'temp' } }
    render({ presentation: 'theater', activity, origins: { temp: [-5, -1, 1] }, originLabels: { temp: 'temp' } })
    expect(rendered.paths[0].points[0]).toMatchObject({ x: -5, y: -1, z: 1 })
    expect(texts()).toContain('temp → [0]  ·  8 → 1')
    rendered.paths.length = 0
    render({ presentation: 'theater', activity })
    expect(rendered.paths).toHaveLength(0)
  })

  it('labels and routes an actual read into temp using the destination slot anchor', () => {
    const slotId = 'slot:arrays-main:1:temp'
    const node = arrayNode(true)
    render({ node, presentation: 'theater', activity: { kind: 'read', eventId: 'read', objectId: 'array',
      index: 0, value: int(8), destinationSlotId: slotId }, origins: { [slotId]: [-5, -1, 1] }, originLabels: { [slotId]: 'temp' } })
    expect(texts()).toContain('read [0]  =  8 → temp')
    expect(rendered.paths[0].points[0]).toMatchObject({ x: node.array!.cells[0].port[0], y: -0.3 })
    expect(rendered.paths[0].points.at(-1)).toMatchObject({ x: -5, y: -1, z: 1 })
  })

  it('retains slot selection and its latest causal history at micro detail', () => {
    render({ selection: { kind: 'slot', id: 'array:element:0' }, detailLevel: 'micro', mutations: [mutation] })
    expect(rendered.bodies[1].selected).toBe(true)
    expect(rendered.bodies[2].selected).toBe(false)
    expect(texts()).toContain('[0] last write: 8 → 1')
  })

  it('quiets guided comparison cues without hiding committed indexed values', () => {
    render({ presentation: 'theater', activity: compare, guided: false })
    expect(texts().filter((text) => /^\d+$/.test(text))).toEqual(['8', '1', '1'])
    expect(texts()).not.toContain('j')
    expect(texts().some((text) => text.includes('true'))).toBe(false)
    expect(rendered.bodies.slice(1).every((body) => body.accent === colors.heap)).toBe(true)
    expect(rendered.paths).toHaveLength(0)
  })

  it('ignores another array activity and selects all subdivisions for object selection', () => {
    render({ selection: { kind: 'object', id: 'array' }, presentation: 'theater', activity: { ...compare, objectId: 'other' } })
    expect(rendered.bodies.every((body) => body.selected)).toBe(true)
    expect(texts().some((text) => text.includes('true'))).toBe(false)
    expect(rendered.paths).toHaveLength(0)
  })

  it('keeps sparse indices and multiple rows at supplied anchors as observations append', () => {
    const node = arrayNode()
    node.array!.length = 512
    node.array!.cells[1].index = 29
    node.array!.cells[1].anchor.position = [3.45, -2.4, -0.65]
    node.array!.cells[2].index = 511
    node.array!.cells[2].anchor.position = [6, -0.3, -2.1]
    const before = structuredClone(node)
    const markup = render({ node })
    expect(texts()).toContain('[29]')
    expect(texts()).toContain('[511]')
    expect(texts()).toContain('length 512')
    expect(texts()).toContain('3 shown · inspect')
    for (const cell of node.array!.cells) expect(markup).toContain(`position="${cell.anchor.position.join(',')}"`)
    expect(node).toEqual(before)
  })

  it('suppresses all cell labels at macro while keeping physical cells and the array identity', () => {
    render({ detailLevel: 'macro', guided: false })
    expect(rendered.bodies).toHaveLength(4)
    expect(texts()).toEqual(['int[]  #23', 'length 3'])
  })

  it.each([{ selection: { kind: 'object' as const, id: 'array' } }, { inspection: true }])('keeps macro inspection cells readable %o', props => {
    render({ detailLevel: 'macro', guided: false, ...props })
    expect(texts()).toContain('[0]')
    expect(texts()).toContain('[2]')
    expect(texts().filter(text => /^\d+$/.test(text))).toEqual(['8', '1', '1'])
  })

  it('does not infer a variable name from a slot ID when no observed label is provided', () => {
    render({ presentation: 'theater', activity: { kind: 'write', ...mutation, from: { kind: 'slot', frameId: 'main', slotId: 'temp' } } })
    expect(texts()).toContain('local → [0]  ·  8 → 1')
    expect(texts().some(text => text.includes('temp'))).toBe(false)
  })
})
