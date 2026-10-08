import { renderToStaticMarkup } from 'react-dom/server'
import { Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneReferenceEdge } from '../../contracts/world'

const rendered = vi.hoisted(() => ({ labels: [] as string[], points: [] as Vector3[][] }))
vi.mock('@react-three/drei', () => ({
  Line: ({ points }: { points: Vector3[] }) => { rendered.points.push(points); return null },
  Billboard: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('./RuntimeLabel', () => ({ RuntimeLabel: ({ text }: { text: string }) => { rendered.labels.push(text); return null } }))
vi.mock('./presentationMotion', () => ({ useReducedMotion: () => true, useMountSettle: vi.fn() }))

import { ReferenceCurve, referenceFaceCurve } from './ReferenceCurve'

function edge(): SceneReferenceEdge {
  return { id: 'reference:registry', source: { kind: 'class', classId: 'class:Registry', slotId: 'static:active' }, targetObjectId: 'object:41',
    from: [1, 2, -3], to: [8, -2, -5], fromFace: [1, 2, 1], toFace: [8, -2, 0.7] }
}

describe('reference face attachments', () => {
  beforeEach(() => { rendered.labels.length = 0; rendered.points.length = 0; vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => vi.restoreAllMocks())

  it('routes the visible/pickable curve between actual class/object faces and preserves canonical anchors', () => {
    const input = edge()
    const before = structuredClone(input)
    const curve = referenceFaceCurve(input)
    expect(curve.getPoint(0).toArray()).toEqual(input.fromFace)
    expect(curve.getPoint(1).toArray()).toEqual(input.toFace)
    expect(curve.v1.z).toBeGreaterThan(Math.max(input.fromFace![2], input.toFace![2]))
    expect(curve.v2.z).toBeGreaterThan(Math.max(input.fromFace![2], input.toFace![2]))
    expect(curve.getTangent(1).z).toBeLessThan(0)
    expect(input).toEqual(before)
  })

  it('uses the provided canonical ports when no face endpoints exist', () => {
    const input = { ...edge(), fromFace: undefined, toFace: undefined }
    const curve = referenceFaceCurve(input)
    expect(curve.getPoint(0).toArray()).toEqual(input.from)
    expect(curve.getPoint(1).toArray()).toEqual(input.to)
  })

  it.each([
    [[1, 2, 1], [1, 2, 1]],
    [[1, 2, 1], [1, -2, 1]],
    [[8, -2, 1], [-1, 2, 1]],
  ] as const)('keeps same-X, self and reverse-direction connectors finite: %o → %o', (from, to) => {
    const curve = referenceFaceCurve({ ...edge(), fromFace: from, toFace: to })
    expect(curve.getPoints(24).every(point => point.toArray().every(Number.isFinite))).toBe(true)
    expect(curve.getTangent(1).length()).toBeCloseTo(1)
  })

  it.each([false, true])('macro selection=%s preserves topology while budgeting the source label', selected => {
    renderToStaticMarkup(<ReferenceCurve edge={edge()} selected={selected} related={false} label="active" detailLevel="macro" onSelect={() => {}} />)
    expect(rendered.points).toHaveLength(1)
    expect(rendered.points[0][0].toArray()).toEqual(edge().fromFace)
    expect(rendered.labels).toEqual(selected ? ['active'] : [])
  })
})
