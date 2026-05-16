import { chromium, type FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const email = process.env['E2E_TEST_EMAIL'];
  const password = process.env['E2E_TEST_PASSWORD'];
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env.test');
  }

  console.log('[global-setup] Signing in to Clerk...');
  await page.goto('http://localhost:3000/sign-in');

  // Clerk two-step sign-in: email → Continue → password → Continue
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  console.log('[global-setup] Signed in. Saving storage state...');

  await context.storageState({ path: 'e2e/.auth/user.json' });
  await browser.close();
  console.log('[global-setup] Done.');
}
