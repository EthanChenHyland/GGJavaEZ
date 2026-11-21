import { expect, it } from 'vitest'
import { emitterHighPass } from './emitterHighPass'

it('extracts peak radiance per source pixel before accumulating the compact halo', () => {
  expect(emitterHighPass).toContain('max(colour.r, max(colour.g, colour.b))')
  expect(emitterHighPass).toContain('colour * smoothstep(.68, .96, peak)')
  expect(emitterHighPass).toContain('radiant(texelFetch(emitters, clamp(pixel, ivec2(0), limit), 0).rgb)')
  expect(emitterHighPass).toContain('halo / 48.')
})
