import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneFrameNode, SceneModel, SceneSlot } from '../contracts/world'
import { ClassicRuntime } from './ClassicRuntime'
import { buildClassicScene, emphasizedSlot, selectedBounds } from './classicScene'
import { classicHomeView, focusClassicView } from './viewport'

const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
const slot = (id: string, name: string, role: SceneSlot['role'], value: SceneSlot['value']): SceneSlot => ({
  id, name, role, javaType: 'int', value, port: [0, 0, 0],
})
const frames: SceneFrameNode[] = Array.from({ length: 6 }, (_, depth) => {
  const id = `invocation-${depth}`
  return {
    kind: 'frame', id, label: depth === 0 ? 'main()' : `factorial(${6 - depth})`, depth, active: depth === 5,
    anchor: { entityId: id, region: 'stack', position: [depth, depth, -depth], size: [5.1, 2.14, 1.25], ports: {}, bodyPort: [0, 0, 0] },
    slots: depth === 0 ? [slot('main-result', 'result', 'local', { kind: 'uninitialized' })] : [
      slot(`${id}-n`, 'n', 'parameter', int(6 - depth)),
      slot(`${id}-child`, 'child', 'operand', { kind: 'uninitialized' }),
      slot(`return:${id}`, 'return', 'return', { kind: 'uninitialized' }),
    ],
  }
})
const overview = (live = frames): SceneModel => ({ frames: live, objects: [], references: [], activeEventId: null, detailLevel: 'meso', stackDepth: 5 })
const returnFlow: NonNullable<SceneModel['returnFlow']> = {
  eventId: 'return-three', frameId: 'invocation-3', destination: { frameId: 'invocation-2', slotId: 'invocation-2-child' },
  value: int(6), expression: '3 × 2 = 6', from: [3, 3, -3], to: [2, 2, -2],
  fromLabel: 'factorial(3)', toLabel: 'factorial(4)', fromDepth: 3, toDepth: 2,
}
const returnEvent: TraceEvent = {
  type: 'RETURN_VALUE', eventId: returnFlow.eventId, seq: 1, source: null, label: 'factorial(3) returns 6', importance: 'major',
  frameId: returnFlow.frameId, destination: returnFlow.destination, value: returnFlow.value, expression: returnFlow.expression,
}
const returning = (live = frames.slice(0, 4)): SceneModel => ({ ...overview(live), activeEventId: returnFlow.eventId, returnFlow })
const render = (scene: SceneModel, playing = false, guided = true, event: TraceEvent | null = returnEvent) => renderToStaticMarkup(createElement(ClassicRuntime, {
  scene, playing, guided, event, selection: null, onSelect: () => {}, onFocusSelected: () => {},
}))

describe('Classic deep call stack', () => {
  it('fits six ordered frames and every local, operand, and return row in the overview', () => {
    const diagram = buildClassicScene(overview())
    expect(diagram.deepStack).toBe(true)
    expect(diagram.entities).toHaveLength(6)
    for (const [index, frame] of diagram.entities.entries()) {
      expect(frame.rect.y).toBeGreaterThanOrEqual(classicHomeView.y)
      expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(classicHomeView.height)
      if (index) expect(frame.rect.y + frame.rect.height).toBeLessThan(diagram.entities[index - 1].rect.y)
      for (const row of frame.slots) {
        expect(row.rect.y).toBeGreaterThan(frame.rect.y)
        expect(row.rect.y + row.rect.height).toBeLessThan(frame.rect.y + frame.rect.height)
      }
      const focused = focusClassicView(selectedBounds(diagram, { kind: 'frame', id: frame.id })!)
      expect(frame.rect.y).toBeGreaterThanOrEqual(focused.y)
      expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(focused.y + focused.height)
    }
  })

  it('reserves positions from maximum trace depth as frames appear and disappear', () => {
    const all = buildClassicScene(overview())
    for (const count of [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]) {
      const diagram = buildClassicScene(overview(frames.slice(0, count)))
      for (const frame of diagram.entities) expect(frame.rect).toEqual(all.entities.find((node) => node.id === frame.id)!.rect)
      expect(diagram.entities).toHaveLength(count)
    }
  })

  it('projects returns into the actual caller operand with a stable origin after the callee exits', () => {
    const before = buildClassicScene(returning()), after = buildClassicScene(returning(frames.slice(0, 3)))
    expect(after.returnTransfer).toEqual(before.returnTransfer)
    expect(after.entities.some((node) => node.id === returnFlow.frameId)).toBe(false)
    const transfer = after.returnTransfer!
    const operand = after.entities.flatMap((node) => node.slots).find((row) => row.slot.id === returnFlow.destination!.slotId)!
    expect(transfer.to).toEqual([operand.rect.x + operand.rect.width, operand.rect.y + operand.rect.height / 2])
    expect(transfer.value).toBe('6')
    expect(transfer.expression).toBe('3 × 2 = 6')
    expect(emphasizedSlot(returnEvent)).toBe(operand.slot.id)
    expect(after.references).toEqual([])
  })

  it('keeps invocation activity and evaluation vocabulary readable with guidance off', () => {
    const markup = render(overview(), false, false, null)
    expect(markup).toContain('factorial(1)')
    expect(markup).toContain('call result (operand)')
    expect(markup).toContain('pending')
    expect(markup).toContain('EXECUTING')
    expect(markup).toContain('tabindex="0"')
  })

  it('animates only the current played return, retaining exact values when paused or scrubbing', () => {
    const paused = render(returning()), played = render(returning(), true)
    expect(paused).toContain('factorial(3) returns 6')
    expect(paused).toContain('3 × 2 = 6')
    expect(paused).toContain('factorial(4) · call result')
    expect(paused).not.toContain('animateMotion')
    expect(played).toContain('animateMotion')
    expect(render(returning(), true, false)).not.toContain('animateMotion')
    expect(render(returning(), true, true, { ...returnEvent, eventId: 'other' })).not.toContain('animateMotion')
  })

  it('does not fabricate a final frame or a destination after main has returned', () => {
    const final = buildClassicScene(returning([]))
    expect(final.entities).toEqual([])
    expect(final.returnTransfer).toBeNull()
  })
})
