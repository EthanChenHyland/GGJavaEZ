import { describe, expect, it } from 'vitest'
import type { AppState } from '../state/appState'
import { shell } from '../theme/tokens'
import { computeShellLayout, viewportClass, type Rect, type ShellLayoutInput } from './shellLayout'

// Geometry observes execution/overlays; the remaining fields are inert fixtures.
// Operational AppState derivation is tested by its owner.
function state(execution: AppState['execution'] = 'RUNNING', overlays: AppState['overlays'] = []): AppState {
  return {
    execution, overlays, failure: null, termination: null, partial: null,
    worldOrigin: 'session', badges: [], label: 'Layout fixture', icon: 'pencil',
    dimensions: {
      attemptId: null, build: 'ready', instrumentation: 'recording', process: 'alive',
      recording: null, debugger: 'inactive', input: { available: false, wait: 'not-waiting' },
      view: { recordingId: null, cursor: 0, liveHead: 0, lens: 'LIVE' },
    },
  }
}
function input(width = 1440, height = 900, overrides: Partial<ShellLayoutInput> = {}): ShellLayoutInput {
  return {
    viewport: { width, height }, appState: state(), hasRuntimeWorld: true,
    sourceExpanded: false, narrowDrawerOpen: false, explorerOpen: false,
    inspector: { open: false, side: 'right' }, dockDrawer: { open: false, heightRatio: 0.3 },
    debugActive: false, ...overrides,
  }
}
function rect(actual: Rect, expected: Rect): void {
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(actual[key], key).toBeCloseTo(expected[key], 8)
}

describe('viewportClass', () => {
  it.each([
    [1728, 1117, 'WIDE'], [1440, 900, 'STANDARD'], [1280, 800, 'STANDARD'],
    [760, 900, 'NARROW'], [1440, 650, 'SHORT'],
    [1600, 760, 'WIDE'], [1599, 760, 'STANDARD'], [1024, 760, 'STANDARD'],
    [1024, 759, 'SHORT'], [1600, 759, 'SHORT'], [1023, 759, 'NARROW'], [1023, 2160, 'NARROW'],
  ])('%i × %i → %s', (width, height, expected) => {
    expect(viewportClass(width, height)).toBe(expected)
  })
})

describe('computeShellLayout reference rectangles', () => {
  it.each([
    { w: 1728, h: 1117, headerH: 76, sourceW: 432, sourceH: 625.52, timeY: 977.075, timeH: 112,
      safe: { x: 466.56, y: 111.7, width: 1235.52, height: 837.75 } },
    { w: 1440, h: 900, headerH: 72, sourceW: 360, sourceH: 504, timeY: 782.1, timeH: 95.4,
      safe: { x: 388.8, y: 90, width: 1029.6, height: 675 } },
    { w: 1280, h: 800, headerH: 64, sourceW: 340, sourceH: 448, timeY: 695.2, timeH: 84.8,
      safe: { x: 365.6, y: 80, width: 895.2, height: 600 } },
    { w: 760, h: 900, headerH: 56, sourceW: 40, sourceH: 160, timeY: 793.5, timeH: 84,
      safe: { x: 40, y: 56, width: 720, height: 737.5 } },
    { w: 1440, h: 650, headerH: 56, sourceW: 360, sourceH: 364, timeY: 549.75, timeH: 84,
      safe: { x: 388.8, y: 65, width: 1029.6, height: 472.4 } },
  ])('RUN rectangles at $w × $h', ({ w, h, headerH, sourceW, sourceH, timeY, timeH, safe }) => {
    const layout = computeShellLayout(input(w, h))
    const narrow = w < 1024
    rect(layout.header, { x: 0, y: 0, width: w, height: headerH })
    rect(layout.source, { x: narrow ? 0 : 0.006 * w, y: narrow ? headerH : 0.1 * h, width: sourceW, height: sourceH })
    expect(layout.source.size).toBe(narrow ? 'DRAWER_COLLAPSED' : 'RUN')
    rect(layout.timeDock, { x: 0.009 * w, y: timeY, width: 0.982 * w, height: timeH })
    rect(layout.safeFrame, safe)
    const stripH = Math.min(24, 0.025 * h)
    rect(layout.dockStrip, { x: 0, y: h - stripH, width: w, height: stripH })
    expect(layout.dockStrip.y).toBeGreaterThanOrEqual(layout.timeDock.y + layout.timeDock.height - 1e-8)
    expect(layout.explorer).toBeNull()
    expect(layout.dockDrawer).toBeNull()
    expect(layout.inspector).toBeNull()
    expect(layout.debugBar).toBeNull()
  })

  it.each([[1728, 1117], [1440, 900], [1280, 800], [760, 900], [1440, 650]])(
    'transient rectangles stay in %i × %i', (w, h) => {
      const layout = computeShellLayout(input(w, h, {
        narrowDrawerOpen: true, explorerOpen: true, debugActive: true,
        inspector: { open: true, side: 'right' }, dockDrawer: { open: true, heightRatio: 0.45 },
      }))
      for (const surface of [layout.header, layout.source, layout.explorer, layout.timeDock, layout.dockStrip,
        layout.dockDrawer, layout.inspector, layout.debugBar, layout.safeFrame]) {
        expect(surface).not.toBeNull()
        expect(surface!.x).toBeGreaterThanOrEqual(0)
        expect(surface!.y).toBeGreaterThanOrEqual(0)
        expect(surface!.width).toBeGreaterThan(0)
        expect(surface!.height).toBeGreaterThan(0)
        expect(surface!.x + surface!.width).toBeLessThanOrEqual(w + 1e-8)
        expect(surface!.y + surface!.height).toBeLessThanOrEqual(h + 1e-8)
      }
    },
  )
})

