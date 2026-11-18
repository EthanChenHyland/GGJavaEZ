import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

for (const halfFloat of [false, true]) {
  test(`Troika coverage preserves the unlit face (${halfFloat ? 'production half float' : 'byte control'})`, async ({ page }) => {
    // Give the isolated renderer its own document and glyph atlas while
    // retaining the app origin for the actual Vite modules and font files.
    await page.route('**/__qa_troika_mask__', route => route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8">'}))
    await page.goto('/__qa_troika_mask__')
    const result = await page.evaluate(async (halfFloat) => {
      const entry = '/e2e/reference/fixtures/text-mask-entry.ts'
      const {
        Text, Scene, OrthographicCamera, WebGLRenderer, WebGLRenderTarget, Mesh,
        PlaneGeometry, MeshBasicMaterial, NearestFilter, HalfFloatType, DataUtils,
        createMaskMaterial, runtimeFonts,
      } = await import(entry)
      const renderer = new WebGLRenderer({ antialias: false })
      const scene = new Scene(), camera = new OrthographicCamera(-1, 1, 1, -1, .1, 10)
      const target = new WebGLRenderTarget(128, 128, {
        minFilter: NearestFilter, magFilter: NearestFilter,
        ...(halfFloat ? { type: HalfFloatType } : {}),
      })
      renderer.setSize(128, 128); renderer.setClearColor(0, 0)
      camera.position.z = 2; camera.lookAt(0, 0, 0)
      const faceSource = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
      const faceMask = createMaskMaterial(faceSource, 1), geometry = new PlaneGeometry(4, 4)
      const face = new Mesh(geometry, faceMask)
      face.position.z = -.1; scene.add(face)
      const read = () => {
        renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera)
        const pixels = halfFloat ? new Uint16Array(128 * 128 * 4) : new Uint8Array(128 * 128 * 4)
        renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels)
        let min = 255, max = 0, positive = 0, nonopaque = 0
        for (let i = 2; i < pixels.length; i += 4) {
          const coverage = halfFloat ? DataUtils.fromHalfFloat(pixels[i]) * 255 : pixels[i]
          min = Math.min(min, coverage); max = Math.max(max, coverage)
          if (coverage > 0) positive++
          if (coverage < 255) nonopaque++
        }
        return { min, max, positive, nonopaque, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
      }
      const faceOnly = read(), text = new Text()
      const textSource = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false })
      text.material = textSource; text.fillOpacity = .25; text.color = 0xffffff
      text.text = 'MMMM'; text.font = runtimeFonts[500]; text.fontSize = .62
      text.anchorX = 'center'; text.anchorY = 'middle'; text.renderOrder = 3
      await new Promise<void>(resolve => text.sync(resolve))
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      scene.add(text); read()
      face.visible = false; const unmaskedText = read(); face.visible = true
      const source = text.material, textMask = createMaskMaterial(source, 1)
      text.material = textMask
      const combined = read(); face.visible = false; const textOnly = read()
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info')
      const metadata = {
        isTroikaTextMaterial: Reflect.get(source, 'isTroikaTextMaterial'),
        sourceToneMapped: source.toneMapped, maskBlendEquation: textMask.blendEquation,
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'Unavailable', glError: gl.getError(),
      }
      renderer.setRenderTarget(null)
      textMask.dispose(); text.dispose(); textSource.dispose(); faceMask.dispose(); faceSource.dispose()
      geometry.dispose(); target.dispose(); renderer.dispose()
      return {
        halfFloat, faceOnly, unmaskedText, combined, textOnly, ...metadata,
        boundary: 'Isolated 128x128 actual Troika/WebGL mask composition with production font and mask factory. No JVM, reference or performance approval.',
      }
    }, halfFloat)
    await writeFile(`.ggjavaez/qa/reference-exact/mask-text-coverage-${halfFloat ? 'half-float' : 'byte'}.json`, JSON.stringify(result, null, 2) + '\n')
    expect(result.glError).toBe(0)
    expect(result.isTroikaTextMaterial).toBe(true); expect(result.sourceToneMapped).toBe(false)
    expect(result.faceOnly.min).toBe(255)
    // These positive controls prevent a missing/uncompiled glyph from passing.
    expect(result.unmaskedText.positive).toBeGreaterThan(0)
    expect(result.textOnly.positive).toBeGreaterThan(0)
    expect(result.textOnly.max).toBeGreaterThan(60); expect(result.textOnly.max).toBeLessThanOrEqual(65)
    expect(result.combined.min, 'Opaque face coverage must survive antialiased glyphs').toBe(255)
  })
}
