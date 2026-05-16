import type { Page } from '@playwright/test';

export class ContactsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/contacts');
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.page.getByPlaceholder('Search contacts…').fill(query);
    // Wait for the loading indicator to appear then disappear, or for results to stabilize
    await this.page.waitForLoadState('networkidle');
  }

  async clickAddContact() {
    await this.page.getByRole('button', { name: 'Add Contact' }).click();
  }

  async fillNewContactForm(opts: { name: string; phone: string }) {
    await this.page.getByLabel('Name').fill(opts.name);
    await this.page.getByLabel('Phone').fill(opts.phone);
  }

  async submitNewContactForm() {
    await this.page.getByRole('button', { name: 'Save' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async openContact(name: string) {
    await this.page.getByRole('row').filter({ hasText: name }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async blockContact() {
    await this.page.getByRole('button', { name: 'Block' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async unblockContact() {
    await this.page.getByRole('button', { name: 'Unblock' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async toggleBot() {
    await this.page.getByRole('button', { name: /Toggle bot|Disable bot|Enable bot/i }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async expectContactInList(name: string) {
    await this.page.getByRole('row').filter({ hasText: name }).waitFor();
  }

  async expectContactNotInList(name: string) {
    await this.page.getByRole('row').filter({ hasText: name }).waitFor({ state: 'hidden' });
  }
}
