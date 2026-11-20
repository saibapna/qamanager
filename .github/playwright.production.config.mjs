import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.github/tests',
  testMatch: 'production-browser.spec.mjs',
  timeout: 45_000,
  expect: { timeout: 20_000 },
  retries: 1,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://qamanager.saipulbahri-it.workers.dev',
    headless: true,
    trace: 'retain-on-failure',
  }
});