describe('source size precedence', () => {
  it.each(['EDIT', 'BUILDING', 'FAILED'] as const)('%s without a World uses EDIT', execution => {
    const layout = computeShellLayout(input(1440, 900, { appState: state(execution), hasRuntimeWorld: false }))
    expect(layout.source.size).toBe('EDIT')
    rect(layout.source, { x: 8.64, y: 90, width: 691.2, height: 684 })
  })
  it.each(['RUNNING', 'WAITING_INPUT', 'COMPLETED', 'PARTIAL_RECORDING', 'BUILDING', 'FAILED'] as const)(
    '%s with a retained World uses RUN', execution => {
      expect(computeShellLayout(input(1440, 900, { appState: state(execution) })).source.size).toBe('RUN')
    },
  )
  it('DEBUG_PAUSED outranks retained World; expansion outranks pause', () => {
    const paused = input(1440, 900, { appState: state('DEBUG_PAUSED') })
    const debug = computeShellLayout(paused).source
    expect(debug.size).toBe('DEBUG')
    rect(debug, { x: 8.64, y: 90, width: 489.6, height: 594 })
    expect(computeShellLayout({ ...paused, sourceExpanded: true }).source.size).toBe('EDIT')
  })
  it('FOCUS outranks expansion and pause; HISTORY does not change geometry', () => {
    const focused = computeShellLayout(input(1440, 900, {
      appState: state('DEBUG_PAUSED', ['HISTORY', 'FOCUS']), sourceExpanded: true,
    }))
    expect(focused.source.size).toBe('FOCUS')
    rect(focused.source, { x: 8.64, y: 90, width: 316.8, height: 504 })
    expect(computeShellLayout(input(1440, 900, { appState: state('RUNNING', ['HISTORY']) })))
      .toEqual(computeShellLayout(input()))
  })
  it('RUN width uses both pixel clamps', () => {
    expect(computeShellLayout(input(1024, 900)).source.width).toBe(340)
    expect(computeShellLayout(input(3840, 2160)).source.width).toBe(470)
  })
  it('NARROW outranks FOCUS, expansion and pause, retaining explicit drawer state', () => {
    const data = input(760, 900, { appState: state('DEBUG_PAUSED', ['FOCUS']), sourceExpanded: true })
    expect(computeShellLayout(data).source.size).toBe('DRAWER_COLLAPSED')
    const open = computeShellLayout({ ...data, narrowDrawerOpen: true })
    expect(open.source.size).toBe('DRAWER_OPEN')
    rect(open.source, { x: 0, y: 56, width: 520, height: 737.5 })
    expect(open.safeFrame).toEqual(computeShellLayout(data).safeFrame)
    expect(computeShellLayout(input(320, 400, { narrowDrawerOpen: true })).source.width).toBeCloseTo(275.2)
  })
})

