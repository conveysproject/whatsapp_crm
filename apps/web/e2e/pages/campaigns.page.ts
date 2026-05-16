import type { Page } from '@playwright/test';

export class CampaignsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/campaigns');
    await this.page.waitForLoadState('networkidle');
  }

  async clickNewCampaign() {
    await this.page.getByRole('link', { name: 'New Campaign' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async expectHeading() {
    await this.page.getByRole('heading', { name: 'Campaigns' }).waitFor();
  }

  async expectCampaignInList(name: string) {
    await this.page.getByText(name).waitFor({ timeout: 10_000 });
  }

  async archiveCampaign(name: string) {
    const row = this.page.getByRole('row').filter({ hasText: name });
    await row.getByRole('button', { name: 'Archive' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async switchToArchived() {
    await this.page.getByRole('button', { name: 'archived' }).click();
    await this.page.waitForLoadState('networkidle');
  }
}
