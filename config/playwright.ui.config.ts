import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: path.join(projectRoot, 'tests', 'ui'),
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: true,
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    colorScheme: 'dark',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run vite-dev -- --config config/vite.ui.config.ts --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/primitives',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
});
