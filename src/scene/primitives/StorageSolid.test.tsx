import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneClassNode, SceneObjectNode, SceneSlot, Vec3 } from '../../contracts/world'
import type { RuntimeLabelProps } from './RuntimeLabel'
import type { RuntimeSlotProps } from './RuntimeSlot'

const rendered = vi.hoisted(() => ({
  labels: [] as RuntimeLabelProps[],
  rows: [] as RuntimeSlotProps[],
  sizes: [] as Vec3[],
}))
vi.mock('./RuntimeLabel', () => ({ RuntimeLabel: (props: RuntimeLabelProps) => { rendered.labels.push(props); return null } }))
vi.mock('./RuntimeSlot', async () => {
  const actual = await vi.importActual<typeof import('./RuntimeSlot')>('./RuntimeSlot')
  return { ...actual, RuntimeSlot: (props: RuntimeSlotProps) => { rendered.rows.push(props); return null } }
})
vi.mock('./SolidBody', () => ({
  SolidBody: ({ size }: { size: Vec3 }) => { rendered.sizes.push(size); return null },
  SolidFace: () => null,
}))
vi.mock('./presentationMotion', () => ({ useReducedMotion: () => true, useMountSettle: vi.fn() }))

import { ClassSolid } from './ClassSolid'
import { ObjectSolid, type ObjectSolidProps } from './ObjectSolid'

const position: Vec3 = [8, -2, -5]
const size: Vec3 = [3.8, 4.1, 1.7]
function fields(count = 6): SceneSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `field:${index}`, name: `value${index}`, javaType: 'int',
    value: { kind: 'primitive', javaType: 'int', value: index },
    port: [position[0] + size[0] / 2 - 0.24, position[1] + size[1] / 2 - 1.07 - index * 0.52, position[2] + size[2] / 2 + 0.055],
  }))
}
function object(): SceneObjectNode {
  const slots = fields()
  return { kind: 'object', id: 'object:41', className: 'project.Account', label: 'Account #41', displayId: 41, fields: slots,
    anchor: { entityId: 'object:41', region: 'heap', position, size, ports: Object.fromEntries(slots.map(slot => [slot.id, slot.port])), bodyPort: position } }
}
function classNode(): SceneClassNode {
  const slots = fields()
  return { kind: 'class', id: 'class:project.Registry', className: 'project.Registry', label: 'Registry', initialization: 'observed', fields: slots,
    anchor: { entityId: 'class:project.Registry', region: 'class', position, size, ports: Object.fromEntries(slots.map(slot => [slot.id, slot.port])), bodyPort: position } }
}
function render(props: Partial<ObjectSolidProps> = {}) {
  return renderToStaticMarkup(<ObjectSolid node={object()} selected={false} related={false} onSelect={() => {}} {...props} />)
}
function reset() { rendered.labels.length = 0; rendered.rows.length = 0; rendered.sizes.length = 0 }

