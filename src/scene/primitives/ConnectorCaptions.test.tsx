import { createContext, type ReactNode } from 'react'
import Reconciler from '@react-three/fiber/react-reconciler/index.js'
import { Vector3, type TubeGeometry } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneModel, SceneReferenceEdge, Vec3, WorldAnchor } from '../../contracts/world'
import type { SemanticTransition } from '../../motion/semanticTransition'
import type { RuntimeLabelProps } from './RuntimeLabel'

const rendered = vi.hoisted(() => ({
  labels: [] as RuntimeLabelProps[],
  lines: [] as Array<{ points: readonly (Vec3 | Vector3)[] }>,
  tubes: [] as TubeGeometry[],
  disposed: [] as TubeGeometry[],
  invalidate: vi.fn(),
}))
vi.mock('@react-three/drei', () => ({
  Line: (props: { points: readonly (Vec3 | Vector3)[] }) => { rendered.lines.push(props); return null },
  Billboard: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn(), useThree: () => rendered.invalidate }))
vi.mock('./RuntimeLabel', () => ({ RuntimeLabel: (props: RuntimeLabelProps) => { rendered.labels.push(props); return null } }))
vi.mock('./presentationMotion', () => ({ useReducedMotion: () => false, useMountSettle: vi.fn() }))
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')
  class TrackedTubeGeometry extends actual.TubeGeometry {
    constructor(...args: ConstructorParameters<typeof actual.TubeGeometry>) {
      super(...args)
      rendered.tubes.push(this)
    }
    override dispose() { rendered.disposed.push(this); super.dispose() }
  }
  return { ...actual, TubeGeometry: TrackedTubeGeometry }
})

import { fitFaceValue } from './faceText'
import { ReferenceCurve } from './ReferenceCurve'
import { ReturnFlow } from './ReturnFlow'
import { HistoricalFlow, IoEndpoint, SemanticFlowMotion } from './SemanticFlow'

const from: Vec3 = [-3, 1, 0.8], to: Vec3 = [4, -2, 0.9]
const anchor = (id: string, position: Vec3): WorldAnchor => ({
  entityId: id, region: 'heap', position, size: [3.8, 2.5, 1.7], ports: {}, bodyPort: position,
})
const sourceAnchor = anchor('source', [-4, 1, 0]), targetAnchor = anchor('target', [5, -2, 0])
function transition(): SemanticTransition {
  return { id: 'transfer', seq: 5, kind: 'field-write', label: 'store', evidence: 'observed', source: null, importance: 'normal',
    from: { kind: 'slot', id: 'source:field' }, to: { kind: 'slot', id: 'target:field' },
    value: { kind: 'primitive', javaType: 'int', value: 18 } }
}
function edge(): SceneReferenceEdge {
  return { id: 'reference:source:field', source: { kind: 'object', objectId: 'source', slotId: 'source:field' },
    targetObjectId: 'target', from, to, fromFace: from, toFace: to }
}
function returnFlow(): NonNullable<SceneModel['returnFlow']> {
  return { eventId: 'return:1', frameId: 'callee', destination: { frameId: 'caller', slotId: 'result' },
    value: { kind: 'primitive', javaType: 'long', value: '9223372036854775807' },
    from, to, fromLabel: 'child()', toLabel: 'caller()', fromDepth: 1, toDepth: 0 }
}
const coordinates = (point: Vec3 | Vector3) => point instanceof Vector3 ? point.toArray() : [...point]
const lastPoints = () => rendered.lines.at(-1)!.points

