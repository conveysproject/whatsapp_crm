// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

// wbmsg own-auth mode (see docs/runbooks/own-auth-local-wbmsg.md): no Clerk session, headless,
// and the runbook starts the API/web servers itself.
const WBMSG = process.env['E2E_AUTH_PROVIDER'] === 'wbmsg';

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts', // skips itself in wbmsg mode
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    storageState: WBMSG ? undefined : 'e2e/.auth/user.json',
    headless: WBMSG,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: WBMSG ? undefined : [
    {
      command: 'pnpm --filter @WBMSG/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @WBMSG/api dev',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
