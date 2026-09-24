import { defineConfig } from '@playwright/test'

// Real-browser tests for the Aegis Enforcer extension (e2e/*.pw.ts). The
// `.pw.ts` suffix keeps them out of Vitest's default `*.test.ts` glob.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
})
