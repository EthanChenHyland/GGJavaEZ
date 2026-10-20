import {selectRecording} from './menuActions'
import { expect, test } from '@playwright/test'
import { PerspectiveCamera, Vector3 } from 'three'
import { readFile, writeFile } from 'node:fs/promises'
import { browserErrors, home, ready, seekCursor, selectEntity } from './harness'
import type { TraceDocument } from '../../src/contracts/runtime'

// Captured fixture replay through the production Shell; no fresh JVM claim.
test('captured scopes render inside immutable frame faces and chip picking follows their actual row offsets', async ({ page }) => {
  test.setTimeout(60000)
  const trace = JSON.parse(await readFile('src/examples/demos/control/trace.json', 'utf8')) as TraceDocument
  const errors = browserErrors(page)
  await page.goto('/examples?qa=1')
  await selectRecording(page,'control')
  await seekCursor(page, trace.events.length)
  const anchors = await page.evaluate(() => Object.fromEntries(Object.values(window.__ggjavaezWorld!.scene().entities).map(node => [node.id, node.anchor])))
  let target: { cursor: number; frameId: string; slotId: string } | undefined
  for (const event of trace.events) {
    if (event.type !== 'DECLARE_LOCAL' || !event.slot.scopeId) continue
    await seekCursor(page, event.seq + 1)
    const candidate = await page.evaluate(async event => {
      const modulePath = '/src/world/faceRows.ts', shared = await import(modulePath), node = window.__ggjavaezWorld!.scene().entities[event.frameId]
      if (node?.kind !== 'frame') return null
      const face = shared.faceRows(node, { detail: 'CLOSE' })
      return face.visible.some((row: { slotId: string }) => row.slotId === event.slot.id) && face.scopes.dividers.length ? { cursor: event.seq + 1, frameId: event.frameId, slotId: event.slot.id } : null
    }, event)
    if (candidate) { target = candidate; break }
  }
  expect(target).toBeDefined(); if (!target) throw new Error('Captured fixture has no drawable scoped row')
  await home(page); await selectEntity(page, target.frameId)
  await page.getByRole('button', { name: 'Focus', exact: true }).click(); await ready(page)
  const actual = await page.evaluate(async target => {
    const modulePath = '/src/world/faceRows.ts', shared = await import(modulePath), world = window.__ggjavaezWorld!, scene = world.scene(), plan = world.plan(), node = scene.entities[target.frameId], presented = plan.entities.get(target.frameId)!
    return { node, face: shared.faceRows(node, presented), port: shared.faceRowPort(node, presented, target.slotId), text: world.frameText().filter(label => label.entityId === target.frameId), pose: window.__ggjavaezQA!.cameraPose() }
  }, target)
  expect(actual.node.anchor).toEqual(anchors[target.frameId])
  expect(actual.port).not.toBeNull()
  const label = actual.text.find(label => label.kind === 'scope')!
  expect(label).toBeDefined(); expect(label.opacity).toBe(1); expect(label.fontPixels).toBeGreaterThanOrEqual(11)
  expect(actual.face.scopes.dividers.map((divider: { label: string }) => divider.label)).toContain(label.text)
  const name = actual.text.find(label => label.kind === 'name' && label.slotId === target.slotId)!, value = actual.text.find(label => label.kind === 'value' && label.slotId === target.slotId)!
  expect(name.position[1]).toBe(actual.port![1]); expect(value.position[1]).toBe(actual.port![1])
  expect(label.position[1]).toBeGreaterThan(name.position[1])
  await page.screenshot({ path: '.ggjavaez/qa/reference-exact/scoped-frame-before-pick-native.png' })
  const viewport = page.viewportSize()!, camera = new PerspectiveCamera(36, viewport.width / viewport.height, .05, 10000)
  camera.position.set(...actual.pose.position); camera.lookAt(...actual.pose.target); camera.updateMatrixWorld()
  // Click inside the actual chip, away from its terminal on the right face edge.
  const point = new Vector3(...actual.port!); point.x = actual.node.anchor.position[0]; point.z += .02; point.project(camera)
  await page.mouse.click((point.x + 1) * viewport.width / 2, (1 - point.y) * viewport.height / 2); await ready(page)
  expect(await page.evaluate(() => window.__ggjavaezQA!.selection())).toEqual({ kind: 'slot', id: target.slotId })
  expect(await page.evaluate(() => window.__ggjavaezQA!.cameraPose())).toEqual(actual.pose)
  await page.screenshot({ path: '.ggjavaez/qa/reference-exact/scoped-frame-picked-native.png' })
  await seekCursor(page, target.cursor - 1); await seekCursor(page, target.cursor)
  expect(await page.evaluate(id => window.__ggjavaezWorld!.scene().entities[id].anchor, target.frameId)).toEqual(actual.node.anchor)
  expect(errors).toEqual([])
  await writeFile('.ggjavaez/qa/reference-exact/scoped-frame-native.json', JSON.stringify({ freshJvm: false, fixture: trace.demoId, target, actual, errors }, null, 2) + '\n')
})
