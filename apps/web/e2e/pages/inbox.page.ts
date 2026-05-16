import type { Page } from '@playwright/test';

export class InboxPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/inbox');
    await this.page.waitForLoadState('networkidle');
  }

  async openConversationWith(contactName: string) {
    await this.page.getByText(contactName).first().click();
    await this.page.waitForLoadState('networkidle');
  }

  async typeMessage(text: string) {
    await this.page.getByPlaceholder('Type a message…').fill(text);
  }

  async sendMessage() {
    await this.page.getByRole('button', { name: 'Send' }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async resolveConversation() {
    await this.page.getByRole('button', { name: /Resolve|Close/i }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async expectMessageInThread(text: string) {
    await this.page.getByText(text).waitFor({ timeout: 10_000 });
  }

  async expectHeading() {
    await this.page.getByRole('heading', { name: 'Conversations' }).waitFor();
  }
}