// Use Fiber's already installed React reconciler with inert host nodes. This
// exercises real hook/effect lifetimes in Node without a DOM, canvas or GPU.
type HostNode = { children: HostNode[]; visible: boolean }
const context = {}
let priority = 0
const append = (parent: HostNode, child: HostNode) => { parent.children.push(child) }
const remove = (parent: HostNode, child: HostNode) => { parent.children = parent.children.filter(node => node !== child) }
const insert = (parent: HostNode, child: HostNode, before: HostNode) => { parent.children.splice(parent.children.indexOf(before), 0, child) }
const reconciler = Reconciler({
  supportsMutation: true, supportsPersistence: false, supportsHydration: false, isPrimaryRenderer: false,
  createInstance: () => ({ children: [], visible: true }), createTextInstance: () => ({ children: [], visible: true }),
  appendInitialChild: append, appendChild: append, appendChildToContainer: append,
  removeChild: remove, removeChildFromContainer: remove, insertBefore: insert, insertInContainerBefore: insert,
  getRootHostContext: () => context, getChildHostContext: () => context, getPublicInstance: (node: HostNode) => node,
  prepareForCommit: () => null, resetAfterCommit: () => {}, finalizeInitialChildren: () => false,
  commitUpdate: () => {}, commitTextUpdate: () => {}, shouldSetTextContent: () => false,
  clearContainer: (node: HostNode) => { node.children = [] }, detachDeletedInstance: () => {},
  supportsMicrotasks: true, scheduleMicrotask: queueMicrotask, scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1,
  setCurrentUpdatePriority: (next: number) => { priority = next }, getCurrentUpdatePriority: () => priority,
  resolveUpdatePriority: () => priority || 32, trackSchedulerEvent: () => {},
  resolveEventType: () => null, resolveEventTimeStamp: () => -1.1, shouldAttemptEagerTransition: () => false,
  maySuspendCommit: () => false, preloadInstance: () => true, startSuspendingCommit: () => {},
  suspendInstance: () => {}, waitForCommitToBeReady: () => null,
  NotPendingTransition: null, HostTransitionContext: createContext(null),
} as unknown as Parameters<typeof Reconciler>[0])
const mounted = new Set<() => void>()
function render(element: ReactNode) {
  const onError = (error: Error) => { throw error }
  const root = reconciler.createContainer({ children: [], visible: true }, 1, null, false, null, '', onError, onError, onError, () => {})
  const update = (next: ReactNode) => {
    reconciler.updateContainerSync(next, root, null, null)
    reconciler.flushSyncWork()
    reconciler.flushPassiveEffects()
  }
  const unmount = () => { update(null); mounted.delete(unmount) }
  mounted.add(unmount)
  update(element)
  return { rerender: update, unmount }
}
function expectSingleLine(label: RuntimeLabelProps) {
  expect(Array.from(label.text).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)).toBe(false)
  expect(label.size).toBeGreaterThanOrEqual(0.18)
}

beforeEach(() => {
  rendered.labels.length = 0; rendered.lines.length = 0; rendered.tubes.length = 0; rendered.disposed.length = 0
  rendered.invalidate.mockClear()
})
afterEach(() => { for (const unmount of mounted) unmount(); vi.restoreAllMocks() })

describe('bounded connector and I/O captions', () => {
  it('marks long reference names, preserves the observed edge and retains the macro label policy', () => {
    const input = edge(), before = structuredClone(input)
    const label = 'customerAccountTransactionProcessingPipeline'.repeat(4)
    const view = render(<ReferenceCurve edge={input} label={label} selected related={false} detailLevel="macro" onSelect={() => {}} />)
    expect(rendered.labels.at(-1)).toMatchObject({ ...fitFaceValue(label, 0.19, 2.6), maxWidth: 2.6, align: 'center' })
    expect(rendered.labels.at(-1)!.text.endsWith('…')).toBe(true)
    expect(input).toEqual(before)
    rendered.labels.length = 0
    view.rerender(<ReferenceCurve edge={input} label={label} selected={false} related={false} detailLevel="macro" onSelect={() => {}} />)
    expect(rendered.labels).toHaveLength(0)
  })

  it.each(['stdout', 'stderr', 'stdin'] as const)('fits %s preview and count to the actual endpoint face without mutating input', id => {
    const preview = 'alpha\nbeta\t🟣'.repeat(50)
    const observations = 1_000_000
    render(<IoEndpoint id={id} position={[0, 0, 0]} preview={preview} observations={observations} />)
    expect(rendered.labels).toHaveLength(2)
    for (const label of rendered.labels) { expect(label.maxWidth).toBe(2.3); expectSingleLine(label) }
    expect(rendered.labels[1]).toMatchObject({ ...fitFaceValue(preview, 0.19, 2.3), maxWidth: 2.3 })
    expect(rendered.labels[1].text.endsWith('…')).toBe(true)
    expect(preview).toBe('alpha\nbeta\t🟣'.repeat(50))
  })

  it('keeps short I/O exact and omits a nonexistent preview', () => {
    const view = render(<IoEndpoint id="stdout" position={[0, 0, 0]} preview="18" />)
    expect(rendered.labels.map(label => label.text)).toEqual(['STDOUT', '18'])
    rendered.labels.length = 0
    view.rerender(<IoEndpoint id="stdout" position={[0, 0, 0]} />)
    expect(rendered.labels.map(label => label.text)).toEqual(['STDOUT'])
  })

  it('routes flow values through the single-line summary instead of splitting a UTF-16 prefix', () => {
    const input = { ...transition(), value: { kind: 'stringSummary' as const, javaType: 'String' as const, value: 'x'.repeat(23) + '🟣\nvalue\tend'.repeat(4) } }
    const before = structuredClone(input)
    render(<SemanticFlowMotion transition={input} from={from} to={to} behindZ={-4} quality="balanced" />)
    const label = rendered.labels.at(-1)!
    expect(label).toMatchObject({ ...fitFaceValue(input.value.value, 0.25, 2.6), maxWidth: 2.6 })
    expectSingleLine(label)
    expect(label.text).not.toMatch(/[\ud800-\udbff]$/)
    expect(input).toEqual(before)
  })

  it('bounds the return caption and marker while preserving the exact transfer value', () => {
    const input = returnFlow(), before = structuredClone(input)
    render(<ReturnFlow flow={input} guided playing={false} />)
    expect(rendered.labels).toHaveLength(2)
    for (const label of rendered.labels) { expect(label.maxWidth).toBe(2.6); expectSingleLine(label) }
    expect(rendered.labels[0].text.startsWith('return ')).toBe(true)
    expect(input).toEqual(before)
  })
})

