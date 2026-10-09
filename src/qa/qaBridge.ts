import type { AppState } from '../state/appState'
import type { ShellLayout } from '../shell/shellLayout'
import { useNavigationStore } from '../navigation'
export interface QaSnapshot { appState: AppState; layout: ShellLayout; cursor: number; liveHead: number }
export function exposeQaBridge(snapshot: QaSnapshot) {
  if (!(import.meta.env.DEV && new URLSearchParams(location.search).get('qa') === '1') && import.meta.env.VITE_QA !== '1') return
  const rect = (selector: string) => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
  Object.assign(window, { __ggjavaezQA: {
    appState: () => snapshot.appState,
    cursor: () => ({cursor: snapshot.cursor, liveHead: snapshot.liveHead}),
    shellRects: () => ({header: rect('.shell-header'), source: rect('.ide-editor-panel'), timeDock: rect('.world-timeline'), inspector: rect('.inspector'), safeFrame: snapshot.layout.safeFrame}),
    cameraPose: () => useNavigationStore.getState().pose,
    setCameraPose: (pose: ReturnType<typeof useNavigationStore.getState>['pose']) => useNavigationStore.getState().freeExplore(pose),
    ready: () => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Renderer readiness timeout')), 10000)
      void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve() })))
    }),
  } })
}
