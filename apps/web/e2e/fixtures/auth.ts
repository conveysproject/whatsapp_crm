import { test as base, expect } from '@playwright/test';

type AuthFixtures = {
  /** Returns a valid Clerk JWT for the logged-in test user */
  getApiToken: () => Promise<string>;
};

export const test = base.extend<AuthFixtures>({
  getApiToken: async ({ page }, use) => {
    const getToken = async (): Promise<string> => {
      if (!page.url().includes('localhost:3000') || page.url().includes('sign-in')) {
        await page.goto('/dashboard');
      }
      const token = await page.evaluate(async (): Promise<string> => {
        const clerk = (window as any).Clerk;
        if (!clerk) throw new Error('Clerk not available on window');
        return (await clerk.session?.getToken()) ?? '';
      });
      if (!token) throw new Error('Failed to obtain Clerk session token');
      return token;
    };
    await use(getToken);
  },
});

export { expect };
