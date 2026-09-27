import { beforeEach, describe, expect, it } from 'vitest'
import type { WorldAnchor } from '../contracts/world'
import {
  defaultHomePose, detailLevelAtDistance, homePose, navigationActions, selectionPoint, useNavigationStore,
} from './navigation'

const person: WorldAnchor = {
  entityId: 'obj-person-17', region: 'heap', position: [5, 1, -2], size: [3.2, 2.1, 0.85],
  ports: { 'slot-age': [6, 1, -1.5] }, bodyPort: [3.4, 1, -2],
}

beforeEach(() => {
  useNavigationStore.setState({
    mode: 'HOME', pose: defaultHomePose, previousPose: null, previousMode: null,
    detailLevel: 'meso', followEnabled: false, selection: null, traceReferenceId: null,
    intent: null, intentRevision: 0,
  })
})

describe('navigation presentation state', () => {
  it('lets explicit user exploration cancel follow and pending camera intents', () => {
    navigationActions.followExecution()
    expect(useNavigationStore.getState().mode).toBe('GUIDED_FOLLOW')
    expect(useNavigationStore.getState().followEnabled).toBe(true)

    navigationActions.freeExplore()
    expect(useNavigationStore.getState().mode).toBe('FREE_EXPLORE')
    expect(useNavigationStore.getState().followEnabled).toBe(false)
    expect(useNavigationStore.getState().intent).toBeNull()
  })

  it('remembers the prior pose and mode for Focus return', () => {
    navigationActions.focus({ kind: 'object', id: 'obj-person-17' })
    expect(useNavigationStore.getState().previousPose).toEqual(defaultHomePose)
    expect(useNavigationStore.getState().mode).toBe('FOCUS_ENTITY')
    navigationActions.returnToPrevious()
    expect(useNavigationStore.getState().mode).toBe('HOME')
    expect(useNavigationStore.getState().intent).toEqual({ kind: 'returnToPrevious' })
  })

  it('resolves object, slot and reference positions from stable world data', () => {
    const world = {
      anchors: { [person.entityId]: person },
      references: [{ id: 'ref:p', source: { kind: 'frame' as const, frameId: 'frame-main', slotId: 'p' },
        targetObjectId: person.entityId, from: [-2, 1, 0] as const, to: person.bodyPort }],
    }
    expect(selectionPoint({ kind: 'object', id: person.entityId }, world)?.position).toEqual(person.position)
    expect(selectionPoint({ kind: 'slot', id: 'slot-age' }, world)?.position).toEqual(person.ports['slot-age'])
    expect(selectionPoint({ kind: 'reference', id: 'ref:p' }, world)?.position).toEqual([0.7, 1, -1])
  })
})

describe('semantic camera scale', () => {
  it('uses hysteresis at both detail boundaries', () => {
    expect(detailLevelAtDistance(23, 'meso')).toBe('macro')
    expect(detailLevelAtDistance(19, 'macro')).toBe('macro')
    expect(detailLevelAtDistance(18, 'macro')).toBe('meso')
    expect(detailLevelAtDistance(9, 'meso')).toBe('micro')
    expect(detailLevelAtDistance(11, 'micro')).toBe('micro')
    expect(detailLevelAtDistance(12, 'micro')).toBe('meso')
  })

  it('preserves the overview viewing offset when the world target changes', () => {
    const shifted = homePose([1, 2, 3])
    expect(shifted.target).toEqual([1, 2, 3])
    expect(shifted.position.map((value, index) => value - shifted.target[index])).toEqual(
      defaultHomePose.position.map((value, index) => value - defaultHomePose.target[index]),
    )
  })
})
