import type { AppState } from '../state/appState'
import type { ShellLayout } from '../shell/shellLayout'
import { useCameraStore } from '../camera/cameraStore'
import { cameraPosition } from '../camera/projection'
import { orbitPoseFromEye } from '../camera/CameraRig'
import type { EyePose } from '../camera/cameraConstraints'
import type {} from './worldObservation'
export interface QaSnapshot { appState: AppState; layout: ShellLayout; cursor: number; liveHead: number }
export function exposeQaBridge(snapshot: QaSnapshot) {
  if (!(import.meta.env.DEV && new URLSearchParams(location.search).get('qa') === '1') && import.meta.env.VITE_QA !== '1') return
  const rect = (selector: string) => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
  Object.assign(window, { __ggjavaezQA: {
    appState: () => snapshot.appState,
    cursor: () => ({cursor: snapshot.cursor, liveHead: snapshot.liveHead}),
    shellRects: () => ({header: rect('.shell-header'), source: rect('.ide-editor-panel'), timeDock: rect('.world-timeline'), inspector: rect('.inspector'), safeFrame: snapshot.layout.safeFrame}),
    cameraPose: () => {const pose=useCameraStore.getState().pose;return {position:cameraPosition(pose),target:pose.target}},
    setCameraPose: (pose: EyePose) => useCameraStore.getState().requestPose(orbitPoseFromEye(pose)),
    scene:()=>window.__ggjavaezWorld?.scene()??null,
    selection:()=>window.__ggjavaezWorld?.selection()??null,
    projectedPoint:(id:string)=>window.__ggjavaezWorld?.projectedPoint(id)??null,
    planStats:()=>{const plan=window.__ggjavaezWorld?.plan();return plan?{...plan.accounting,detailLevel:plan.detailLevel,budgetOverflow:plan.budgetOverflow,curves:plan.curves.length,cells:[...plan.cellWindows.values()].reduce((count,window)=>count+window.visible.length,0),renderer:window.__ggjavaezWorld?.renderer()}:null},
    ready: () => new Promise<void>((resolve, reject) => {
      let closed=false
      const timeout = setTimeout(() => {closed=true;reject(new Error('Renderer readiness timeout'))}, 10000)
      const check=()=>{if(closed)return;const world=window.__ggjavaezWorld;if(!world){requestAnimationFrame(check);return}clearTimeout(timeout);void world.ready().then(()=>{closed=true;resolve()},error=>{closed=true;reject(error)})};check()
    }),
  } })
}
