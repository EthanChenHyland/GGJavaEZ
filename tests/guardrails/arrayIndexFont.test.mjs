import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('binds generated array index ink metrics to the bundled renderer font', () => {
  const metrics=JSON.parse(readFileSync(new URL('../../src/render/text/arrayIndexInkMetrics.json',import.meta.url),'utf8'))
  const font=readFileSync(new URL('../../public/fonts/runtime/VisualJavaInter-Medium.ttf',import.meta.url))
  expect(createHash('sha256').update(font).digest('hex')).toBe(metrics.fontSha256)
})
