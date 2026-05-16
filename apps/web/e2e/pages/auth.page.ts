import type { Page } from '@playwright/test';

export class AuthPage {
  constructor(private page: Page) {}

  async gotoSignIn() {
    await this.page.goto('/sign-in');
  }

  async signIn(email: string, password: string) {
    await this.page.getByLabel('Email address').fill(email);
    await this.page.getByRole('button', { name: 'Continue' }).click();
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Continue' }).click();
    await this.page.waitForURL('**/dashboard', { timeout: 15_000 });
  }

  async signOut() {
    await this.page.locator('[data-clerk-component="UserButton"]').click();
    await this.page.getByRole('menuitem', { name: 'Sign out' }).click();
    await this.page.waitForURL('**/sign-in', { timeout: 10_000 });
  }

  async expectOnDashboard() {
    await this.page.waitForURL('**/dashboard');
  }

  async expectOnSignIn() {
    await this.page.waitForURL('**/sign-in');
  }
}
