import {randomUUID} from 'node:crypto'
import {defineConfig} from '@playwright/test'
import defaults from './playwright.config'
process.env.VJ_REFERENCE_RUN_ID??=randomUUID()
export default defineConfig({...defaults,testDir:'./e2e/reference',testMatch:'comparable-states.spec.ts',testIgnore:[],timeout:90000,reporter:[['list'],['./e2e/reference/reporter.ts']],use:{...defaults.use,deviceScaleFactor:1}})
