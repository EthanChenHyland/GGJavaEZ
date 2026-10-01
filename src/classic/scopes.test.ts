import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, TraceDocument, TraceEvent, TraceEventBase } from '../contracts/runtime'
import type { SceneFrameNode, SceneModel } from '../contracts/world'
import { createScopedLayout } from '../examples/scopedLayout'
import { layoutForTrace as createLayout } from '../app/layoutForTrace'
import { buildSceneModel } from '../world/sceneModel'
import { seek } from '../runtime'
import { loadControlTrace } from '../examples/traces'
import { ClassicRuntime } from './ClassicRuntime'
import { buildClassicScene, emphasizedSlot, selectedBounds } from './classicScene'
import { focusClassicView } from './viewport'

const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
const local = (id: string, scopeId: string, name = id): RuntimeSlot => ({ id, scopeId, name, javaType: 'int', value: int(7) })
const slots = [local('input', 'entry'), local('sum', 'entry'), local('index', 'loop'), local('sample', 'body'), local('accepted', 'body'),
  local('argument', 'call-root'), local('adjusted', 'branch'), local('alternative', 'else-branch')]
let seq = 0
type EventPayload = TraceEvent extends infer E ? E extends TraceEvent ? Omit<E, keyof TraceEventBase> : never : never
const event = (payload: EventPayload): TraceEvent =>
  ({ ...payload, eventId: `e${++seq}`, seq, source: null, label: '', importance: 'normal' } as TraceEvent)
const enter = (frameId: string, scopeId: string, parentId: string | null, labelScope: string) => event({ type: 'ENTER_SCOPE', frameId, scopeId, parentId, labelScope })
const declare = (frameId: string, slot: RuntimeSlot) => event({ type: 'DECLARE_LOCAL', frameId, slot })
const trace: TraceDocument = { schemaVersion: 1, demoId: 'projection-test', sourceFiles: [], events: [
  event({ type: 'ENTER_METHOD', frameId: 'entry-frame', callerFrameId: null, className: 'Example', methodName: 'run', locals: [] }),
  enter('entry-frame', 'entry', null, 'method body'), ...slots.slice(0, 2).map((slot) => declare('entry-frame', slot)),
  enter('entry-frame', 'loop', 'entry', 'repeat'), declare('entry-frame', slots[2]),
  enter('entry-frame', 'body', 'loop', 'iteration body'), ...slots.slice(3, 5).map((slot) => declare('entry-frame', slot)),
  event({ type: 'ENTER_METHOD', frameId: 'call-frame', callerFrameId: 'entry-frame', className: 'Example', methodName: 'normalize', locals: [], returnType: 'int' }),
  enter('call-frame', 'call-root', null, 'method body'), declare('call-frame', slots[5]),
  enter('call-frame', 'branch', 'call-root', 'negative branch'), declare('call-frame', slots[6]),
  enter('call-frame', 'else-branch', 'call-root', 'fallback branch'), declare('call-frame', slots[7]),
  enter('call-frame', 'empty', 'call-root', 'empty block'),
] }
const layout = createScopedLayout(trace)
const node = (id: string, liveSlots: string[], activeScopes: string[]): SceneFrameNode => ({
  kind: 'frame', id, label: id === 'entry-frame' ? 'run()' : 'normalize(7)', depth: id === 'entry-frame' ? 0 : 1,
  active: id === 'call-frame', anchor: layout.anchors[id],
  scopes: activeScopes.map((id) => layout.scopes![id]),
  slots: slots.filter((slot) => liveSlots.includes(slot.id)).map((slot) => ({ ...slot, port: layout.anchors[id].ports[slot.id], scopeDepth: layout.scopes![slot.scopeId!]!.depth })),
})
const entry = () => node('entry-frame', ['input', 'sum', 'index', 'sample', 'accepted'], ['entry', 'loop', 'body'])
const call = () => node('call-frame', ['argument', 'adjusted'], ['call-root', 'branch'])
const scene = (frames = [entry(), call()]): SceneModel => ({ frames, objects: [], references: [], activeEventId: null,
  detailLevel: 'meso', stackDepth: 1, layoutKind: 'scoped', bounds: layout.bounds })
