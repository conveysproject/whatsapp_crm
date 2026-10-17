import * as fs from 'fs';
import * as path from 'path';
import { clerkSetup } from '@clerk/testing/playwright';
import { chromium, type FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig) {
  // wbmsg own-auth mode signs in through the UI inside the spec; no Clerk session is needed.
  if (process.env['E2E_AUTH_PROVIDER'] === 'wbmsg') return;
  await clerkSetup();
  const authFile = path.resolve('e2e/.auth/user.json');

  // Reuse stored session if __clerk_db_jwt is still present (valid until 2027).
  // The short-lived __session JWT is refreshed automatically by Clerk.js on each page load.
  if (fs.existsSync(authFile)) {
    const state = JSON.parse(fs.readFileSync(authFile, 'utf8')) as {
      cookies?: Array<{ name: string; value: string }>;
    };
    const dbJwt = state.cookies?.find(c => c.name === '__clerk_db_jwt');
    const clientUat = state.cookies?.find(c => c.name === '__client_uat');
    if (dbJwt && clientUat && parseInt(clientUat.value) > 0) {
      console.log('[global-setup] Reusing existing session — warming up Clerk server-side auth...');
      // The __session JWT has a 60s TTL. If it expired, the first test to hit a dashboard
      // page pays a 30-60s Clerk FAPI refresh cost and times out. Warm up here instead.
      const warmBrowser = await chromium.launch({ headless: true });
      const warmCtx = await warmBrowser.newContext({ storageState: authFile });
      const warmPage = await warmCtx.newPage();
      await warmPage.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded', timeout: 120_000 })
        .catch(err => console.warn('[global-setup] Warm-up navigation timed out (will retry in tests):', err.message));
      await warmCtx.storageState({ path: authFile });
      await warmBrowser.close();
      console.log('[global-setup] Session warmed up and saved.');
      return;
    }
  }

  // No valid session — open a browser window for the user to log in manually.
  // The testing token bypasses Clerk bot-protection; the user handles 2FA in the UI.
  console.log('[global-setup] No valid session found — opening browser for manual sign-in...');
  console.log('[global-setup] Sign in and complete any 2FA prompt. The window closes automatically.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/sign-in', { timeout: 60_000 });

  // Wait up to 5 minutes for the user to:
  //   1. Complete sign-in + 2FA  (/sign-in/*)
  //   2. Fill in the business-details onboarding form  (/business-details)
  // Session is saved only after landing on a real app route.
  await page.waitForURL(
    url => {
      const s = url.toString();
      return !s.includes('/sign-in') && !s.includes('/business-details');
    },
    { timeout: 300_000 },
  );

  await context.storageState({ path: authFile });
  await browser.close();
  console.log('[global-setup] Session saved to e2e/.auth/user.json — all tests will reuse it.');
}
