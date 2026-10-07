import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneFrameNode, SceneScopeNode, SceneSlot, Vec3 } from '../../contracts/world'
import type { RuntimeLabelProps } from './RuntimeLabel'
import type { RuntimeSlotProps } from './RuntimeSlot'

const rendered = vi.hoisted(() => ({
  labels: [] as RuntimeLabelProps[],
  slots: [] as RuntimeSlotProps[],
  bodies: [] as Array<{ size: Vec3; accent: string; bodyColor: string; selected: boolean }>,
}))
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn(), useThree: () => vi.fn() }))
vi.mock('./RuntimeLabel', () => ({ RuntimeLabel: (props: RuntimeLabelProps) => { rendered.labels.push(props); return null } }))
vi.mock('./SolidBody', () => ({ SolidBody: (props: typeof rendered.bodies[number]) => { rendered.bodies.push(props); return null }, SolidFace: () => null }))
vi.mock('./RuntimeSlot', async () => {
  const actual = await vi.importActual<typeof import('./RuntimeSlot')>('./RuntimeSlot')
  return { ...actual, RuntimeSlot: (props: RuntimeSlotProps) => {
    rendered.slots.push(props)
    return <actual.RuntimeSlot {...props} />
  } }
})
vi.mock('./presentationMotion', () => ({ useReducedMotion: (override?: boolean) => override ?? false, useMountSettle: vi.fn() }))

import { FrameSolid, type FrameSolidProps } from './FrameSolid'
import { colors, worldMaterial, worldUnits } from '../../theme/tokens'

const origin: Vec3 = [-3.6, -0.5, 1.1]
const frameSize: Vec3 = [worldUnits.frame[0], 5.6, worldUnits.frame[2]]
const front = origin[2] + frameSize[2] / 2
function scope(id: string, depth: number, y: number, height: number, slotIds: string[]): SceneScopeNode {
  const position: Vec3 = [origin[0], y, front + depth * worldUnits.scope.depthOffset]
  return {
    id, depth, label: `${id} block`, parentId: depth ? depth === 1 ? 'root' : 'loop' : null, slotIds,
    anchor: { entityId: id, region: 'stack', position,
      size: [frameSize[0] - depth * worldUnits.scope.inset * 2 - 0.22, height, worldUnits.scope.plateDepth], ports: {}, bodyPort: position },
  }
}
function slot(id: string, scopeId: string, scopeDepth: number, y: number): SceneSlot {
  return { id, name: id, javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: 42 }, scopeId, scopeDepth,
    port: [origin[0] + frameSize[0] / 2 + 0.04, y, front + 0.05 + scopeDepth * worldUnits.scope.depthOffset] }
}
function frame(): SceneFrameNode {
  const slots = [slot('total', 'root', 0, 1.08), slot('i', 'loop', 1, 0.24), slot('raw', 'body', 2, -0.63)]
  return {
    kind: 'frame', id: 'main', label: 'main()', depth: 0, active: true,
    anchor: { entityId: 'main', region: 'stack', position: origin, size: frameSize, ports: Object.fromEntries(slots.map(slot => [slot.id, slot.port])), bodyPort: origin },
    // Nonuniform reserved Y coordinates must survive rendering without compaction.
    slots,
    scopes: [scope('root', 0, 0.4, 3.9, ['total']), scope('loop', 1, -0.4, 2.3, ['i']), scope('body', 2, -0.8, 1.2, ['raw', 'ended'])],
  }
}
function render(props: Partial<FrameSolidProps> = {}) {
  return renderToStaticMarkup(<FrameSolid node={frame()} selected={false} related={false} onSelect={() => {}} {...props} />)
}
function resetCaptures() {
  rendered.labels.length = 0
  rendered.slots.length = 0
  rendered.bodies.length = 0
}