const render = (model: SceneModel, current: TraceEvent | null = null, guided = true) => renderToStaticMarkup(createElement(ClassicRuntime, {
  scene: model, event: current, guided, selection: null, onSelect: () => {}, onFocusSelected: () => {},
}))

describe('Classic lexical scope projection', () => {
  it('preserves every fixture variable and scope anchor through complete forward/backward seek', () => {
    const fixture = loadControlTrace(), reserved = createLayout(fixture)
    const positions = new Map<string, unknown>()
    const cursors = Array.from({ length: fixture.events.length + 1 }, (_, cursor) => cursor)
    for (const cursor of [...cursors, ...[...cursors].reverse()]) {
      const model = buildSceneModel(seek(fixture, cursor), reserved, 'meso')
      const diagram = buildClassicScene(model, fixture.events[cursor - 1] ?? null)
      for (const entity of diagram.entities.filter((entity) => entity.kind === 'frame')) {
        const frame = model.frames.find((frame) => frame.id === entity.id)!
        expect(entity.slots.map((row) => row.slot.id)).toEqual(frame.slots.map((slot) => slot.id))
        expect(entity.scopes!.map((scope) => scope.id)).toEqual(frame.scopes!.filter((scope) => scope.parentId !== null).map((scope) => scope.id))
        for (const projected of [...entity.slots.map((row) => ({ id: row.slot.id, rect: row.rect })), ...entity.scopes!]) {
          if (positions.has(projected.id)) expect(projected.rect).toEqual(positions.get(projected.id))
          else positions.set(projected.id, projected.rect)
          expect(projected.rect.y + projected.rect.height).toBeLessThanOrEqual(560)
        }
      }
    }
  })

  it('fits separated invocation bands, scope headers and live rows without overlaps', () => {
    const diagram = buildClassicScene(scene())
    const [main, callee] = diagram.entities
    expect(callee.rect.y + callee.rect.height).toBeLessThan(main.rect.y)
    for (const frame of diagram.entities) {
      expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(560)
      for (const row of frame.slots) {
        expect(row.rect.y).toBeGreaterThanOrEqual(frame.rect.y + frame.headingHeight!)
        expect(row.rect.y + row.rect.height).toBeLessThanOrEqual(frame.rect.y + frame.rect.height)
      }
      for (const scope of frame.scopes!) {
        expect(scope.headingHeight).toBeGreaterThan(0)
        for (const row of frame.slots.filter((row) => scope.slotIds.includes(row.slot.id))) {
          expect(row.rect.y).toBeGreaterThanOrEqual(scope.rect.y + scope.headingHeight - 1e-8)
          expect(row.rect.y + row.rect.height).toBeLessThanOrEqual(scope.rect.y + scope.rect.height)
          expect(row.rect.x).toBe(scope.rect.x)
        }
      }
      const ordered = [...frame.slots].sort((a, b) => a.rect.y - b.rect.y)
      for (let i = 1; i < ordered.length; i++) expect(ordered[i].rect.y).toBeGreaterThanOrEqual(ordered[i - 1].rect.y + ordered[i - 1].rect.height - 1e-8)
    }
    expect(main.scopes!.map((scope) => scope.id)).toEqual(['loop', 'body'])
    expect(main.scopes![1].rect.x).toBeGreaterThan(main.scopes![0].rect.x)
  })

  it('keeps reserved rows fixed through scope closure, re-entry and unordered live slots', () => {
    const original = buildClassicScene(scene()).entities[0]
    const snapshots = [entry(), node('entry-frame', ['input', 'sum', 'index'], ['entry', 'loop']), node('entry-frame', ['sum', 'input'], ['entry']), entry()]
    for (const snapshot of snapshots) {
      snapshot.slots.reverse()
      const projected = buildClassicScene(scene([snapshot])).entities[0]
      expect(projected.rect).toEqual(original.rect)
      for (const row of projected.slots) expect(row.rect).toEqual(original.slots.find((reserved) => reserved.slot.id === row.slot.id)!.rect)
      expect(projected.slots.map((row) => row.slot.id).sort()).toEqual(snapshot.slots.map((slot) => slot.id).sort())
    }
    const closed = scene([snapshots[2]])
    expect(render(closed)).not.toContain('data-scope-id=')
    expect(render(closed)).not.toContain('data-slot-id="sample"')
    expect(selectedBounds(buildClassicScene(closed), { kind: 'slot', id: 'sample' })).toBeNull()
  })

  it('reuses mutually exclusive sibling bands and shows an empty active block without invented locals', () => {
    const before = buildClassicScene(scene()).entities[1]
    const alternative = node('call-frame', ['argument', 'alternative'], ['call-root', 'else-branch'])
    const after = buildClassicScene(scene([entry(), alternative])).entities[1]
    expect(after.slots[1].rect).toEqual(before.slots[1].rect)
    expect(after.scopes![0].rect).toEqual(before.scopes![0].rect)
    const empty = scene([node('call-frame', ['argument'], ['call-root', 'empty'])])
    expect(render(empty)).toContain('Active scope empty block')
    expect(render(empty)).not.toContain('data-slot-id="adjusted"')
    expect(render(empty)).not.toContain('data-scope-id="call-root"')
  })

  it('retains scope truth and keyboard selection with guidance off and focuses inset variable rows', () => {
    const model = scene(), markup = render(model, null, false), diagram = buildClassicScene(model)
    expect(markup).toContain('Active scope iteration body')
    expect(markup).toContain('data-slot-id="sample"')
    expect(markup).toContain('tabindex="0"')
    for (const frame of diagram.entities) for (const row of frame.slots) {
      const bounds = selectedBounds(diagram, { kind: 'slot', id: row.slot.id })!
      const focused = focusClassicView(bounds)
      expect(bounds.x).toBeGreaterThanOrEqual(focused.x)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(focused.y + focused.height)
    }
  })

  it('emphasizes the exact input destination without hiding its value when guidance is off', () => {
    const input: TraceEvent = { type: 'INPUT_READ', eventId: 'input-event', seq: 30, source: null, label: '', importance: 'normal',
      frameId: 'entry-frame', readerObjectId: 'reader', method: 'nextInt', inputIndex: 0, destinationSlotId: 'sample', text: '7', value: int(7) }
    expect(emphasizedSlot(input)).toBe('sample')
    expect(render(scene(), input)).toContain('fill="#FFC857"')
    expect(render(scene(), input, false)).not.toContain('fill="#FFC857"')
    expect(render(scene(), input, false)).toContain('sample, int, 7')
  })

  it('shows return transfer only for the current return or its matching exit, keeping history out of later calls', () => {
    const flow: NonNullable<SceneModel['returnFlow']> = { eventId: 'return-event', frameId: 'call-frame', destination: { frameId: 'entry-frame', slotId: 'accepted' }, value: int(7),
      from: layout.anchors['call-frame'].ports['return:call-frame'], to: layout.anchors['entry-frame'].ports.accepted,
      fromLabel: 'normalize(7)', toLabel: 'run()', fromDepth: 1, toDepth: 0 }
    const returning = { ...scene(), activeEventId: flow.eventId, returnFlow: flow }
    const transfer = buildClassicScene(returning).returnTransfer!
    expect(transfer.value).toBe('7')
    const exit: TraceEvent = { type: 'EXIT_METHOD', eventId: 'exit', seq: 31, source: null, label: '', importance: 'normal', frameId: 'call-frame' }
    const departed = { ...returning, frames: returning.frames.map(node => node.id === flow.frameId ? { ...node, active: false, historical: true, invocationStatus: 'completed' as const } : node), activeEventId: exit.eventId }
    expect(buildClassicScene(departed, exit).returnTransfer).toEqual(transfer)
    expect(buildClassicScene({ ...returning, activeEventId: 'next-call' }).returnTransfer).toBeNull()
    expect(render({ ...returning, activeEventId: 'next-call' })).not.toContain('data-return-event=')
    expect(buildClassicScene(departed, { ...exit, frameId: 'entry-frame' }).returnTransfer).toBeNull()
  })
})
