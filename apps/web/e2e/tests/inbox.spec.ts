import { test, expect } from '../fixtures/index';
import { InboxPage } from '../pages/inbox.page';

const TEST_CONTACT_NAME = '[E2E] Inbox Test';
const TEST_PHONE = process.env['E2E_WA_TEST_RECIPIENT'] ?? '919907072035';
const API = 'http://localhost:4000/v1';

let contactId: string;

test.describe('Inbox', () => {
  let inboxPage: InboxPage;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/dashboard');

    await page.waitForFunction(() => !!(window as any).Clerk?.session, { timeout: 10_000 });
    const token = await page.evaluate(async (): Promise<string> => {
      const clerk = (window as any).Clerk;
      return (await clerk?.session?.getToken()) ?? '';
    });

    const res = await page.request.post(`${API}/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: TEST_CONTACT_NAME, phoneNumber: TEST_PHONE },
    });
    const body = await res.json();
    contactId = body.data.id;

    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!contactId) return;
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/dashboard');

    await page.waitForFunction(() => !!(window as any).Clerk?.session, { timeout: 10_000 });
    const token = await page.evaluate(async (): Promise<string> => {
      const clerk = (window as any).Clerk;
      return (await clerk?.session?.getToken()) ?? '';
    });

    await page.request.delete(`${API}/contacts/${contactId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    inboxPage = new InboxPage(page);
    await inboxPage.goto();
  });

  test('inbox page loads with Conversations heading', async () => {
    await inboxPage.expectHeading();
  });

  test('send a text message to a conversation', async ({ page }) => {
    const conversationRow = page.getByText(TEST_CONTACT_NAME).first();
    const exists = await conversationRow.isVisible().catch(() => false);
    if (!exists) {
      test.skip(true, 'No conversation found for test contact — trigger an inbound message first');
      return;
    }
    await inboxPage.openConversationWith(TEST_CONTACT_NAME);
    const msgText = `E2E reply ${Date.now()}`;
    await inboxPage.typeMessage(msgText);
    await inboxPage.sendMessage();
    await inboxPage.expectMessageInThread(msgText);
  });

  test('resolve a conversation', async ({ page }) => {
    const conversationRow = page.getByText(TEST_CONTACT_NAME).first();
    const exists = await conversationRow.isVisible().catch(() => false);
    if (!exists) {
      test.skip(true, 'No conversation found — trigger an inbound message first');
      return;
    }
    await inboxPage.openConversationWith(TEST_CONTACT_NAME);
    await inboxPage.resolveConversation();
    await expect(conversationRow).not.toBeVisible({ timeout: 5_000 });
  });
});
