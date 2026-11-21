import type { AppState } from '../state/appState'
import { shell } from '../theme/tokens'

export type ViewportClass = 'WIDE' | 'STANDARD' | 'SHORT' | 'NARROW'
export type SourceSize = 'EDIT' | 'RUN' | 'DEBUG' | 'FOCUS' | 'DRAWER_COLLAPSED' | 'DRAWER_OPEN'
export interface Rect { x: number; y: number; width: number; height: number }
export interface ShellLayoutInput {
  viewport: { width: number; height: number }
  appState: AppState
  hasRuntimeWorld: boolean
  sourceExpanded: boolean
  narrowDrawerOpen: boolean
  explorerOpen: boolean
  inspector: { open: boolean; side: 'left' | 'right' }
  dockDrawer: { open: boolean; heightRatio: number }
  debugActive: boolean
}
export interface ShellLayout {
  viewportClass: ViewportClass
  header: Rect
  source: Rect & { size: SourceSize }
  explorer: Rect | null
  timeDock: Rect
  dockStrip: Rect
  dockDrawer: Rect | null
  inspector: Rect | null
  debugBar: Rect | null
  /** Reserve Source's control row below an intersecting debugger toolbar. */
  sourceHeadingInset: number
  /** World content fitting rectangle used by Hero, Home, Focus and Follow. */
  safeFrame: Rect
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export function viewportClass(width: number, height: number): ViewportClass {
  if (width < shell.viewport.standardW) return 'NARROW'
  if (height < shell.viewport.tallH) return 'SHORT'
  return width >= shell.viewport.wideW ? 'WIDE' : 'STANDARD'
}

/** Pure CSS-pixel geometry; no surface state, camera state or DOM measurements. */
export function computeShellLayout(input: ShellLayoutInput): ShellLayout {
  const { width: w, height: h } = input.viewport
  const kind = viewportClass(w, h)
  const narrow = kind === 'NARROW'
  const compact = narrow || kind === 'SHORT'
  const header: Rect = {
    x: 0, y: 0, width: w,
    height: compact ? shell.header.minPx : clamp(shell.header.h * h, shell.header.minPx, shell.header.maxPx),
  }
  const timeHeight = compact ? shell.timeDock.minPx : clamp(shell.timeDock.h * h, shell.timeDock.minPx, shell.timeDock.maxPx)
  const inset = shell.timeDock.inset * w
  const timeDock: Rect = {
    x: inset, y: h - shell.timeDock.bottom * h - timeHeight,
    width: w - 2 * inset, height: timeHeight,
  }

  // The spec fixes the drawer but leaves the peek tab's exact dimensions open.
  // A 40 px rail permits a 24 px target; the file/line label can run vertically.
  const peekWidth = shell.modeButton.maxPx
  let source: ShellLayout['source']
  if (narrow) {
    source = {
      x: 0, y: header.height,
      width: input.narrowDrawerOpen ? Math.min(0.86 * w, 520) : peekWidth,
      height: input.narrowDrawerOpen ? timeDock.y - header.height : Math.min(160, timeDock.y - header.height),
      size: input.narrowDrawerOpen ? 'DRAWER_OPEN' : 'DRAWER_COLLAPSED',
    }
  } else {
    let size: SourceSize
    let width: number
    let height: number
    if (input.appState.overlays.includes('FOCUS')) {
      size = 'FOCUS'; width = shell.source.focus.w * w; height = shell.source.run.h * h
    } else if (input.sourceExpanded) {
      size = 'EDIT'; width = shell.source.edit[0] * w; height = shell.source.edit[1] * h
    } else if (input.appState.execution === 'DEBUG_PAUSED') {
      size = 'DEBUG'; width = shell.source.debug[0] * w; height = shell.source.debug[1] * h
    } else if (input.hasRuntimeWorld) {
      size = 'RUN'; width = clamp(shell.source.run.w * w, shell.source.run.minPx, shell.source.run.maxPx); height = shell.source.run.h * h
    } else {
      size = 'EDIT'; width = shell.source.edit[0] * w; height = shell.source.edit[1] * h
    }
    source = { x: shell.source.x * w, y: shell.source.y * h, width, height, size }
  }

  const explorer: Rect | null = input.explorerOpen && (!narrow || input.narrowDrawerOpen) ? {
    x: source.x, y: source.y,
    width: (shell.explorer.wMin + shell.explorer.wMax) / 2 * w,
    height: source.height,
  } : null
  // This rectangle is the visual band. Toggle hit boxes are separately 24 px
  // tall, bottom-aligned, extending into control-free Time_Dock padding (§2).
  const stripHeight = Math.min(shell.dock.stripMaxPx, shell.timeDock.bottom * h)
  const dockStrip: Rect = { x: 0, y: h - stripHeight, width: w, height: stripHeight }
  const drawerRatio = Number.isFinite(input.dockDrawer.heightRatio)
    ? clamp(input.dockDrawer.heightRatio, shell.dock.drawer.min, shell.dock.drawer.max)
    : shell.dock.drawer.default
  const dockDrawer: Rect | null = input.dockDrawer.open ? {
    x: inset, y: timeDock.y - drawerRatio * h,
    width: timeDock.width, height: drawerRatio * h,
  } : null

  let inspector: Rect | null = null
  if (input.inspector.open) {
    if (narrow) {
      // A Focus target needs room for its full-size face and runtime captions.
      // Content remains virtualized in the shorter sheet; 45% stays the cap.
      const height = Math.min(shell.inspector.sheetMaxH,input.appState.overlays.includes('FOCUS') ? .30 : shell.inspector.sheetMaxH) * h
      inspector = { x: 0, y: h - height, width: w, height }
    } else {
      const width = Math.max(shell.inspector.w * w, shell.inspector.minPx)
      inspector = {
        // The left half also contains Source. Prefer the available space beside
        // it, clamped to the required opposite half; never resize Source.
        x: input.inspector.side === 'right' ? shell.inspector.rightEdge * w - width
          : Math.min(w/2-width,Math.max((1-shell.inspector.rightEdge)*w,source.x+source.width+.01*w)),
        y: shell.inspector.top * h, width, height: shell.inspector.maxH * h,
      }
    }
  }
  // Six compact controls. The spec fixes centering/top, not total bar width.
  const debugWidth = Math.min(w, 6 * shell.modeButton.maxPx + 5 * shell.modeButton.gapPx)
  const debugBar: Rect | null = input.debugActive ? {
    x: (w - debugWidth) / 2, y: header.height + 8,
    width: debugWidth, height: shell.modeButton.maxPx,
  } : null
  const sourceHeadingInset=debugBar&&source.size!=='DRAWER_COLLAPSED'
    &&source.x<debugBar.x+debugBar.width&&source.x+source.width>debugBar.x
    ?Math.max(0,debugBar.y+debugBar.height-source.y):0

  // Narrow framing always reserves the collapsed peek rail, even while its
  // transient drawer/sheet is open; opening them does not refit the World.
  const sourceLeft = narrow ? peekWidth : source.x + source.width + 0.014 * w
  const left = !narrow&&inspector&&input.inspector.side==='left'?Math.max(sourceLeft,inspector.x+inspector.width+0.01*w):sourceLeft
  const right = !narrow && inspector && input.inspector.side === 'right'
    ? inspector.x - 0.01 * w : narrow ? w : shell.safeFrame.x[1] * w
  const top = narrow ? header.height : shell.safeFrame.y[0] * h
  let bottom = narrow ? timeDock.y : Math.min(shell.safeFrame.y[1] * h, timeDock.y - 0.019 * h)
  if (kind === 'SHORT') bottom = Math.max(bottom, top + shell.safeFrame.minShortH * h)
  const safeFrame: Rect = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }

  return { viewportClass: kind, header, source, explorer, timeDock, dockStrip, dockDrawer, inspector, debugBar, sourceHeadingInset, safeFrame }
}

/** Commands fit against the open workbench surfaces. The base Safe Frame
 * remains stable for shell layout and opening a transient surface alone. */
export function worldCommandFrame(layout: ShellLayout): Rect {
  const safe = layout.safeFrame
  const left = layout.source.size === 'DRAWER_OPEN'
    ? Math.max(safe.x, layout.source.x + layout.source.width) : safe.x
  const top = layout.debugBar ? Math.max(safe.y, layout.debugBar.y + layout.debugBar.height) : safe.y
  let bottom = safe.y + safe.height
  if (layout.dockDrawer) bottom = Math.min(bottom, layout.dockDrawer.y)
  if (layout.viewportClass === 'NARROW' && layout.inspector) bottom = Math.min(bottom, layout.inspector.y)
  const right = safe.x + safe.width
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : safe
}
