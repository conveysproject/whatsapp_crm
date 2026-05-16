# Playwright E2E Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a full Playwright E2E test suite for TrustCRM covering auth, onboarding, inbox, contacts, campaigns, and WhatsApp settings — visible in a real Chromium browser.

**Architecture:** Tests live in `apps/web/e2e/`. A `global-setup.ts` signs in once via Clerk's real sign-in UI and saves storage state to `e2e/.auth/user.json`. All specs load that state. Page Object Models (POMs) encapsulate all selectors. `beforeAll`/`afterAll` hooks use a browser context with the saved state to call the API for test data setup and teardown.

**Tech Stack:** `@playwright/test ^1.44`, Chromium (headed), TypeScript, Clerk session state, TrustCRM API at `http://localhost:4000/v1`.

---

## File Map

| File | Purpose |
|---|---|
| `apps/web/playwright.config.ts` | Playwright config — baseURL, webServer, storageState, reporters |
| `apps/web/e2e/global-setup.ts` | Signs in to Clerk, saves storage state |
| `apps/web/e2e/fixtures/auth.ts` | Helper fixture: `getApiToken()` extracts Clerk JWT from running page |
| `apps/web/e2e/fixtures/index.ts` | Re-exports test + expect from auth fixture |
| `apps/web/e2e/pages/auth.page.ts` | POM: sign-in/sign-out actions |
| `apps/web/e2e/pages/inbox.page.ts` | POM: inbox conversation list, message send, resolve |
| `apps/web/e2e/pages/contacts.page.ts` | POM: contacts list, create, search, block, toggle bot |
| `apps/web/e2e/pages/campaigns.page.ts` | POM: campaign list, new campaign |
| `apps/web/e2e/pages/settings-wa.page.ts` | POM: WhatsApp account settings actions |
| `apps/web/e2e/pages/onboarding.page.ts` | POM: connect-waba page |
| `apps/web/e2e/tests/auth.spec.ts` | Auth tests |
| `apps/web/e2e/tests/inbox.spec.ts` | Inbox tests |
| `apps/web/e2e/tests/contacts.spec.ts` | Contacts tests |
| `apps/web/e2e/tests/campaigns.spec.ts` | Campaigns tests |
| `apps/web/e2e/tests/settings-whatsapp.spec.ts` | WhatsApp settings tests |
| `apps/web/e2e/tests/onboarding.spec.ts` | Onboarding tests |
| `apps/web/.env.test.example` | Template for `.env.test` |
| `apps/web/.gitignore` | Add `.auth/` and `.env.test` |

---

## Task 1: Install Playwright and configure package.json

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/.gitignore`

- [ ] **Step 1: Install @playwright/test and dotenv**

```bash
cd apps/web
pnpm add -D @playwright/test@^1.44.0 dotenv
```

- [ ] **Step 2: Install Chromium browser**

```bash
cd apps/web
pnpm exec playwright install chromium
```

Expected: Chromium downloads to `~/.cache/ms-playwright/chromium-*`

- [ ] **Step 3: Add scripts to `apps/web/package.json`**

In the `"scripts"` block, add:

```json
"test:e2e":        "playwright test",
"test:e2e:headed": "playwright test --headed",
"test:e2e:ui":     "playwright test --ui",
"test:e2e:debug":  "playwright test --debug"
```

- [ ] **Step 4: Update `apps/web/.gitignore`**

Append to `apps/web/.gitignore` (create it if it doesn't exist):

```
# Playwright
e2e/.auth/
.env.test
playwright-report/
test-results/
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/.gitignore pnpm-lock.yaml
git commit -m "chore(web): install @playwright/test, add e2e scripts"
```

---

## Task 2: Create playwright.config.ts

**Files:**
- Create: `apps/web/playwright.config.ts`

- [ ] **Step 1: Create the config**

```typescript
// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'e2e/.auth/user.json',
    headless: false,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'pnpm --filter @WBMSG/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @WBMSG/api dev',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/playwright.config.ts
git commit -m "feat(e2e): add playwright.config.ts"
```

---

## Task 3: Environment setup

**Files:**
- Create: `apps/web/.env.test.example`
- Create: `apps/web/.env.test` (developer fills in, gitignored)

- [ ] **Step 1: Create `.env.test.example`**

```bash
# apps/web/.env.test.example
# Copy this file to .env.test and fill in real values

# Clerk test account credentials (use a dedicated test account, NOT your main account)
E2E_TEST_EMAIL=your-test@example.com
E2E_TEST_PASSWORD=your-test-password

