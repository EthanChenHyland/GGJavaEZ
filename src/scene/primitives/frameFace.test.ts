import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneFrameNode, SceneSlot, Vec3 } from '../../contracts/world'
import type { RuntimeLabelProps } from './RuntimeLabel'
import type { RuntimeSlotProps } from './RuntimeSlot'
import { FRAME_FACE_ROW_HEIGHT, frameFace, frameTerminalPosition } from './frameFace'

const rendered = vi.hoisted(() => ({
  labels: [] as Array<RuntimeLabelProps & { densityEnabled: boolean }>,
  rows: [] as Array<RuntimeSlotProps & { densityEnabled: boolean }>,
  sizes: [] as Vec3[],
}))
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }))
vi.mock('./presentationMotion', () => ({ useReducedMotion: () => true, useMountSettle: vi.fn() }))
vi.mock('./SolidBody', () => ({ SolidBody: ({ size }: { size: Vec3 }) => { rendered.sizes.push(size); return null } }))
vi.mock('./RuntimeLabel', async () => {
  const { useContext } = await import('react')
  const { RuntimeLabelPolicy } = await import('./runtimeText')
  return { RuntimeLabel: (props: RuntimeLabelProps) => {
    rendered.labels.push({ ...props, densityEnabled: useContext(RuntimeLabelPolicy)?.current.enabled ?? false })
    return null
  } }
})
vi.mock('./RuntimeSlot', async () => {
  const { useContext } = await import('react')
  const { RuntimeLabelPolicy } = await import('./runtimeText')
  return { RuntimeSlot: (props: RuntimeSlotProps) => {
    rendered.rows.push({ ...props, densityEnabled: useContext(RuntimeLabelPolicy)?.current.enabled ?? false })
    return null
  } }
})

import { FrameSolid, type FrameSolidProps } from './FrameSolid'

function liveFrame(count: number): SceneFrameNode {
  const position: Vec3 = [-4.9, -8.4, -3]
  const size: Vec3 = [5.1, 3.6, 1.25]
  const slots: SceneSlot[] = Array.from({ length: count }, (_, index): SceneSlot => ({
    id: index === 0 ? 'return:frame' : `local:${index}`,
    name: index === 0 ? 'return' : `local${index}`,
    role: index === 0 ? 'return' : 'local',
    javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: index },
    port: [position[0] + size[0] / 2 + 0.04, position[1] + size[1] / 2 - 0.95 - index * 0.32, position[2] + size[2] * 0.18],
  }))
  return {
    kind: 'frame', id: 'frame', label: 'run()', depth: 2, active: true,
    anchor: { entityId: 'frame', region: 'stack', position, size, ports: Object.fromEntries(slots.map(slot => [slot.id, slot.port])), bodyPort: position },
    // sceneModel appends the synthetic return even though layout reserves it first.
    slots: [...slots.slice(1), ...slots.slice(0, 1)],
  }
}

describe('bounded frame face presentation', () => {
  it.each([8, 9, 20])('contains plates for %i rows, including a top return listed last', count => {
    const node = liveFrame(count)
    const face = frameFace(node, { readable: true })
    expect(face.rows).toHaveLength(8)
    expect(face.omitted).toHaveLength(count - 8)
    expect(face.rows.map(slot => slot.id)).toEqual([...Array.from({ length: 7 }, (_, index) => `local:${index + 1}`), 'return:frame'])
    for (const slot of face.rows) {
      const y = slot.port[1] - node.anchor.position[1]
      expect(y - FRAME_FACE_ROW_HEIGHT / 2).toBeGreaterThanOrEqual(face.bottom)
      expect(y + FRAME_FACE_ROW_HEIGHT / 2).toBeLessThanOrEqual(face.top)
    }
    expect(face.rows.at(-1)?.port).toBe(node.anchor.ports['return:frame'])
  })

  it('keeps gaps and does not promote overflowing rows into vacancies', () => {
    const node = liveFrame(20)
    node.slots = node.slots.filter(slot => !['local:2', 'local:4', 'local:7'].includes(slot.id))
    const face = frameFace(node)
    expect(face.rows.map(slot => slot.id)).toEqual(['local:1', 'local:3', 'local:5', 'local:6', 'return:frame'])
    expect(face.omitted).toHaveLength(12)
    expect(face.rows.every(slot => slot.port === node.anchor.ports[slot.id])).toBe(true)
  })

  it('preserves all existing coordinates and inputs as the prefix grows', () => {
    const small = liveFrame(8)
    const grown = liveFrame(20)
    const before = structuredClone(grown)
    Object.freeze(grown.slots)
    grown.slots.forEach(slot => { Object.freeze(slot.port); Object.freeze(slot) })
    const early = frameFace(small)
    const later = frameFace(grown)
    expect(grown).toEqual(before)
    expect(grown.anchor.position).toEqual(small.anchor.position)
    expect(grown.anchor.size).toEqual(small.anchor.size)
    expect(later.rows).toEqual(early.rows)
    for (const slot of small.slots) expect(grown.anchor.ports[slot.id]).toEqual(slot.port)
    expect([...later.rows, ...later.omitted]).toHaveLength(grown.slots.length)
  })

  it('shows only active, selected, or reference-valued overflow terminals at exact canonical XYZ', () => {
    const node = liveFrame(20)
    node.slots.find(slot => slot.id === 'local:10')!.value = { kind: 'reference', javaType: 'Example', objectId: 'object:7' }
    const face = frameFace(node, { activeSlotId: 'local:8', selectedSlotId: 'local:19' })
    expect(face.terminals.map(slot => slot.id)).toEqual(['local:8', 'local:10', 'local:19'])
    expect(face.omitted).toHaveLength(12)
    for (const slot of face.terminals) {
      const local = frameTerminalPosition(slot, node)
      local.forEach((value, axis) => expect(value + node.anchor.position[axis]).toBeCloseTo(slot.port[axis], 12))
      expect(local[0]).toBeCloseTo(node.anchor.size[0] / 2 + 0.04)
      expect(local[2]).toBeCloseTo(node.anchor.size[2] * 0.18)
    }
  })

  it('does not duplicate fitting active or reference-valued slots as terminals', () => {
    const node = liveFrame(9)
    node.slots[0].value = { kind: 'reference', javaType: 'Example', objectId: 'object:7' }
    expect(frameFace(node, { activeSlotId: 'local:1', selectedSlotId: 'return:frame' }).terminals).toEqual([])
  })

  it('derives containment from height and heading size rather than a row count', () => {
    const node = liveFrame(20)
    expect(frameFace(node, { spacious: true }).omitted.some(slot => slot.role === 'return')).toBe(true)
    const larger = structuredClone(node)
    larger.anchor.size = [5.1, 8, 1.25]
    expect(frameFace(larger).rows.length).toBeGreaterThan(8)
    const aboveHeader = { ...node.slots[0], id: 'above', port: [node.slots[0].port[0], node.anchor.position[1] + 1.4, node.slots[0].port[2]] as Vec3 }
    expect(frameFace({ ...node, slots: [aboveHeader] }).omitted).toEqual([aboveHeader])
  })
})

