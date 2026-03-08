import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'on',
    ...devices['Desktop Chrome'],
    launchOptions: {
      args: ['--enable-webgl', '--use-gl=swiftshader'],
    },
  },
});
