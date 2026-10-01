import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } } },
  // Acceptance (real Maven/Gradle/JDK corpus) and performance baselines are opt-in suites:
  // npm run test:acceptance / npm run perf:baseline (spec Phase 0, tasks 0.3–0.6).
  test: { environment: 'node', exclude: ['e2e/**', 'perf-e2e/**', 'node_modules/**', ...((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VJ_SUITE ? [] : ['tests/acceptance/**', 'tests/perf/**'])] },
})