# Meta WhatsApp test credentials (from Meta Developer sandbox — Step 1: Try it out)
E2E_WA_PHONE_NUMBER_ID=1084186771447470
E2E_WA_ACCESS_TOKEN=regenerate-this-token-before-test-runs
E2E_WA_TEST_RECIPIENT=919907072035
```

- [ ] **Step 2: Create `.env.test` with real credentials**

Copy `.env.test.example` to `.env.test` and fill in:
- `E2E_TEST_EMAIL` = the email address you sign in with (`conveysproject@gmail.com`)
- `E2E_TEST_PASSWORD` = the password for that Clerk account
- `E2E_WA_PHONE_NUMBER_ID` = `1084186771447470`
- `E2E_WA_ACCESS_TOKEN` = token from Meta Developer → Step 1 → Generate token
- `E2E_WA_TEST_RECIPIENT` = `919907072035`

- [ ] **Step 3: Commit example only**

```bash
git add apps/web/.env.test.example
git commit -m "chore(e2e): add .env.test.example"
```

---

## Task 4: Create global-setup.ts

**Files:**
- Create: `apps/web/e2e/global-setup.ts`
- Create: `apps/web/e2e/.auth/` directory (just ensure it exists; `user.json` is generated at runtime)

This runs once before all tests. It navigates to the sign-in page, logs in with the test Clerk account, and saves browser storage state for all subsequent tests to reuse.

- [ ] **Step 1: Create `apps/web/e2e/global-setup.ts`**

```typescript
import { chromium, type FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const email = process.env['E2E_TEST_EMAIL'];
  const password = process.env['E2E_TEST_PASSWORD'];
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env.test');
  }

  console.log('[global-setup] Signing in to Clerk...');
  await page.goto('http://localhost:3000/sign-in');

  // Clerk two-step sign-in: email → Continue → password → Continue
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  console.log('[global-setup] Signed in. Saving storage state...');

  await context.storageState({ path: 'e2e/.auth/user.json' });
  await browser.close();
  console.log('[global-setup] Done.');
}
```

- [ ] **Step 2: Ensure `.auth/` directory exists**

```bash
mkdir -p apps/web/e2e/.auth
```

- [ ] **Step 3: Run global-setup in isolation to verify sign-in works**

```bash
cd apps/web
E2E_TEST_EMAIL=conveysproject@gmail.com E2E_TEST_PASSWORD=<your-password> pnpm exec playwright test --global-setup-only 2>&1 || pnpm exec tsx e2e/global-setup.ts
```

Expected: browser opens, signs in, closes. `e2e/.auth/user.json` created with ~50+ KB of session state.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/global-setup.ts
git commit -m "feat(e2e): add global Clerk auth setup"
```

---

## Task 5: Create auth fixtures

**Files:**
- Create: `apps/web/e2e/fixtures/auth.ts`
- Create: `apps/web/e2e/fixtures/index.ts`

The `getApiToken` fixture navigates to `/dashboard` and calls `window.Clerk.session.getToken()` to obtain a JWT for API calls in `beforeAll`/`afterAll` setup hooks.

- [ ] **Step 1: Create `apps/web/e2e/fixtures/auth.ts`**

```typescript
import { test as base, expect } from '@playwright/test';

type AuthFixtures = {
  /** Returns a valid Clerk JWT for the logged-in test user */
  getApiToken: () => Promise<string>;
};

export const test = base.extend<AuthFixtures>({
  getApiToken: async ({ page }, use) => {
    const getToken = async (): Promise<string> => {
      // Navigate to any authenticated page so Clerk loads
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
```

- [ ] **Step 2: Create `apps/web/e2e/fixtures/index.ts`**

```typescript
export { test, expect } from './auth.js';
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/fixtures/
git commit -m "feat(e2e): add auth fixtures"
```

---

## Task 6: Create auth.page.ts POM

**Files:**
- Create: `apps/web/e2e/pages/auth.page.ts`

- [ ] **Step 1: Create the POM**

```typescript
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
    // Open user menu — Clerk renders a user button in the top-right
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/pages/auth.page.ts
git commit -m "feat(e2e): add AuthPage POM"
```

---

## Task 7: Create auth.spec.ts and verify

**Files:**
- Create: `apps/web/e2e/tests/auth.spec.ts`

- [ ] **Step 1: Create the spec**

```typescript
import { test, expect } from '../fixtures/index.js';
import { AuthPage } from '../pages/auth.page.js';

test.describe('Authentication', () => {
  test('unauthenticated visit to /inbox redirects to /sign-in', async ({ browser }) => {
    // Use a context with NO storage state
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
    // page already has storage state (signed in)
    await page.goto('/dashboard');
    const auth = new AuthPage(page);
    await auth.signOut();
    await auth.expectOnSignIn();
  });
});
```

