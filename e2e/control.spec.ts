import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { ScalarValue, TraceDocument, TraceEvent } from '../src/contracts/runtime'

const trace: TraceDocument = JSON.parse(readFileSync('src/demos/control/trace.json', 'utf8'))
type Checkpoint<T extends TraceEvent = TraceEvent> = { event: T; cursor: number }

// Cursors count applied events. IDs, method invocations and lexical scopes come
// from the fixture, so adding explanatory events cannot silently retarget a test.
function checkpoints<T extends TraceEvent['type']>(type: T): Checkpoint<Extract<TraceEvent, { type: T }>>[] {
  return trace.events.flatMap((event, index) => event.type === type
    ? [{ event: event as Extract<TraceEvent, { type: T }>, cursor: index + 1 }] : [])
}

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Control fixture is missing ${description}`)
  return value
}

const declarations = checkpoints('DECLARE_LOCAL')
const corrected = declarations.filter(({ event }) => event.slot.name === 'corrected')
const inputs = checkpoints('INPUT_READ')
const outputs = checkpoints('OUTPUT_WRITE')
const conditions = checkpoints('EVALUATE_CONDITION')
const iterations = checkpoints('LOOP_ITERATION')
const scanner = required(checkpoints('ALLOCATE_OBJECT').find(({ event }) => event.className === 'Scanner'), 'Scanner allocation')
const scannerReference = required(checkpoints('CREATE_REFERENCE').find(({ event }) => event.targetObjectId === scanner.event.objectId), 'Scanner reference')
const firstCorrected = required(corrected[0], 'branch-local corrected')
const firstReturn = required(checkpoints('RETURN_VALUE').find(({ event, cursor }) => event.frameId === firstCorrected.event.frameId && cursor > firstCorrected.cursor), 'clamp return')
const lastOutput = required(outputs.at(-1), 'final output')

const scrub = (page: Page) => page.getByRole('slider', { name: 'Scrub execution' })
const inspector = (page: Page) => page.getByLabel('Runtime inspector', { exact: true })
const status = (page: Page) => page.getByLabel('Control flow state', { exact: true })
const consolePane = (page: Page) => page.getByLabel('Runtime console', { exact: true })
const slot = (page: Page, id: string) => page.locator('.classic-runtime [data-slot-id]').filter({ has: page.locator('text') }).and(page.locator(`[data-slot-id="${id}"]`))
const scope = (page: Page, id: string) => page.locator(`.classic-runtime [data-scope-id="${id}"]`)
const scalar = (value: ScalarValue) => value.kind === 'primitive' ? String(value.value)
  : value.kind === 'stringSummary' ? `"${value.value}"` : value.kind

async function control(page: Page) {
  await page.goto('/examples')
  await page.getByLabel('Runtime example', { exact: true }).selectOption('control')
  await expect(scrub(page)).toHaveValue('0')
  await expect(consolePane(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Theater', exact: true })).toHaveCount(0)
}

async function seek(page: Page, cursor: number) {
  await scrub(page).fill(String(cursor))
  await expect(scrub(page)).toHaveValue(String(cursor))
  await expect(page.locator('.vj-timeline__count')).toHaveText(`${cursor} / ${trace.events.length}`)
}

async function expectConsole(page: Page, cursor: number) {
  const applied = trace.events.slice(0, cursor).filter((event) => event.type === 'INPUT_READ' || event.type === 'OUTPUT_WRITE')
  const entries = consolePane(page).locator('.console-pane__entry[data-console-kind]')
  await expect(entries).toHaveCount(applied.length)
  // Preserve exact text, including println newlines; toHaveText normalizes them.
  await expect.poll(() => entries.locator('.console-pane__text').allTextContents()).toEqual(applied.map((event) => event.text))
  await expect.poll(() => entries.evaluateAll((nodes) => nodes.map((node) => ({
    kind: node.getAttribute('data-console-kind'), id: node.getAttribute('data-console-event-id'),
  })))).toEqual(applied.map((event) => ({ kind: event.type === 'INPUT_READ' ? 'input' : 'output', id: event.eventId })))
  const current = trace.events[cursor - 1]
  const active = entries.locator('[aria-current="step"]')
  // aria-current lives on the entry, rather than one of its children.
  await expect(entries.and(page.locator('[aria-current="step"]'))).toHaveCount(current?.type === 'INPUT_READ' || current?.type === 'OUTPUT_WRITE' ? 1 : 0)
  await expect(active).toHaveCount(0)
}

async function expectSource(page: Page, checkpoint: Checkpoint) {
  const source = required(checkpoint.event.source ?? undefined, `source at ${checkpoint.event.type}`)
  const file = required(trace.sourceFiles.find((file) => file.fileId === source.fileId), 'source file')
  const line = required(file.content.split(/\r?\n/)[source.line - 1], 'source line').trim()
  await expect(page.locator('.source-current-line')).toHaveText(`L${source.line} · ${line}`)
}

function scopeChain(declaration: Checkpoint<Extract<TraceEvent, { type: 'DECLARE_LOCAL' }>>) {
  const chain: Extract<TraceEvent, { type: 'ENTER_SCOPE' }>[] = []
  let id = required(declaration.event.slot.scopeId, 'declared scope ID')
  while (id) {
    const entered = required(checkpoints('ENTER_SCOPE').filter(({ event, cursor }) => event.frameId === declaration.event.frameId && event.scopeId === id && cursor < declaration.cursor).at(-1), `scope ${id}`)
    chain.unshift(entered.event)
    id = entered.event.parentId ?? ''
  }
  return chain
}

test('console contains only consumed inputs and committed outputs, including reverse steps', async ({ page }) => {
  await control(page)
  expect(inputs.map(({ event }) => scalar(event.value))).toEqual(['-7', '42', '130'])
  expect(outputs.map(({ event }) => scalar(event.value))).toEqual(['0', '42', '100', '142'])
  await expectConsole(page, 0)
  const io = [...inputs, ...outputs].sort((a, b) => a.cursor - b.cursor)
  for (const checkpoint of io) {
    await seek(page, checkpoint.cursor - 1)
    await expectConsole(page, checkpoint.cursor - 1)
    await page.getByRole('button', { name: 'Next event', exact: true }).click()
    await expect(scrub(page)).toHaveValue(String(checkpoint.cursor))
    await expectConsole(page, checkpoint.cursor)
    await page.getByRole('button', { name: 'Previous event', exact: true }).click()
    await expect(scrub(page)).toHaveValue(String(checkpoint.cursor - 1))
    await expectConsole(page, checkpoint.cursor - 1)
  }
  await seek(page, trace.events.length)
  await expectConsole(page, trace.events.length)
  await expect(consolePane(page)).toHaveAttribute('data-console-status', 'ended')
  for (const checkpoint of [...io].reverse()) {
    await seek(page, checkpoint.cursor - 1)
    await expectConsole(page, checkpoint.cursor - 1)
  }
  await seek(page, 0)
  await expectConsole(page, 0)
})

test('nested corrected survives return evaluation, leaves on method exit, and rewinds to its reserved row', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await control(page)
  await page.getByRole('button', { name: 'Classic', exact: true }).click()
  expect(corrected).toHaveLength(3)
  for (const declaration of corrected) {
    const returned = required(checkpoints('RETURN_VALUE').find(({ event, cursor }) => event.frameId === declaration.event.frameId && cursor > declaration.cursor), 'branch return')
    const exited = required(checkpoints('EXIT_METHOD').find(({ event, cursor }) => event.frameId === declaration.event.frameId && cursor > returned.cursor), 'return unwinding')
    const chain = scopeChain(declaration)
    expect(chain.length).toBeGreaterThan(1)
    const block = chain.at(-1)!
    await seek(page, declaration.cursor)
    await expect(slot(page, declaration.event.slot.id)).toHaveCount(1)
    await expect(scope(page, block.scopeId)).toHaveAttribute('data-scope-depth', String(chain.length - 1))
    await expect(status(page).locator('.scope-context')).toHaveText(`Scope · ${chain.map((entry) => entry.labelScope).join(' › ')}`)
    const row = slot(page, declaration.event.slot.id).locator('rect').first()
    const anchor = await row.evaluate((node) => ['x', 'y', 'width', 'height'].map((name) => node.getAttribute(name)))
    await page.getByLabel('Select runtime entity', { exact: true }).selectOption(declaration.event.slot.id)
    await seek(page, returned.cursor)
    await expect(slot(page, declaration.event.slot.id)).toHaveCount(1)
    await expect(scope(page, block.scopeId)).toHaveCount(1)
    await expect(inspector(page).getByRole('heading', { name: 'corrected', exact: true })).toBeVisible()
    await expect(inspector(page).locator('.inspector-key').filter({ hasText: /^VALUE/ }).locator('strong')).toHaveText(scalar(returned.event.value))
    await page.getByRole('button', { name: 'Next event', exact: true }).click()
    await expect(scrub(page)).toHaveValue(String(exited.cursor))
    await expect(slot(page, declaration.event.slot.id)).toHaveCount(0)
    await expect(scope(page, block.scopeId)).toHaveCount(0)
    await expect(page.locator(`.classic-runtime [data-runtime-id="${declaration.event.frameId}"]`)).toHaveAttribute('data-invocation-status', 'completed')
    await expect(inspector(page)).toContainText('SCOPE · CLOSED')
    await expect(inspector(page).getByRole('heading', { name: 'corrected', exact: true })).toBeVisible()
    await expect(inspector(page).locator('.inspector-key').filter({ hasText: /^VALUE/ }).locator('strong')).toHaveText(scalar(returned.event.value))
    await expect(inspector(page).getByRole('button', { name: 'Focus', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Previous event', exact: true }).click()
    await expect(scrub(page)).toHaveValue(String(returned.cursor))
    await expect(scope(page, block.scopeId)).toHaveCount(1)
    await expect(inspector(page)).toContainText('SCOPE · LIVE')
    await expect(inspector(page).getByRole('button', { name: 'Focus', exact: true })).toBeEnabled()
    await expect.poll(() => row.evaluate((node) => ['x', 'y', 'width', 'height'].map((name) => node.getAttribute(name)))).toEqual(anchor)
  }
})

test('each loop body removes raw and score; iterator leaves only when its for scope closes', async ({ page }) => {
  await control(page)
  await page.getByRole('button', { name: 'Classic', exact: true }).click()
  const rawDeclarations = declarations.filter(({ event }) => event.slot.name === 'raw')
  const iterator = required(declarations.find(({ event }) => event.slot.name === 'i'), 'for iterator')
  expect(rawDeclarations).toHaveLength(inputs.length)
  const iteratorExit = required(checkpoints('EXIT_SCOPE').find(({ event, cursor }) => event.frameId === iterator.event.frameId && event.scopeId === iterator.event.slot.scopeId && cursor > iterator.cursor), 'for scope exit')
  for (const raw of rawDeclarations) {
    const bodyExit = required(checkpoints('EXIT_SCOPE').find(({ event, cursor }) => event.frameId === raw.event.frameId && event.scopeId === raw.event.slot.scopeId && cursor > raw.cursor), 'body scope exit')
    const score = required(declarations.find(({ event, cursor }) => event.slot.name === 'score' && event.frameId === raw.event.frameId && event.slot.scopeId === raw.event.slot.scopeId && cursor > raw.cursor && cursor < bodyExit.cursor), 'body score')
    await seek(page, bodyExit.cursor - 1)
    await expect(slot(page, raw.event.slot.id)).toHaveCount(1)
    await expect(slot(page, score.event.slot.id)).toHaveCount(1)
    await expect(slot(page, iterator.event.slot.id)).toHaveCount(1)
    await expect(scope(page, raw.event.slot.scopeId!)).toHaveCount(1)
    await page.getByLabel('Select runtime entity', { exact: true }).selectOption(score.event.slot.id)
    await page.getByRole('button', { name: 'Next event', exact: true }).click()
    await expect(scrub(page)).toHaveValue(String(bodyExit.cursor))
    for (const id of [raw.event.slot.id, score.event.slot.id]) {
      await expect(slot(page, id)).toHaveCount(0)
      const option = page.getByLabel('Select runtime entity', { exact: true }).locator(`option[value="${id}"]`)
      if (id === score.event.slot.id) {
        await expect(option).toHaveCount(1)
        await expect(option).toContainText('scope closed')
      } else await expect(option).toHaveCount(0)
    }
    await expect(scope(page, raw.event.slot.scopeId!)).toHaveCount(0)
    await expect(slot(page, iterator.event.slot.id)).toHaveCount(1)
    await expect(inspector(page)).toContainText('SCOPE · CLOSED')
    await page.getByRole('button', { name: 'Previous event', exact: true }).click()
    await expect(slot(page, raw.event.slot.id)).toHaveCount(1)
    await expect(slot(page, score.event.slot.id)).toHaveCount(1)
  }
  await seek(page, iteratorExit.cursor - 1)
  await expect(slot(page, iterator.event.slot.id)).toHaveCount(1)
  await page.getByLabel('Select runtime entity', { exact: true }).selectOption(iterator.event.slot.id)
  await page.getByRole('button', { name: 'Next event', exact: true }).click()
  await expect(slot(page, iterator.event.slot.id)).toHaveCount(0)
  await expect(scope(page, iterator.event.slot.scopeId!)).toHaveCount(0)
  await expect(inspector(page)).toContainText('SCOPE · CLOSED')
  await expect(inspector(page).getByRole('button', { name: 'Focus', exact: true })).toBeDisabled()
  await seek(page, iteratorExit.cursor - 1)
  await expect(slot(page, iterator.event.slot.id)).toHaveCount(1)
})

test('recorded operands, taken and skipped paths, iteration and source survive guidance changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await control(page)
  await page.getByRole('button', { name: 'Runtime focus mode', exact: true }).click()
  expect(conditions.some(({ event }) => event.result)).toBe(true)
  expect(conditions.some(({ event }) => !event.result)).toBe(true)
  for (const checkpoint of conditions) {
    await seek(page, checkpoint.cursor)
    const { event } = checkpoint
    const fact = status(page).locator('[data-condition-id]')
    await expect(fact).toHaveAttribute('data-condition-id', event.conditionId)
    await expect(fact.locator('code')).toHaveText(event.expression)
    await expect(fact.locator('strong')).toHaveText(`${scalar(event.operands[0].value)} ${event.operator} ${scalar(event.operands[1].value)} → ${event.result}`)
    await expect(fact.locator('.branch-path')).toHaveText(`${event.takenLabel} · skipped: ${event.skippedLabel}`)
    await expectSource(page, checkpoint)
    const loop = iterations.filter(({ cursor }) => cursor <= checkpoint.cursor).at(-1)
    if (loop) await expect(status(page).locator('[data-loop-iteration]')).toHaveAttribute('data-loop-iteration', String(loop.event.iteration))
    await page.getByRole('button', { name: 'Guided execution', exact: true }).click()
    await expect(fact.locator('code')).toHaveText(event.expression)
    await expect(fact.locator('strong')).toContainText(String(event.result))
    await expectSource(page, checkpoint)
    await expect(scrub(page)).toHaveValue(String(checkpoint.cursor))
    await page.getByRole('button', { name: 'Guided execution', exact: true }).click()
  }
  for (const checkpoint of [...iterations, ...iterations.slice().reverse()]) {
    await seek(page, checkpoint.cursor)
    await expect(status(page).locator('[data-loop-iteration]')).toHaveAttribute('data-loop-iteration', String(checkpoint.event.iteration))
    await expect(status(page).locator('.loop-context')).toHaveText(checkpoint.event.status === 'ended'
      ? `Loop ended · ${checkpoint.event.iteration} iterations` : `Iteration ${checkpoint.event.iteration}`)
  }
})

test('Classic and Spatial share selection, value, source, console and cursor; switching preserves playback', async ({ page }) => {
  await control(page)
  await seek(page, firstReturn.cursor)
  await page.getByLabel('Select runtime entity', { exact: true }).selectOption(firstCorrected.event.slot.id)
  await page.getByRole('button', { name: 'Runtime focus mode', exact: true }).click()
  await page.getByRole('button', { name: 'Expand console', exact: true }).click()
  for (const view of ['Classic', 'Spatial', 'Classic', 'Spatial']) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await expect(scrub(page)).toHaveValue(String(firstReturn.cursor))
    await expect(page.getByLabel('Select runtime entity', { exact: true })).toHaveValue(firstCorrected.event.slot.id)
    await expect(inspector(page).getByRole('heading', { name: 'corrected', exact: true })).toBeVisible()
    await expect(inspector(page).locator('.inspector-key').filter({ hasText: /^VALUE/ }).locator('strong')).toHaveText(scalar(firstReturn.event.value))
    await expectSource(page, firstReturn)
    await expectConsole(page, firstReturn.cursor)
    await expect(page.locator('.vj-timeline__event')).toHaveText(firstReturn.event.label)
  }
  // Select a persistent heap identity before continuing past scope unwinding.
  await page.getByLabel('Select runtime entity', { exact: true }).selectOption(scanner.event.objectId)
  await page.getByLabel('Playback speed', { exact: true }).selectOption('0.5')
  await page.getByRole('button', { name: 'Play execution', exact: true }).click()
  for (const view of ['Classic', 'Spatial']) {
    const before = Number(await scrub(page).inputValue())
    await page.getByRole('button', { name: view, exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pause execution', exact: true })).toBeVisible()
    expect(Number(await scrub(page).inputValue())).toBeGreaterThanOrEqual(before)
    await expect(page.getByLabel('Select runtime entity', { exact: true })).toHaveValue(scanner.event.objectId)
  }
  await expect.poll(async () => Number(await scrub(page).inputValue())).toBeGreaterThan(firstReturn.cursor)
  await page.getByRole('button', { name: 'Pause execution', exact: true }).click()
  await expectConsole(page, Number(await scrub(page).inputValue()))
})

test('completion retains 0, 42, 100, 142 and explicit Replay finishes once without looping', async ({ page }) => {
  test.setTimeout(Math.max(30_000, trace.events.length * 170 + 20_000))
  await control(page)
  await seek(page, lastOutput.cursor)
  await page.getByLabel('Playback speed', { exact: true }).selectOption('4')
  await page.getByRole('button', { name: 'Play execution', exact: true }).click()
  const replay = page.getByRole('button', { name: 'Replay execution', exact: true })
  await expect(replay).toBeVisible({ timeout: 10_000 })
  await expect(scrub(page)).toHaveValue(String(trace.events.length))
  await expectConsole(page, trace.events.length)
  await expect(page.getByRole('button', { name: 'Next event', exact: true })).toBeDisabled()
  await page.waitForTimeout(800)
  await expect(scrub(page)).toHaveValue(String(trace.events.length))
  await expect(replay).toBeVisible()
  // Slow the initial tick so the ready state can be observed reliably.
  await page.getByLabel('Playback speed', { exact: true }).selectOption('0.5')
  await replay.click()
  await expect(scrub(page)).toHaveValue('0')
  await expectConsole(page, 0)
  await expect(page.getByRole('button', { name: 'Pause execution', exact: true })).toBeVisible()
  await page.getByLabel('Playback speed', { exact: true }).selectOption('4')
  await expect(replay).toBeVisible({ timeout: trace.events.length * 170 + 10_000 })
  await expect(scrub(page)).toHaveValue(String(trace.events.length))
  await expectConsole(page, trace.events.length)
  await expect(consolePane(page).locator('[data-console-kind="output"] .console-pane__text')).toHaveText(['0', '42', '100', '142'])
  await expect(status(page)).toContainText('All local scopes closed')
  await page.waitForTimeout(800)
  await expect(scrub(page)).toHaveValue(String(trace.events.length))
  await expect(replay).toBeVisible()
})

test('exploration cancels Follow while advancing; Focus, Home and Trace use the real Scanner relationship', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await control(page)
  await seek(page, scannerReference.cursor)
  await page.getByLabel('Select runtime entity', { exact: true }).selectOption(scannerReference.event.sourceSlot.slotId)
  const follow = page.getByRole('button', { name: 'Follow execution', exact: true })
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Play execution', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.world-label')).toContainText('FREE EXPLORE')
  await expect(page.getByRole('button', { name: 'Pause execution', exact: true })).toBeVisible()
  await expect.poll(async () => Number(await scrub(page).inputValue())).toBeGreaterThan(scannerReference.cursor)
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
  await seek(page, scannerReference.cursor)
  for (const view of ['Classic', 'Spatial']) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await page.getByLabel('Select runtime entity', { exact: true }).selectOption(scanner.event.objectId)
    await page.getByRole('button', { name: 'Focus selected entity', exact: true }).click()
    await expect(page.locator('.world-label')).toContainText('FOCUS ENTITY')
    await expect(inspector(page).getByRole('heading', { name: `Scanner #${scanner.event.displayId}`, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page.locator('.world-label')).toContainText('HOME')
    await page.getByLabel('Select runtime entity', { exact: true }).selectOption(scannerReference.event.sourceSlot.slotId)
    await page.getByRole('button', { name: 'Trace selected relationship', exact: true }).click()
    await expect(page.locator('.world-label')).toContainText('TRACE PATH')
    await expect(inspector(page).getByRole('heading', { name: 'Reference path', exact: true })).toBeVisible()
    await expect(inspector(page).locator('.inspector-key').filter({ hasText: /^TARGET/ }).locator('strong')).toHaveText(`Scanner #${scanner.event.displayId}`)
    const declaration = required(declarations.find(({ event }) => event.slot.id === scannerReference.event.sourceSlot.slotId), 'Scanner local')
    await expect(inspector(page).locator('.inspector-key').filter({ hasText: /^SOURCE/ }).locator('strong')).toHaveText(declaration.event.slot.name)
    await expect(scrub(page)).toHaveValue(String(scannerReference.cursor))
    if (view === 'Classic') {
      await expect(page.locator(`.classic-runtime [data-reference-id="ref:${scannerReference.event.sourceSlot.slotId}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
  }
})

test('narrow console expansion is keyboard accessible and inspector dismissal preserves execution', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 })
  await control(page)
  await seek(page, firstReturn.cursor)
  await expectSource(page, firstReturn)
  await expect(consolePane(page)).toHaveClass(/console-pane--compact/)
  const expand = page.getByRole('button', { name: 'Expand console', exact: true })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  const regionId = required(await expand.getAttribute('aria-controls') ?? undefined, 'controlled console region')
  await expand.focus()
  await page.keyboard.press('Enter')
  const collapse = page.getByRole('button', { name: 'Collapse console', exact: true })
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('region', { name: 'Applied console entries', exact: true })).toHaveAttribute('id', regionId)
  await expectConsole(page, firstReturn.cursor)
  await page.getByRole('region', { name: 'Applied console entries', exact: true }).focus()
  await expect(page.getByRole('region', { name: 'Applied console entries', exact: true })).toBeFocused()
  await page.getByLabel('Select runtime entity', { exact: true }).selectOption(firstCorrected.event.slot.id)
  const close = inspector(page).getByRole('button', { name: 'Close inspector', exact: true })
  await close.focus()
  await page.keyboard.press('Enter')
  await expect(inspector(page)).toHaveCount(0)
  await expect(scrub(page)).toHaveValue(String(firstReturn.cursor))
  await expectSource(page, firstReturn)
  await expectConsole(page, firstReturn.cursor)
  await collapse.focus()
  await page.keyboard.press('Enter')
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('region', { name: 'Applied console entries', exact: true })).toBeHidden()
  await expand.click()
  await seek(page, inputs[0].cursor - 1)
  await expectConsole(page, inputs[0].cursor - 1)
})