describe('FrameSolid face integration', () => {
  beforeEach(() => {
    rendered.labels.length = 0
    rendered.rows.length = 0
    rendered.sizes.length = 0
    // As in the scope primitive tests, React DOM serializes R3F host elements.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  function render(node: SceneFrameNode, props: Partial<FrameSolidProps> = {}) {
    return renderToStaticMarkup(createElement(FrameSolid, { node, selected: false, related: false, onSelect: vi.fn(), readable: true, ...props }))
  }

  it.each([8, 9, 20])('renders only fitting plates and an exact disclosure for %i rows', count => {
    const node = liveFrame(count)
    const before = structuredClone(node)
    render(node)
    expect(rendered.rows).toHaveLength(8)
    expect(rendered.rows.every(row => row.y === row.slot.port[1] - node.anchor.position[1])).toBe(true)
    expect(rendered.sizes).toEqual([node.anchor.size])
    const metadata = rendered.labels.find(label => label.role === 'metadata')!
    if (count > 8) {
      expect(metadata.text).toContain(`+${count - 8} values · Inspector`)
      expect(metadata.densityEnabled).toBe(false)
    } else expect(metadata.text).not.toContain('Inspector')
    expect(node).toEqual(before)
  })

  it('places named overflow terminals at the original body-edge XYZ without mounting plates', () => {
    const node = liveFrame(20)
    node.slots.find(slot => slot.id === 'local:10')!.value = { kind: 'reference', javaType: 'Example', objectId: 'object:7' }
    const markup = render(node, { activeSlotId: 'local:8', selectedSlotId: 'local:19' })
    const names = ['local:8', 'local:10', 'local:19']
    expect(markup.match(/name="slot-terminal:/g)).toHaveLength(3)
    for (const id of names) {
      const slot = node.slots.find(slot => slot.id === id)!
      expect(markup).toContain(`name="slot-terminal:${id}" position="${frameTerminalPosition(slot, node).join(',')}"`)
      expect(rendered.rows.some(row => row.slot.id === id)).toBe(false)
      expect(rendered.labels.find(label => label.text === slot.name)?.densityEnabled).toBe(false)
    }
    expect(markup).not.toContain('slot-terminal:local:9')
  })

  it.each([false, true])('inspection=%s controls density policy for metadata and fitting rows', inspection => {
    render(liveFrame(8), { inspection })
    expect(rendered.labels.every(label => label.densityEnabled === !inspection)).toBe(true)
    expect(rendered.rows.every(row => row.densityEnabled === !inspection)).toBe(true)
  })

  it('keeps existing selection callbacks and accents on fitting rows', () => {
    const onSelectSlot = vi.fn()
    render(liveFrame(9), { selectedSlotId: 'local:1', activeSlotId: 'local:2', onSelectSlot })
    const selected = rendered.rows.find(row => row.slot.id === 'local:1')!
    expect(selected.selected).toBe(true)
    expect(rendered.rows.find(row => row.slot.id === 'local:2')?.active).toBe(true)
    selected.onSelect?.()
    expect(onSelectSlot).toHaveBeenCalledWith('local:1')
  })
})