describe('FrameSolid lexical scope geometry', () => {
  beforeEach(() => {
    resetCaptures()
    // React DOM serializes the R3F host elements for these primitive tests.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('places shallow nested stack bodies at the reserved world anchors and omits the root slab', () => {
    const node = frame()
    const markup = render({ node })
    expect(rendered.bodies).toHaveLength(3)
    expect(rendered.bodies[0].size).toEqual(node.anchor.size)
    for (const [index, block] of node.scopes!.slice(1).entries()) {
      const local = block.anchor.position.map((value, axis) => value - origin[axis])
      expect(markup).toContain(`position="${local.join(',')}"`)
      expect(rendered.bodies[index + 1]).toMatchObject({
        size: [block.anchor.size[0], block.anchor.size[1], worldUnits.frame[2]],
        accent: colors.stack, bodyColor: worldMaterial.stackBody, selected: false,
      })
      expect(rendered.bodies[index + 1].size[2] * (block.anchor.size[2] / worldUnits.frame[2])).toBeCloseTo(worldUnits.scope.plateDepth)
    }
    expect(markup).toContain(`scale="1,1,${worldUnits.scope.plateDepth / worldUnits.frame[2]}"`)
    expect(rendered.labels.map((label) => label.text)).not.toContain('root block')
  })

  it('uses actual row ports and depth insets while keeping each background inside its plate', () => {
    const node = frame()
    render({ node })
    expect(rendered.slots.map((row) => row.slot.id)).toEqual(node.slots.map((row) => row.id))
    for (const row of rendered.slots) {
      expect(row.y).toBe(row.slot.port[1] - origin[1])
      expect(row.z).toBe(row.slot.port[2] - origin[2])
      expect(row.width).toBeCloseTo(frameSize[0] - row.slot.scopeDepth! * worldUnits.scope.inset * 2)
      expect(row.readable).toBe(true)
      expect(row.background).toBe(worldMaterial.stackSlot)
      const plate = node.scopes!.find((block) => block.id === row.slot.scopeId)!
      expect(row.width - 0.28).toBeLessThan(plate.anchor.size[0])
      expect(origin[2] + row.z).toBeGreaterThan(plate.anchor.position[2] + plate.anchor.size[2] / 2)
    }
  })

  it('keeps selected and active slot accents on the nested front face and routes slot selection', () => {
    const onSelectSlot = vi.fn()
    const markup = render({ selectedSlotId: 'raw', activeSlotId: 'i', onSelectSlot })
    const selected = rendered.slots.find((row) => row.slot.id === 'raw')!
    const active = rendered.slots.find((row) => row.slot.id === 'i')!
    expect(selected.selected).toBe(true)
    expect(active.active).toBe(true)
    expect(markup).toContain(`position="${-selected.width / 2 + 0.16},0,${selected.z + 0.012}"`)
    expect(markup).toContain(`position="${-active.width / 2 + 0.16},0,${active.z + 0.012}"`)
    selected.onSelect?.()
    expect(onSelectSlot).toHaveBeenCalledWith('raw')
  })

  it('renders only live slots and removes a closed scope without shifting surviving rows', () => {
    const node = frame()
    render({ node, selectedSlotId: 'ended' })
    expect(rendered.slots.some((row) => row.slot.id === 'ended')).toBe(false)
    const surviving = rendered.slots.slice(0, 2).map(({ y, z, width }) => ({ y, z, width }))
    resetCaptures()
    render({ node: { ...node, scopes: node.scopes!.slice(0, 2), slots: node.slots.slice(0, 2) }, selectedSlotId: 'raw' })
    expect(rendered.bodies).toHaveLength(2)
    expect(rendered.labels.map((label) => label.text)).not.toContain('body block')
    expect(rendered.slots.map(({ y, z, width }) => ({ y, z, width }))).toEqual(surviving)
    expect(rendered.slots.every((row) => !row.selected)).toBe(true)
  })

  it('keeps scope headings small and on their plate faces, with the innermost active block emphasized', () => {
    const node = frame()
    render({ node })
    for (const block of node.scopes!.slice(1)) {
      expect(rendered.labels.find((label) => label.text === block.label)).toMatchObject({
        size: 0.23,
        position: [-block.anchor.size[0] / 2 + worldUnits.scope.inset, block.anchor.size[1] / 2 - worldUnits.scope.inset, block.anchor.size[2] / 2 + 0.014],
        color: block.id === 'body' ? colors.execution : colors.stack,
      })
    }
  })

  it('uses lexical depth for current-block emphasis independently of scope projection order', () => {
    const node = frame()
    node.scopes = [...node.scopes!].reverse()
    render({ node })
    expect(rendered.labels.find((label) => label.text === 'body block')?.color).toBe(colors.execution)
    expect(rendered.labels.find((label) => label.text === 'loop block')?.color).toBe(colors.stack)
  })

  it('keeps scope headings in stack colors when their frame is not executing', () => {
    render({ node: { ...frame(), active: false } })
    expect(rendered.labels.filter((label) => label.text.endsWith(' block')).every((label) => label.color === colors.stack)).toBe(true)
  })

  it('retains scope volumes at macro detail and suppresses micro rows', () => {
    render({ detailLevel: 'macro' })
    expect(rendered.bodies).toHaveLength(3)
    expect(rendered.slots).toHaveLength(0)
    expect(rendered.labels.map((label) => label.text)).toEqual(['STACK FRAME · 3 values', 'main()'])
  })

  it.each([{ selected: true }, { selectedSlotId: 'raw' }, { inspection: true }])('preserves fitting scope rows for macro inspection %o', (props) => {
    render({ detailLevel: 'macro', ...props })
    expect(rendered.slots).toHaveLength(3)
    expect(rendered.labels.map(label => label.text)).toContain('body block')
  })

  it('retains scope truth and raised row depths with reduced motion', () => {
    render({ reducedMotion: true })
    expect(rendered.bodies).toHaveLength(3)
    expect(rendered.slots.every((row) => row.reducedMotion)).toBe(true)
    expect(rendered.slots[2].z).toBeCloseTo(frameSize[2] / 2 + 0.05 + 2 * worldUnits.scope.depthOffset)
  })

  it.each([
    ['origin', 'THROW'], ['unwound', 'UNWOUND'], ['caught', 'CATCH'], ['finally', 'FINALLY'],
  ] as const)('shows the canonical %s exception state while retaining the active execution marker', (exceptionState, caption) => {
    const node = { ...frame(), exceptionState }
    const markup = render({ node })
    expect(rendered.bodies[0].accent).toBe(colors.exception)
    expect(rendered.labels.find(label => label.text === `STACK FRAME · ${caption}`)?.color).toBe(colors.exception)
    expect(markup).toContain(`color="${colors.execution}"`)
    expect(markup).toContain(`color="${colors.exception}"`)
    expect(rendered.slots.map(row => row.slot.id)).toEqual(node.slots.map(row => row.id))
  })

  it.each([
    ['Person', false, false], ['recursion', true, false], ['arrays', false, true],
  ] as const)('preserves %s frame typography and front-face placement without explicit scopes', (_example, readable, spacious) => {
    const node = frame()
    node.scopes = undefined
    render({ node, readable, spacious })
    expect(rendered.bodies).toHaveLength(1)
    for (const row of rendered.slots) {
      expect(row.width).toBe(frameSize[0])
      expect(row.z).toBeCloseTo(frameSize[2] / 2 + 0.012 + 0.018)
      expect(row.readable).toBe(readable)
      expect(row.textScale).toBe(spacious ? 1.25 : 1)
    }
  })
  it('keeps completed bodies and row plates neutral while preserving selection/exception accents', () => {
    const completed: SceneFrameNode = { ...frame(), scopes: [], active: false, historical: true, invocationStatus: 'completed' }
    render({ node: completed })
    expect(rendered.bodies[0].bodyColor).toBe(worldMaterial.historyBody)
    expect(rendered.bodies[0].accent).toBe(colors.textMuted)
    expect(rendered.slots[0].background).toBe(worldMaterial.historySlot)
    resetCaptures()
    render({ node: completed, selected: true })
    expect(rendered.bodies[0].bodyColor).toBe(worldMaterial.historyBody)
    expect(rendered.bodies[0].accent).toBe(colors.stack)
    resetCaptures()
    render({ node: { ...completed, invocationStatus: 'unwound' } })
    expect(rendered.bodies[0].accent).toBe(colors.exception)
  })

})
