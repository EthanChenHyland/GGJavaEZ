import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { frameLabelDensity, identityLabelScale, projectedTextPixels, runtimeCharacters } from './runtimeText'

describe('projected runtime label policy', () => {
  it('uses actual viewport height and camera distance rather than reserved stack depth', () => {
    const camera = new PerspectiveCamera(41, 2, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.updateMatrixWorld()
    const small = projectedTextPixels(camera, { width: 800, height: 400 }, [0, 0, 0], 0.24)
    const expanded = projectedTextPixels(camera, { width: 1600, height: 800 }, [0, 0, 0], 0.24)
    expect(expanded).toBeCloseTo(small * 2)
    camera.position.z = 20
    camera.updateMatrixWorld()
    expect(projectedTextPixels(camera, { width: 800, height: 400 }, [0, 0, 0], 0.24)).toBeCloseTo(small / 2)
    expect(projectedTextPixels(camera, { width: 800, height: 400 }, [0, 0, 30], 0.24)).toBe(0)
  })

  it('keeps either density stable inside the hysteresis band', () => {
    expect(frameLabelDensity(12, 'full')).toBe('full')
    expect(frameLabelDensity(12, 'compact')).toBe('compact')
    expect(frameLabelDensity(10, 'full')).toBe('compact')
    expect(frameLabelDensity(14, 'compact')).toBe('full')
  })

  it('prioritizes active/selected identities while bounding long-name growth to the face', () => {
    const ordinary = identityLabelScale(0.38, 20, 2, 4.25, false)
    const priority = identityLabelScale(0.38, 20, 2, 4.25, true)
    expect(priority).toBeGreaterThan(ordinary)
    expect(identityLabelScale(0.38, 3, 3, 4.25, true) * 3).toBeLessThanOrEqual(4.25)
    expect(identityLabelScale(0.38, 3, 2, 4.25, true) * 0.38).toBeLessThanOrEqual(0.9)
    expect(identityLabelScale(0.38, 100, 2, 4.25, true)).toBe(1)
  })

  it('preloads a finite shared alphabet including runtime symbols', () => {
    expect(runtimeCharacters.length).toBeLessThan(128)
    expect(runtimeCharacters).toContain('0123456789')
    expect(runtimeCharacters).toContain('·→—×')
  })
})
