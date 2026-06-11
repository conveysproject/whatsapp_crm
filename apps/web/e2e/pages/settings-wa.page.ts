import type { Page } from '@playwright/test';

export class SettingsWaPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/settings/whatsapp-account');
    await this.page.getByRole('heading', { name: 'WhatsApp Account' }).waitFor({ timeout: 10_000 });
  }

  async waitForProfileForm() {
    await this.page.getByRole('button', { name: 'Save Profile' }).waitFor({ timeout: 15_000 });
  }

  async syncPhoneNumbers() {
    await this.page.getByRole('button', { name: 'Sync from Meta' }).click();
    await this.page.getByRole('button', { name: 'Syncing…' }).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    await this.page.getByRole('button', { name: 'Sync from Meta' }).waitFor({ timeout: 15_000 });
  }

  async updateBusinessProfile(about: string, address: string) {
    await this.waitForProfileForm();
    await this.page.getByLabel('About').fill(about);
    await this.page.getByLabel('Address').fill(address);
    await this.page.getByRole('button', { name: 'Save Profile' }).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectConnectedStatus() {
    await this.page.getByText('connected').waitFor({ timeout: 10_000 });
  }

  async expectHeading() {
    await this.page.getByRole('heading', { name: 'WhatsApp Account' }).waitFor();
  }

  /** Waits for the Connected Channels section to appear */
  async waitForChannelsSection() {
    await this.page.getByRole('heading', { name: 'Connected Channels' }).waitFor({ timeout: 10_000 });
  }

  /** Returns the connection badge text for a given channel name */
  async channelStatus(channelName: 'WhatsApp' | 'Messenger / Facebook Pages' | 'Instagram'): Promise<string> {
    const row = this.page.locator('section').filter({ hasText: 'Connected Channels' });
    const badge = row.getByText(channelName).locator('..').locator('..').getByText(/connected|not connected/i);
    return (await badge.textContent())?.toLowerCase().trim() ?? '';
  }

  /** Stubs window.FB so the Connect button can be clicked without a real Meta popup */
  async stubFBSDK() {
    await this.page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['FB'] = {
        init: () => {},
        login: (_cb: (r: Record<string, unknown>) => void, _params: unknown) => {
          setTimeout(() => _cb({ authResponse: null, status: 'unknown' }), 50);
        },
      };
    });
  }
}
