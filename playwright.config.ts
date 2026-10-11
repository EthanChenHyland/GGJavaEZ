import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Exhaustive real-JVM reference matrix has its own count-enforcing gate.
  testIgnore: '**/reference/comparable-states.spec.ts',
  timeout: 30_000,
  retries: 0,
  // The bridge owns one current JVM run/debug session. Parallel IDE pages can
  // stop another test's run during hydration; keep real execution tests serial.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