describe('connector geometry reuse', () => {
  it.each([false, true])('reuses visible and picking history paths across array replacement; routed=%s', routed => {
    const props = { transition: transition(), from, to, onSelect: vi.fn(),
      sourceAnchor: routed ? sourceAnchor : undefined, targetAnchor: routed ? targetAnchor : undefined }
    const view = render(<HistoricalFlow {...props} behindZ={-4} />)
    const first = lastPoints()
    expect(rendered.lines[0].points).toBe(first)
    expect(coordinates(first[0])).toEqual(from)
    expect(coordinates(first.at(-1)!)).toEqual(to)
    view.rerender(<HistoricalFlow {...props} from={[...from]} to={[...to]} transition={{ ...props.transition }} selected behindZ={-200} />)
    expect(lastPoints()).toBe(first)
    expect(rendered.lines.at(-2)!.points).toBe(first)
    view.rerender(<HistoricalFlow {...props} to={[to[0], to[1] + 1, to[2]]} />)
    expect(lastPoints()).not.toBe(first)
    expect(coordinates(lastPoints().at(-1)!)).toEqual([to[0], to[1] + 1, to[2]])
    if (routed) {
      const changed = lastPoints()
      view.rerender(<HistoricalFlow {...props} to={[to[0], to[1] + 1, to[2]]} targetAnchor={{ ...targetAnchor, size: [5, 4, 1.7] }} />)
      expect(lastPoints()).not.toBe(changed)
    }
  })

  it('reuses active-motion paths when only caption/quality changes, and invalidates changed endpoints', () => {
    const props = { transition: transition(), from, to, sourceAnchor, targetAnchor, behindZ: -4 }
    const view = render(<SemanticFlowMotion {...props} quality="balanced" />)
    const first = lastPoints()
    view.rerender(<SemanticFlowMotion {...props} from={[...from]} to={[...to]} quality="high" transition={{ ...props.transition, label: 'another caption' }} />)
    expect(lastPoints()).toBe(first)
    view.rerender(<SemanticFlowMotion {...props} to={[to[0] + 1, to[1], to[2]]} quality="high" />)
    expect(lastPoints()).not.toBe(first)
  })

  it('reuses return points across new vector arrays and value changes, with exact endpoints', () => {
    const input = returnFlow()
    const view = render(<ReturnFlow flow={input} guided playing={false} />)
    const first = lastPoints()
    expect(coordinates(first[0])).toEqual(from)
    expect(coordinates(first.at(-1)!)).toEqual(to)
    view.rerender(<ReturnFlow flow={{ ...input, from: [...from], to: [...to], value: { kind: 'primitive', javaType: 'int', value: 18 } }} guided={false} playing={false} />)
    expect(lastPoints()).toBe(first)
    expect(rendered.labels.at(-1)!.text).toBe('18')
    view.rerender(<ReturnFlow flow={{ ...input, to: [to[0] + 1, to[1], to[2]] }} guided playing={false} />)
    expect(lastPoints()).not.toBe(first)
  })

  it('reuses reference points and picking tube until face endpoints/anchors change, then disposes retired geometry', () => {
    const input = edge()
    const props = { edge: input, label: 'active', selected: false, related: false, onSelect: vi.fn(), sourceAnchor, targetAnchor }
    const view = render(<ReferenceCurve {...props} />)
    const first = lastPoints(), tube = rendered.tubes[0]
    view.rerender(<ReferenceCurve {...props} selected edge={{ ...input, from: [...from], to: [...to], fromFace: [...from], toFace: [...to] }} />)
    expect(lastPoints()).toBe(first)
    expect(rendered.tubes).toEqual([tube])
    expect(rendered.disposed).toHaveLength(0)
    view.rerender(<ReferenceCurve {...props} edge={{ ...input, toFace: [to[0] + 1, to[1], to[2]] }} />)
    expect(lastPoints()).not.toBe(first)
    expect(rendered.tubes).toHaveLength(2)
    expect(rendered.disposed).toContain(tube)
    const second = rendered.tubes[1]
    const changed = lastPoints()
    view.rerender(<ReferenceCurve {...props} edge={{ ...input, toFace: [to[0] + 1, to[1], to[2]] }} targetAnchor={{ ...targetAnchor, size: [5, 4, 1.7] }} />)
    expect(lastPoints()).not.toBe(changed)
    expect(rendered.tubes).toHaveLength(3)
    expect(rendered.disposed).toContain(second)
    const third = rendered.tubes[2]
    view.unmount()
    expect(rendered.disposed).toContain(third)
  })
})