describe('shared instance/class storage faces', () => {
  beforeEach(() => { reset(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => vi.restoreAllMocks())

  it('keeps surviving field rows at their original world positions when earlier observations retire', () => {
    const node = object()
    const before = structuredClone(node)
    render({ node })
    const rows = new Map(rendered.rows.map(row => [row.slot.id, row.y]))
    reset()
    render({ node: { ...node, fields: node.fields.slice(2) } })
    for (const row of rendered.rows) {
      expect(row.y).toBe(rows.get(row.slot.id))
      expect(row.y + position[1]).toBeCloseTo(row.slot.port[1])
    }
    expect(node).toEqual(before)
  })

  it('bounds oversized field surfaces, discloses overflow and keeps the actual records untouched', () => {
    const node = { ...object(), fields: fields(100) }
    const before = structuredClone(node)
    render({ node })
    expect(rendered.sizes).toEqual([size])
    expect(rendered.rows.map(row => row.slot.id)).toEqual(Object.keys(node.anchor.ports))
    expect(rendered.rows.length).toBeLessThanOrEqual(6)
    expect(rendered.labels.map(label => label.text)).toContain(`HEAP OBJECT · +${node.fields.length - rendered.rows.length} values · Inspector`)
    for (const row of rendered.rows) {
      expect(row.y - 0.22).toBeGreaterThanOrEqual(-size[1] / 2 + 0.07)
      expect(row.y + 0.22).toBeLessThanOrEqual(size[1] / 2 - 0.84)
    }
    expect(node).toEqual(before)
  })

  it('suppresses macro fields but discloses observed state and retains identity', () => {
    render({ detailLevel: 'macro' })
    expect(rendered.rows).toHaveLength(0)
    expect(rendered.labels.map(label => label.text)).toEqual(['HEAP OBJECT', 'Account', '#41', '6 observed values'])
    expect(rendered.sizes).toEqual([size])
  })

  it.each([{ selected: true }, { selectedSlotId: 'field:3' }, { inspection: true }])('keeps selected/inspected macro fields readable %o', props => {
    render({ detailLevel: 'macro', ...props })
    expect(rendered.rows).toHaveLength(6)
  })

  it('shows actual static fields under CLASS STATE without inventing an object identity', () => {
    const node = classNode()
    const before = structuredClone(node)
    const onSelectSlot = vi.fn()
    renderToStaticMarkup(<ClassSolid node={node} selected related={false} onSelect={() => {}} onSelectSlot={onSelectSlot} selectedSlotId="field:3" />)
    expect(rendered.labels.map(label => label.text)).toEqual(['CLASS STATE', 'Registry'])
    expect(rendered.rows.map(row => row.slot)).toEqual(node.fields)
    expect(rendered.rows[3].selected).toBe(true)
    rendered.rows[3].onSelect?.()
    expect(onSelectSlot).toHaveBeenCalledWith('field:3')
    expect(node).toEqual(before)
  })

  it('forwards the actual class identity to the composition seam for class selection', () => {
    const onSelect = vi.fn()
    const node = classNode()
    const element = ClassSolid({ node, selected: false, related: false, onSelect: id => onSelect({ kind: 'class', id }) })
    expect(element.props.node.kind).toBe('class')
    element.props.onSelect(node.id)
    expect(onSelect).toHaveBeenCalledWith({ kind: 'class', id: node.id })
    expect(element.props.animateEntry).toBe(false)
  })

  it.each(['object', 'class'] as const)('does not draw duplicate %s rows from unreserved body fallback ports', kind => {
    const node = kind === 'class' ? classNode() : object()
    node.anchor.ports = Object.fromEntries(node.fields.slice(0, 2).map(slot => [slot.id, slot.port]))
    node.fields = node.fields.map((field, index) => index < 2 ? field : { ...field, port: node.anchor.bodyPort })
    const before = structuredClone(node)
    const props = { selected: true, related: false, onSelect: () => {}, inspection: true, selectedSlotId: 'field:5' }
    renderToStaticMarkup(node.kind === 'class' ? <ClassSolid node={node} {...props} /> : <ObjectSolid node={node} {...props} />)
    expect(rendered.rows.map(row => row.slot.id)).toEqual(['field:0', 'field:1'])
    expect(rendered.labels[0].text).toContain('+4 values · Inspector')
    expect(rendered.labels.map(label => label.text)).toContain('Selected value5: 5 · Inspector')
    expect(node).toEqual(before)
  })

  it.each(['object', 'class'] as const)('retains a selected off-face %s field as a named marker at its real XYZ', kind => {
    const node = kind === 'class' ? classNode() : object()
    const overflow = fields(10).at(-1)!
    node.fields.push(overflow)
    node.anchor.ports[overflow.id] = overflow.port
    const before = structuredClone(node)
    const props = { selected: false, related: false, onSelect: () => {}, selectedSlotId: overflow.id, detailLevel: 'macro' as const }
    const markup = renderToStaticMarkup(node.kind === 'class' ? <ClassSolid node={node} {...props} /> : <ObjectSolid node={node} {...props} />)
    const local = overflow.port.map((value, axis) => value - position[axis])
    expect(markup).toContain(`name="slot-terminal:${overflow.id}" position="${local.join(',')}"`)
    expect(rendered.rows.some(row => row.slot.id === overflow.id)).toBe(false)
    expect(rendered.labels.map(label => label.text)).toContain('value9: 9')
    expect(node).toEqual(before)
  })

  it('keeps the six-row budget while representing selected and active overflow fields at their original ports', () => {
    const node = object()
    node.fields = fields(8).map((field, index) => ({ ...field, port: [field.port[0], position[1] + 0.98 - index * 0.455, field.port[2]] as Vec3 }))
    node.anchor.ports = Object.fromEntries(node.fields.map(field => [field.id, field.port]))
    const before = structuredClone(node)
    const markup = render({ node, selectedSlotId: 'field:6', activeSlotId: 'field:7' })
    expect(rendered.rows.map(row => row.slot.id)).toEqual(node.fields.slice(0, 6).map(field => field.id))
    for (const field of node.fields.slice(6)) {
      const local = field.port.map((value, axis) => value - position[axis])
      expect(markup).toContain(`name="slot-terminal:${field.id}" position="${local.join(',')}"`)
      expect(rendered.labels.map(label => label.text)).toContain(`${field.name}: ${field.value.kind === 'primitive' ? field.value.value : '?'}`)
    }
    expect(node).toEqual(before)
  })
})
