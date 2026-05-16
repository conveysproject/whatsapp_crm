import type { Page } from '@playwright/test';

export class SettingsWaPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/settings/whatsapp-account');
    await this.page.waitForLoadState('networkidle');
  }

  async syncPhoneNumbers() {
    await this.page.getByRole('button', { name: 'Sync from Meta' }).click();
    await this.page.getByRole('button', { name: 'Syncing…' }).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    await this.page.getByRole('button', { name: 'Sync from Meta' }).waitFor({ timeout: 15_000 });
  }

  async updateBusinessProfile(about: string, address: string) {
    await this.page.getByLabel('About').fill(about);
    await this.page.getByLabel('Address').fill(address);
    await this.page.getByRole('button', { name: 'Save Profile' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async expectConnectedStatus() {
    await this.page.getByText('connected').waitFor({ timeout: 10_000 });
  }

  async expectHeading() {
    await this.page.getByRole('heading', { name: 'WhatsApp Account' }).waitFor();
  }
}
