import { create } from 'zustand'
import { cinematicAvailability, type CinematicAvailability, type GpuCapabilities } from './gpuCapabilities'
import { idleActivity, PipelineGovernor, type PipelineActivity, type QualityTier } from './pipelineGovernor'
import { FrameTimeWatchdog, slowFrameNotice } from './frameTimeWatchdog'
import type { CinematicMaterialModule } from './materialTypes'

export type { QualityTier } from './pipelineGovernor'
export interface QualityState {
  setting: QualityTier
  active: QualityTier
  capabilities: GpuCapabilities | null
  cinematicAvailable: CinematicAvailability
  cinematicStatus: 'idle' | 'loading' | 'ready' | 'failed'
  cinematicModule: CinematicMaterialModule | null
  compiled: boolean
  contextLost: boolean
  notice: string | null
  reducedMotion: { os: boolean; inApp: boolean }
  activity: PipelineActivity
  initialize(capabilities: GpuCapabilities): void
  selectQuality(tier: QualityTier): Promise<void>
  setActivity(activity: Partial<PipelineActivity>): void
  setCompiled(value: boolean): void
  frame(now: number, frameMs: number, cameraMoving: boolean): void
  setContextLost(value: boolean): void
  reportFailure(reason: string): void
  setReducedMotion(inApp: boolean): void
  setOsReducedMotion(os: boolean): void
  clearNotice(): void
}

export function createQualityStore(loadCinematic: () => Promise<CinematicMaterialModule> = () => import('./cinematicMaterials')) {
  const governor = new PipelineGovernor(), watchdog = new FrameTimeWatchdog()
  let pending: Promise<void> | null = null, generation = 0
  return create<QualityState>((set, get) => ({
    setting: 'INTERACTIVE', active: 'INTERACTIVE', capabilities: null,
    cinematicAvailable: { enabled: false, reason: 'Checking GPU capabilities' },
    cinematicStatus: 'idle', cinematicModule: null, compiled: false, contextLost: false,
    notice: null, reducedMotion: { os: false, inApp: false }, activity: { ...idleActivity },
    initialize(capabilities) {
      governor.reset(); watchdog.reset()
      set({ capabilities, cinematicAvailable: cinematicAvailability(capabilities), active: 'INTERACTIVE', compiled: false, contextLost: false })
      if (!get().cinematicAvailable.enabled) set({ setting: 'INTERACTIVE' })
    },
    async selectQuality(tier) {
      if (tier === 'INTERACTIVE') { watchdog.reset(); set({ setting: tier, active: tier, notice: null }); return }
      const state = get()
      if (!state.cinematicAvailable.enabled || state.contextLost) return
      set({ setting: tier, notice: null })
      if (state.cinematicModule) {
        if (state.cinematicStatus === 'failed') set({ cinematicStatus: 'ready', compiled: false })
        return
      }
      if (pending) return pending
      const request = ++generation
      set({ cinematicStatus: 'loading' })
      pending = loadCinematic().then(module => {
        if (request === generation) set({ cinematicModule: module, cinematicStatus: 'ready', compiled: false })
      }).catch(error => {
        if (request === generation) get().reportFailure(`Cinematic materials could not be loaded: ${error instanceof Error ? error.message : String(error)}`)
      }).finally(() => { pending = null })
      return pending
    },
    setActivity(activity) { set(state => ({ activity: { ...state.activity, ...activity } })) },
    setCompiled(compiled) { set({ compiled }) },
    frame(now, frameMs, cameraMoving) {
      const state = get()
      const active = governor.update(state.setting,
        state.compiled && state.cinematicStatus === 'ready' && state.cinematicAvailable.enabled && !state.contextLost,
        { ...state.activity, cameraMoving: state.activity.cameraMoving || cameraMoving }, now)
      if (watchdog.update(active, now, frameMs)) {
        watchdog.reset(); set({ setting: 'INTERACTIVE', active: 'INTERACTIVE', notice: slowFrameNotice })
      } else if (active !== state.active) set({ active })
    },
    setContextLost(contextLost) {
      governor.reset(); watchdog.reset()
      set({ contextLost, active: 'INTERACTIVE', compiled: false,
        notice: contextLost ? 'The World graphics context was lost. Restoring rendering…' : null })
    },
    reportFailure(reason) { watchdog.reset(); set({ setting: 'INTERACTIVE', active: 'INTERACTIVE', cinematicStatus: 'failed', compiled: false, notice: reason }) },
    setReducedMotion(inApp) { set(state => ({ reducedMotion: { ...state.reducedMotion, inApp } })) },
    setOsReducedMotion(os) { set(state => ({ reducedMotion: { ...state.reducedMotion, os } })) },
    clearNotice() { set({ notice: null }) },
  }))
}

/** Root settings/commands use selectQuality(); timeline uses setActivity({scrubbing,liveTrailing}). */
export const useQualityStore = createQualityStore()
export const qualityStore = useQualityStore
