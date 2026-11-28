import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60000,
  expect: {timeout: 20000},
  fullyParallel: true,
  retries: 0,
  use: {baseURL: 'http://127.0.0.1:4173', actionTimeout: 15000},
  webServer: {command: 'node serve.mjs', url: 'http://127.0.0.1:4173/healthz', reuseExistingServer: true, timeout: 20000},
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'webkit', use: {...devices['Desktop Safari']}}
  ]
});
