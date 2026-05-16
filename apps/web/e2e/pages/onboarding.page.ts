import type { Page } from '@playwright/test';

export class OnboardingPage {
  constructor(private page: Page) {}

  async gotoConnectWaba() {
    await this.page.goto('/connect-waba');
    await this.page.waitForLoadState('networkidle');
  }

  async gotoChecklist() {
    await this.page.goto('/checklist');
    await this.page.waitForLoadState('networkidle');
  }

  async expectConnectWabaHeading() {
    await this.page.getByRole('heading', { name: 'Connect WhatsApp Business' }).waitFor();
  }

  async expectConnectWithMetaButton() {
    await this.page.getByRole('button', { name: /Connect with Meta|Loading/i }).waitFor({ timeout: 10_000 });
  }

  async clickSkipToChecklist() {
    await this.page.getByRole('link', { name: 'Skip to checklist' }).click();
    await this.page.waitForURL('**/checklist');
  }
}
