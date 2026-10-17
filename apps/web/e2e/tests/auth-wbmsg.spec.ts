import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  completeBusinessDetails,
  logMark,
  signIn,
  signUp,
  strongPassword,
  trackPageErrors,
  uniqueEmail,
  waitForCode,
} from '../fixtures/auth-wbmsg';

// Runs only against the local stack started per docs/runbooks/own-auth-local-wbmsg.md.
test.skip(process.env['E2E_AUTH_PROVIDER'] !== 'wbmsg', 'wbmsg own-auth mode only');

const deviceRows = (page: Page) =>
  page.locator('section', { hasText: 'Signed-in devices' }).locator('li');

async function newPage(browser: Browser) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

test.describe.serial('wbmsg own-auth: account lifecycle', () => {
  const user = { email: uniqueEmail('life'), password: strongPassword() };

  test('sign up, verify code, business details, dashboard', async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    await signUp(page, user);
    await completeBusinessDetails(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await ctx.close();
  });

  test('new device, two devices, sign out everywhere else, sign out, forgot and reset', async ({ browser }) => {
    // Two fresh browser contexts: each is an unknown device and must confirm with a code.
    const a = await newPage(browser);
    await signIn(a.page, user, { newDevice: true });
    const b = await newPage(browser);
    await signIn(b.page, user, { newDevice: true });

    await b.page.goto('/settings/security');
    await expect(deviceRows(b.page).first()).toBeVisible();
    await expect.poll(async () => await deviceRows(b.page).count()).toBeGreaterThanOrEqual(2);
    await expect(b.page.getByText('This device')).toHaveCount(1);

    b.page.on('dialog', (d) => void d.accept());
    await b.page.getByRole('button', { name: 'Sign out everywhere else' }).click();
    await expect.poll(async () => await deviceRows(b.page).count()).toBe(1);

    // The other context is sent to /sign-in on its next navigation.
    await a.page.goto('/settings/security');
    await expect(a.page).toHaveURL(/\/sign-in/);

    // Sign out through the profile menu.
    await b.page.goto('/dashboard');
    await b.page.locator('button.rounded-full.bg-emerald-500').click();
    await b.page.getByRole('button', { name: 'Log Out' }).click();
    await expect(b.page).toHaveURL(/\/sign-in/);

    // Forgot, then reset: signs the user in with the new password.
    const c = await newPage(browser);
    await c.page.goto('/forgot-password');
    await c.page.getByLabel('Email').fill(user.email);
    const mark = logMark();
    await c.page.getByRole('button', { name: 'Send code' }).click();
    await expect(c.page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    const code = await waitForCode(user.email, 'password_reset', mark);
    await c.page.getByLabel('6-digit code').fill(code);
    await c.page.getByLabel('New password').fill(strongPassword());
    await c.page.getByRole('button', { name: 'Set password and sign in' }).click();
    await c.page.waitForURL('**/dashboard', { timeout: 30_000 });

    await a.ctx.close();
    await b.ctx.close();
    await c.ctx.close();
  });
});

test.describe('wbmsg own-auth: Phase 2 page smoke', () => {
  test('every touched page loads without client-side errors', async ({ browser }) => {
    const user = { email: uniqueEmail('smoke'), password: strongPassword() };
    const { ctx, page } = await newPage(browser);
    const health = trackPageErrors(page);

    await signUp(page, user);
    await expect(page.getByText('Business details').first()).toBeVisible();
    await health.assertHealthy();

    await completeBusinessDetails(page);
    await page.locator('button.rounded-full.bg-emerald-500').click();
    await expect(page.getByRole('button', { name: 'Log Out' })).toBeVisible();
    await health.assertHealthy();

    await page.goto('/settings/security');
    await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
    await expect(page.getByText('Signed-in devices')).toBeVisible();
    await health.assertHealthy();

    // Admin area: a normal vendor user must be sent away, not crash.
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    expect(new URL(page.url()).pathname).not.toBe('/admin');
    await health.assertHealthy();

    await page.goto('/invitations/not-a-real-token/accept');
    await page.waitForLoadState('domcontentloaded');
    await health.assertHealthy();

    await ctx.close();
  });
});
