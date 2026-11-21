import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'production-browser.spec.mjs',
  timeout: 45_000,
  expect: { timeout: 20_000 },
  retries: 1,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.QA_BROWSER_BASE_URL || 'https://qamanager.saipulbahri-it.workers.dev',
    headless: true,
    trace: 'retain-on-failure',
  }
});
