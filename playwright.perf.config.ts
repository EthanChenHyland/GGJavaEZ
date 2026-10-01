import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/** Opt-in browser performance baseline (spec task 0.7). Not part of `npm run test:e2e`. */
export default defineConfig({ ...base, testDir: './perf-e2e', timeout: 600_000 })