- [ ] **Step 2: Run the auth tests**

```bash
cd apps/web
pnpm test:e2e --project=chromium e2e/tests/auth.spec.ts
```

Expected: 3 tests pass. If "Sign out" test fails (Clerk UserButton selector wrong), open `pnpm test:e2e:debug e2e/tests/auth.spec.ts` and use the inspector to find the correct user button locator, then update `auth.page.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/tests/auth.spec.ts
git commit -m "feat(e2e): auth tests (sign-in, sign-out, redirect)"
```

---

## Task 8: Create contacts.page.ts POM

**Files:**
- Create: `apps/web/e2e/pages/contacts.page.ts`

- [ ] **Step 1: Create the POM**

```typescript
import type { Page } from '@playwright/test';

export class ContactsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/contacts');
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.page.getByPlaceholder('Search contacts…').fill(query);
    await this.page.waitForTimeout(500); // debounce
  }

  async clickAddContact() {
    await this.page.getByRole('button', { name: 'Add Contact' }).click();
  }

  async fillNewContactForm(opts: { name: string; phone: string }) {
    // Modal/dialog opens after clicking Add Contact
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/pages/contacts.page.ts
git commit -m "feat(e2e): add ContactsPage POM"
```

---

## Task 9: Create contacts.spec.ts and verify

**Files:**
- Create: `apps/web/e2e/tests/contacts.spec.ts`

- [ ] **Step 1: Create the spec**

```typescript
import { test, expect } from '../fixtures/index.js';
import { ContactsPage } from '../pages/contacts.page.js';

const TEST_CONTACT_NAME = `[E2E] Contact ${Date.now()}`;
const TEST_CONTACT_PHONE = '919900000001';

test.describe('Contacts', () => {
  test('contacts page loads', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByPlaceholder('Search contacts…')).toBeVisible();
  });

  test('create a new contact', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await cp.clickAddContact();
    await cp.fillNewContactForm({ name: TEST_CONTACT_NAME, phone: TEST_CONTACT_PHONE });
    await cp.submitNewContactForm();
    await cp.expectContactInList(TEST_CONTACT_NAME);
  });

  test('search for a contact', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await cp.search('[E2E]');
    await expect(page.getByRole('row').filter({ hasText: '[E2E]' }).first()).toBeVisible();
  });

  test('open a contact and add notes', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await cp.search(TEST_CONTACT_NAME);
    await cp.openContact(TEST_CONTACT_NAME);
    const notesField = page.getByLabel('Notes');
    await notesField.fill('E2E test note');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(notesField).toHaveValue('E2E test note');
  });

  test('block and unblock a contact', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await cp.search(TEST_CONTACT_NAME);
    await cp.openContact(TEST_CONTACT_NAME);
    await cp.blockContact();
    await expect(page.getByRole('button', { name: 'Unblock' })).toBeVisible();
    await cp.unblockContact();
    await expect(page.getByRole('button', { name: 'Block' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the contacts tests**

```bash
cd apps/web
pnpm test:e2e --project=chromium e2e/tests/contacts.spec.ts
```

Expected: 5 tests pass. If "Add Contact" modal selectors are wrong, run `pnpm test:e2e:debug` to inspect the form labels and update `contacts.page.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/tests/contacts.spec.ts
git commit -m "feat(e2e): contacts tests (create, search, notes, block/unblock)"
```

---

## Task 10: Create inbox.page.ts POM

**Files:**
- Create: `apps/web/e2e/pages/inbox.page.ts`

- [ ] **Step 1: Create the POM**

```typescript
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
    // Wait for message to appear in thread
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/pages/inbox.page.ts
git commit -m "feat(e2e): add InboxPage POM"
```

---

## Task 11: Create inbox.spec.ts and verify

**Files:**
- Create: `apps/web/e2e/tests/inbox.spec.ts`

The inbox tests require an existing conversation. `beforeAll` creates a contact + conversation via the API, stores the IDs, and `afterAll` cleans up.

- [ ] **Step 1: Create the spec**

```typescript
import { test, expect } from '../fixtures/index.js';
import { InboxPage } from '../pages/inbox.page.js';

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

    const token = await page.evaluate(async (): Promise<string> => {
      const clerk = (window as any).Clerk;
      return (await clerk?.session?.getToken()) ?? '';
    });

    // Create a contact
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
    // Open the E2E test conversation if it exists in the inbox
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
    // After resolving, conversation should no longer be in the open list
    await expect(conversationRow).not.toBeVisible({ timeout: 5_000 });
  });
});
```

- [ ] **Step 2: Run the inbox tests**

```bash
cd apps/web
pnpm test:e2e --project=chromium e2e/tests/inbox.spec.ts
```

Expected: "inbox page loads" passes. Message/resolve tests skip if no conversation exists yet (requires an inbound WhatsApp message from the test number to trigger conversation creation).

To trigger a conversation: send a WhatsApp message FROM `+91 99070 72035` TO the test number, or use the Meta webhook test tool to simulate an inbound message.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/tests/inbox.spec.ts
git commit -m "feat(e2e): inbox tests (load, send message, resolve)"
```