describe('transient surfaces and Safe_Frame', () => {
  it('anchors Explorer to Source and hides it behind a collapsed narrow drawer', () => {
    const layout = computeShellLayout(input(1440, 900, { explorerOpen: true }))
    rect(layout.explorer!, { x: 8.64, y: 90, width: 273.6, height: 504 })
    expect(computeShellLayout(input(760, 900, { explorerOpen: true })).explorer).toBeNull()
    expect(computeShellLayout(input(760, 900, { explorerOpen: true, narrowDrawerOpen: true })).explorer).not.toBeNull()
  })
  it.each([[0.1, 180], [0.3, 270], [0.8, 405], [Number.NaN, 270]])(
    'drawer ratio %s clamps/falls back to height %i above Time_Dock', (heightRatio, height) => {
      const layout = computeShellLayout(input(1440, 900, { dockDrawer: { open: true, heightRatio } }))
      rect(layout.dockDrawer!, { x: 12.96, y: 782.1 - height, width: 1414.08, height })
      expect(layout.safeFrame).toEqual(computeShellLayout(input()).safeFrame)
    },
  )
  it('right Inspector reduces fitting width; left Inspector does not', () => {
    const right = computeShellLayout(input(1440, 900, { inspector: { open: true, side: 'right' } }))
    rect(right.inspector!, { x: 1125.6, y: 306, width: 300, height: 468 })
    expect(right.safeFrame.x + right.safeFrame.width).toBeCloseTo(1111.2)
    const left = computeShellLayout(input(1440, 900, { inspector: { open: true, side: 'left' } }))
    expect(left.inspector!.x).toBeCloseTo(14.4)
    expect(left.safeFrame).toEqual(computeShellLayout(input()).safeFrame)
    expect(computeShellLayout(input(1728, 1117, { inspector: { open: true, side: 'right' } })).inspector!.width).toBeCloseTo(345.6)
  })
  it('narrow Inspector is a bottom sheet independent of desktop side', () => {
    const data = input(760, 900, { inspector: { open: true, side: 'right' } })
    const right = computeShellLayout(data)
    rect(right.inspector!, { x: 0, y: 495, width: 760, height: 405 })
    expect(computeShellLayout({ ...data, inspector: { open: true, side: 'left' } })).toEqual(right)
    expect(right.safeFrame).toEqual(computeShellLayout(input(760, 900)).safeFrame)
  })
  it.each([[1440, 650], [1024, 400], [3840, 759]])('SHORT keeps at least .55H at %i × %i', (w, h) => {
    const layout = computeShellLayout(input(w, h, { sourceExpanded: true, appState: state('DEBUG_PAUSED', ['FOCUS']) }))
    expect(layout.header.height).toBe(56)
    expect(layout.timeDock.height).toBe(84)
    expect(layout.safeFrame.height).toBeGreaterThanOrEqual(0.55 * h)
    expect(layout.safeFrame.y + layout.safeFrame.height).toBeLessThanOrEqual(layout.timeDock.y)
    expect(layout.source.size).toBe('FOCUS')
  })
  it.each([[1728, 1117], [1440, 900], [1280, 800], [760, 900], [1440, 650]])(
    'Debug Bar stays horizontally centered at %i × %i', (w, h) => {
      const layout = computeShellLayout(input(w, h, { debugActive: true }))
      expect(layout.debugBar!.x + layout.debugBar!.width / 2).toBe(w / 2)
      expect(layout.debugBar!.y).toBe(layout.header.height + 8)
    },
  )
  it('depends on final input, returns fresh rectangles and leaves tokens/input untouched', () => {
    const data = input(1440, 900, { appState: state('RUNNING', ['HISTORY', 'FOCUS']) })
    const before = structuredClone(data)
    const tokensBefore = JSON.stringify(shell)
    const first = computeShellLayout(data)
    computeShellLayout(input(760, 900, { narrowDrawerOpen: true }))
    expect(computeShellLayout(data)).toEqual(first)
    expect(computeShellLayout(data).source).not.toBe(first.source)
    expect(data).toEqual(before)
    expect(JSON.stringify(shell)).toBe(tokensBefore)
    expect(Object.isFrozen(shell.source)).toBe(true)
  })
  it.each([[1728,1117],[1440,900],[1280,800],[760,900],[1440,650]])(
    'keeps expanded Source controls below Debug without moving its surface at %i × %i',(w,h)=>{
      const data=input(w,h,{debugActive:true,sourceExpanded:true,narrowDrawerOpen:true,appState:state('DEBUG_PAUSED')})
      const layout=computeShellLayout(data),ordinary=computeShellLayout({...data,debugActive:false}),bar=layout.debugBar!
      expect(layout.sourceHeadingInset).toBeGreaterThan(0)
      expect(layout.source.y+layout.sourceHeadingInset).toBeGreaterThanOrEqual(bar.y+bar.height)
      expect(layout.source).toEqual(ordinary.source);expect(layout.safeFrame).toEqual(ordinary.safeFrame)
      expect(ordinary.sourceHeadingInset).toBe(0)
    },
  )
  it('reserves no extra Source header space when the debugger is clear or the drawer is collapsed',()=>{
    expect(computeShellLayout(input(1440,900,{debugActive:true,appState:state('DEBUG_PAUSED')})).sourceHeadingInset).toBe(0)
    expect(computeShellLayout(input(760,900,{debugActive:true})).sourceHeadingInset).toBe(0)
  })
})
