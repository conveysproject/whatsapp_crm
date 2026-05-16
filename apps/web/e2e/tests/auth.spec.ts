import { test, expect } from '../fixtures/index';
import { AuthPage } from '../pages/auth.page';

test.describe('Authentication', () => {
  test('unauthenticated visit to /inbox redirects to /sign-in', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/inbox');
    await expect(page).toHaveURL(/sign-in/);
    await ctx.close();
  });

  test('sign-in with valid credentials navigates to /dashboard', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    const auth = new AuthPage(page);

    await auth.gotoSignIn();
    await auth.signIn(
      process.env['E2E_TEST_EMAIL']!,
      process.env['E2E_TEST_PASSWORD']!,
    );
    await auth.expectOnDashboard();
    await expect(page).toHaveURL(/dashboard/);
    await ctx.close();
  });

  test('sign-out redirects to /sign-in', async ({ page }) => {
    await page.goto('/dashboard');
    const auth = new AuthPage(page);
    await auth.signOut();
    await auth.expectOnSignIn();
  });
});