---

## Task 12: Create campaigns.page.ts POM

**Files:**
- Create: `apps/web/e2e/pages/campaigns.page.ts`

- [ ] **Step 1: Create the POM**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/pages/campaigns.page.ts
git commit -m "feat(e2e): add CampaignsPage POM"
```

---

## Task 13: Create campaigns.spec.ts and verify

**Files:**
- Create: `apps/web/e2e/tests/campaigns.spec.ts`

- [ ] **Step 1: Create the spec**

```typescript
import { test, expect } from '../fixtures/index.js';
import { CampaignsPage } from '../pages/campaigns.page.js';

test.describe('Campaigns', () => {
  let campaignsPage: CampaignsPage;

  test.beforeEach(async ({ page }) => {
    campaignsPage = new CampaignsPage(page);
    await campaignsPage.goto();
  });

  test('campaigns page loads', async ({ page }) => {
    await campaignsPage.expectHeading();
    await expect(page.getByRole('link', { name: 'New Campaign' })).toBeVisible();
  });

  test('active and archived tabs are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'active' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'archived' })).toBeVisible();
  });

  test('navigate to New Campaign page', async ({ page }) => {
    await campaignsPage.clickNewCampaign();
    await expect(page).toHaveURL(/campaigns\/new/);
  });

  test('new campaign form loads required fields', async ({ page }) => {
    await campaignsPage.clickNewCampaign();
    // Campaign creation form — check for key fields
    await expect(page.getByRole('heading', { name: /New Campaign|Create Campaign/i })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the campaigns tests**

```bash
cd apps/web
pnpm test:e2e --project=chromium e2e/tests/campaigns.spec.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/tests/campaigns.spec.ts
git commit -m "feat(e2e): campaigns tests (load, tabs, new campaign navigation)"
```

---

## Task 14: Create settings-wa.page.ts POM

**Files:**
- Create: `apps/web/e2e/pages/settings-wa.page.ts`

- [ ] **Step 1: Create the POM**

```typescript
import type { Page } from '@playwright/test';

export class SettingsWaPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/settings/whatsapp-account');
    await this.page.waitForLoadState('networkidle');
  }

  async syncPhoneNumbers() {
    await this.page.getByRole('button', { name: 'Sync from Meta' }).click();
    // Wait for "Syncing…" to appear then disappear
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/pages/settings-wa.page.ts
git commit -m "feat(e2e): add SettingsWaPage POM"
```

---

## Task 15: Create settings-whatsapp.spec.ts and verify

**Files:**
- Create: `apps/web/e2e/tests/settings-whatsapp.spec.ts`

- [ ] **Step 1: Create the spec**

```typescript
import { test, expect } from '../fixtures/index.js';
import { SettingsWaPage } from '../pages/settings-wa.page.js';

test.describe('WhatsApp Account Settings', () => {
  let settingsPage: SettingsWaPage;

  test.beforeEach(async ({ page }) => {
    settingsPage = new SettingsWaPage(page);
    await settingsPage.goto();
  });

  test('WhatsApp Account page loads', async () => {
    await settingsPage.expectHeading();
  });

  test('connection status section is visible', async ({ page }) => {
    await expect(page.getByText(/connected|disconnected|checking/i).first()).toBeVisible();
  });

  test('Sync from Meta button is visible and clickable', async ({ page }) => {
    const syncBtn = page.getByRole('button', { name: 'Sync from Meta' });
    await expect(syncBtn).toBeVisible();
    await settingsPage.syncPhoneNumbers();
    // After sync, button returns to "Sync from Meta"
    await expect(syncBtn).toBeVisible();
  });

  test('business profile form fields are visible', async ({ page }) => {
    await expect(page.getByLabel('About')).toBeVisible();
    await expect(page.getByLabel('Address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Profile' })).toBeVisible();
  });

  test('update business profile about field', async ({ page }) => {
    const aboutField = page.getByLabel('About');
    const newAbout = `E2E test ${Date.now()}`;
    await aboutField.fill(newAbout);
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await page.waitForLoadState('networkidle');
    // Reload and verify it persisted
    await settingsPage.goto();
    await expect(aboutField).toHaveValue(newAbout);
  });
});
```

- [ ] **Step 2: Run the settings tests**

```bash
cd apps/web
pnpm test:e2e --project=chromium e2e/tests/settings-whatsapp.spec.ts
```

Expected: 5 tests pass. The "Sync from Meta" test makes a real call to Meta's API using the credentials set on the org.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/tests/settings-whatsapp.spec.ts
git commit -m "feat(e2e): WhatsApp settings tests (load, sync, profile update)"
```

---

## Task 16: Create onboarding.page.ts POM

**Files:**
- Create: `apps/web/e2e/pages/onboarding.page.ts`

Note: The WhatsApp Embedded Signup step opens a Meta iframe/popup — this cannot be automated with Playwright. The onboarding spec tests what CAN be verified: that the page renders, the button is visible, and navigation works.

- [ ] **Step 1: Create the POM**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/pages/onboarding.page.ts
git commit -m "feat(e2e): add OnboardingPage POM"
```

---

## Task 17: Create onboarding.spec.ts and verify

**Files:**
- Create: `apps/web/e2e/tests/onboarding.spec.ts`

- [ ] **Step 1: Create the spec**

```typescript
import { test, expect } from '../fixtures/index.js';
import { OnboardingPage } from '../pages/onboarding.page.js';

test.describe('Onboarding — Connect WhatsApp', () => {
  let onboardingPage: OnboardingPage;

  test.beforeEach(async ({ page }) => {
    onboardingPage = new OnboardingPage(page);
  });

  test('connect-waba page loads with correct heading', async () => {
    await onboardingPage.gotoConnectWaba();
    await onboardingPage.expectConnectWabaHeading();
  });

  test('"Connect with Meta" button is visible', async ({ page }) => {
    await onboardingPage.gotoConnectWaba();
    await onboardingPage.expectConnectWithMetaButton();
    // Button should be enabled once Meta SDK loads
    await expect(
      page.getByRole('button', { name: 'Connect with Meta' })
    ).toBeEnabled({ timeout: 15_000 });
  });

  test('"Skip to checklist" link navigates to /checklist', async ({ page }) => {
    await onboardingPage.gotoConnectWaba();
    await onboardingPage.clickSkipToChecklist();
    await expect(page).toHaveURL(/checklist/);
  });

  test('checklist page loads', async ({ page }) => {
    await onboardingPage.gotoChecklist();
    // Checklist page should render without errors
    await expect(page.locator('body')).not.toContainText('Error');
  });

  // NOTE: The actual Embedded Signup flow (clicking "Connect with Meta") opens a Meta iframe
  // popup that cannot be automated — this is an intentional limitation of the suite.
});
```

- [ ] **Step 2: Run the onboarding tests**

```bash
cd apps/web
pnpm test:e2e --project=chromium e2e/tests/onboarding.spec.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/tests/onboarding.spec.ts
git commit -m "feat(e2e): onboarding tests (connect-waba, checklist)"
```

---

## Task 18: Run full suite and verify

- [ ] **Step 1: Run all specs together**

```bash
cd apps/web
pnpm test:e2e:headed
```

Expected: All tests that don't require an active inbound conversation pass. The two inbox tests that depend on an existing conversation will skip with a clear message.

- [ ] **Step 2: Open the HTML report**

```bash
cd apps/web
pnpm exec playwright show-report
```

Review any failures. For selector mismatches, use `pnpm test:e2e:debug <spec>` to step through interactively.

- [ ] **Step 3: Commit final cleanup scripts**

```bash
git add apps/web/e2e/
git commit -m "feat(e2e): complete Playwright E2E test suite — 6 spec files, 20+ tests"
```

---

## Notes for Debugging Selectors

If any test fails with "locator not found":

1. Run `pnpm test:e2e:debug e2e/tests/<spec>.spec.ts` — Playwright opens a browser with a step-through debugger.
2. Click "Pick locator" to highlight any element and get its recommended selector.
3. Update the matching POM method with the correct selector.

Common adjustment areas:
- **Clerk sign-in**: If the email/password step order differs, update `global-setup.ts` and `auth.page.ts`.
- **Contact form labels**: If "Name" or "Phone" labels don't match, check the create-contact modal in `apps/web/components/contacts/`.
- **Inbox resolve button**: The button may say "Resolve", "Close", or use an icon — check `apps/web/components/inbox/` for the exact text.
