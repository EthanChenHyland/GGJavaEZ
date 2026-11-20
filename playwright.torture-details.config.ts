import { defineConfig } from '@playwright/test'
import defaults from './playwright.config'

export default defineConfig({
  ...defaults,
  projects: [
    {
      name: 'FreshTorture',
      testMatch: 'torture-v12-p5_5.spec.ts',
      grep: /02-arrays-cycles-collections|04-statics-and-exceptions|07-observed-wide-and-deep|08-many-lazy-statics/,
    },
    {
      name: 'RetainedDetails',
      testMatch: 'torture-details-v12-p5_5.spec.ts',
      dependencies: ['FreshTorture'],
    },
  ],
})
