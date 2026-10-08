import { describe, expect, it } from 'vitest'
import { captionOverlaps, type CaptionRect } from './ConnectorCaptions'

describe('projected connector caption clearance', () => {
  it('rejects intersecting captions without changing their real world paths', () => {
    const first: CaptionRect = { left: 10, right: 70, top: 20, bottom: 40 }
    const before = structuredClone(first)
    expect(captionOverlaps({ left: 60, right: 130, top: 25, bottom: 45 }, [first])).toBe(true)
    expect(captionOverlaps({ left: 71, right: 130, top: 25, bottom: 45 }, [first])).toBe(false)
    expect(captionOverlaps({ left: 20, right: 60, top: 41, bottom: 61 }, [first])).toBe(false)
    expect(first).toEqual(before)
  })
})
