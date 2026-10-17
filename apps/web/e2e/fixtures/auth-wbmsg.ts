import * as fs from 'fs';
import { expect, type Page } from '@playwright/test';

// Helpers for the wbmsg own-auth e2e. Codes come from the API's dev-only code sink
// (AUTH_DEV_LOG_CODES=1, NODE_ENV!=production), which the runbook pipes to E2E_API_LOG.

export type CodePurpose =
  | 'email_verify'
  | 'signin_email'
  | 'signin_whatsapp'
  | 'new_device'
  | 'password_reset'
  | 'phone_verify';

function logPath(): string {
  const p = process.env['E2E_API_LOG'];
  if (!p) throw new Error('E2E_API_LOG is not set (path of the file the API stdout is piped to)');
  return p;
}

/** Current end of the API log. Call before the action that triggers an email, then pass to waitForCode. */
export function logMark(): number {
  try {
    return fs.statSync(logPath()).size;
  } catch {
    return 0;
  }
}

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export function strongPassword(): string {
  return `Wb-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}-Zq9!`;
}

/** Latest code logged for (purpose, email) after byte offset `since`. Polls until timeout. */
export async function waitForCode(
  email: string,
  purpose: CodePurpose,
  since = 0,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const needle = `[dev-code] ${purpose} ${email.toLowerCase()} `;
  for (;;) {
    let text = '';
    try {
      const buf = fs.readFileSync(logPath());
      text = buf.subarray(Math.min(since, buf.length)).toString('utf8');
    } catch {
      // log not created yet
    }
    const hits = text
      .split(/\r?\n/)
      .filter((l) => l.includes(needle))
      .map((l) => l.slice(l.indexOf(needle) + needle.length).trim())
      .filter((c) => /^\d{6}$/.test(c));
    const last = hits[hits.length - 1];
    if (last) return last;
    if (Date.now() > deadline) throw new Error(`No ${purpose} code for ${email} found in the API log`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Sign up through the UI and stop on /business-details. */
export async function signUp(
  page: Page,
  user: { email: string; password: string; firstName?: string; lastName?: string },
): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('First name').fill(user.firstName ?? 'E2E');
  await page.getByLabel('Last name').fill(user.lastName ?? 'Tester');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  const mark = logMark();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const code = await waitForCode(user.email, 'email_verify', mark);
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL('**/business-details');
}

/** Fill the business-details form and submit; ends on the dashboard. */
export async function completeBusinessDetails(page: Page): Promise<void> {
  const form = page.locator('.bd2');
  await form.getByPlaceholder('www.yourcompany.com').fill('www.example.com');
  await form.getByPlaceholder('Mumbai, Maharashtra').fill('Mumbai, Maharashtra');
  const selects = form.locator('select');
  await selects.nth(0).selectOption({ index: 1 });
  await selects.nth(1).selectOption({ index: 1 });
  await selects.nth(2).selectOption({ index: 1 });
  await form.locator('.bd2-check').check();
  await form.getByRole('button', { name: /Create Account/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

/** Sign in with email + password. With newDevice, also completes the new-device code step. */
export async function signIn(
  page: Page,
  user: { email: string; password: string },
  opts: { newDevice?: boolean } = {},
): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  const mark = logMark();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (opts.newDevice) {
    await expect(page.getByRole('heading', { name: 'Confirm it is you' })).toBeVisible();
    const code = await waitForCode(user.email, 'new_device', mark);
    await page.getByLabel('6-digit code').fill(code);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

/** Record uncaught page errors; call assertHealthy() after each navigation. */
export function trackPageErrors(page: Page): { errors: string[]; assertHealthy: () => Promise<void> } {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return {
    errors,
    async assertHealthy() {
      // Next.js dev error overlay lives in a <nextjs-portal> element.
      await expect(page.locator('nextjs-portal')).toHaveCount(0);
      expect(errors, 'uncaught page errors').toEqual([]);
    },
  };
}
