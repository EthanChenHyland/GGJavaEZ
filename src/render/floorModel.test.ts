import { expect, it } from 'vitest'
import { floorModel, floorStyle } from './floorModel'

const layout = { bounds: { center: [5, -10, 7] as const, size: [40, 20, 80] as const } }

it('keeps the stage identical across qualities and allocates optical capture only in a recorded Cinematic world', () => {
  const interactive = floorModel(layout, 'INTERACTIVE', true)
  const cinematic = floorModel(layout, 'CINEMATIC', true)
  expect(interactive).toMatchObject({ position: [5, -20 - floorStyle.clearance, 7], extent: 200, reflection: false })
  expect(cinematic).toEqual({ ...interactive, reflection: true })
  expect(floorModel({ bounds: null }, 'CINEMATIC', false)).toMatchObject({ opacity: .42, reflection: false })
})

it('grounds the actual presentation cut when the reserved bounds extend far below it', () => {
  const body = { position: [3, -2, 2] as const, size: [4, 2, 2] as const }
  const floor = floorModel(layout, 'INTERACTIVE', true, [body], [body])
  expect(floor.position[1]).toBeCloseTo(-3 - floorStyle.maxReservedGap - floorStyle.clearance)
  expect(floor.studioCenter).toEqual([3, 2])
  expect(floor.studioRadius).toBe(16)
  const lower = { position: [3, -23, 2] as const, size: body.size }
  expect(floorModel(layout, 'INTERACTIVE', true, [body, lower]).position[1]).toBeCloseTo(-24 - floorStyle.clearance)
})

it('retains the close reserved floor across neighboring cuts', () => {
  const first = { position: [0, -19, 0] as const, size: [4, 2, 2] as const }
  const next = { ...first, position: [0, -18.65, 0] as const }
  expect(floorModel(layout, 'INTERACTIVE', true, [first]).position[1])
    .toEqual(floorModel(layout, 'CINEMATIC', true, [next]).position[1])
})
