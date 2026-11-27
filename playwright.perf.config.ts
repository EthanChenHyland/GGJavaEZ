import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/** Opt-in browser performance baseline (spec task 0.7). Not part of `npm run test:e2e`. */
export default defineConfig({
  ...base,
  testDir: './perf-e2e',
  timeout: 600_000,
  ...(process.env.VJ_PASS6_LIFECYCLE === '1' ? {
    // The soak must keep the same frozen application and isolated bridge.
    webServer: undefined,
    use: { ...base.use, baseURL: process.env.VJ_PASS6_BASE_URL ?? base.use?.baseURL },
  } : {}),
})
