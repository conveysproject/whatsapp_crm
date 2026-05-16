# Playwright E2E Test Suite — Design Spec

**Date:** 2026-05-16  
**Status:** Approved  
**Scope:** Full end-to-end test suite for TrustCRM web app (`apps/web`)

---

## 1. Goals

- Validate all critical user journeys in a real browser against real local services
- Use real Clerk authentication (no mocking)
- Use real Meta WhatsApp test credentials for message-sending tests
- Run locally in headed mode (developer watches test execution)
- Provide a foundation for future CI integration

---

## 2. Directory Structure

```
apps/web/
  playwright.config.ts          # Playwright configuration
  e2e/
    global-setup.ts             # Signs in once, saves Clerk session to .auth/
    fixtures/
      index.ts                  # Re-exports all fixtures
      auth.ts                   # Authenticated page fixture with session state
    pages/                      # Page Object Models
      auth.page.ts              # Sign-in / sign-up page
      onboarding.page.ts        # Onboarding wizard steps
      inbox.page.ts             # Inbox view + conversation actions
      contacts.page.ts          # Contacts list + contact detail
      campaigns.page.ts         # Campaign creation + launch
      settings-wa.page.ts       # WhatsApp Account settings
    tests/
      auth.spec.ts              # Authentication flows
      onboarding.spec.ts        # WhatsApp onboarding journey
      inbox.spec.ts             # Inbox + messaging
      contacts.spec.ts          # Contact management
      campaigns.spec.ts         # Template + campaign lifecycle
      settings-whatsapp.spec.ts # WhatsApp account settings
    .auth/
      user.json                 # Saved Clerk session state (gitignored)
  .env.test                     # Test credentials (gitignored)
```

---

## 3. Configuration (`playwright.config.ts`)

| Setting | Value |
|---|---|
| `baseURL` | `http://localhost:3000` |
| `globalSetup` | `./e2e/global-setup.ts` |
| `use.storageState` | `e2e/.auth/user.json` |
| Default browser | Chromium |
| Headed by default | Yes (developer watches) — override with `--headed=false` |
| `webServer[0]` | `pnpm --filter @WBMSG/web dev` on port 3000 (reuse if running) |
| `webServer[1]` | `pnpm --filter @WBMSG/api dev` on port 4000 (reuse if running) |
| Trace | On first retry |
| Screenshot | On failure |
| Video | On first retry |
| Test timeout | 30 000 ms |
| Expect timeout | 10 000 ms |

### Run Scripts (added to `apps/web/package.json`)

```json
"test:e2e":        "playwright test",
"test:e2e:headed": "playwright test --headed",
"test:e2e:ui":     "playwright test --ui",
"test:e2e:debug":  "playwright test --debug"
```

---

## 4. Authentication Strategy

`global-setup.ts` runs once before all tests:

1. Launch a Chromium browser
2. Navigate to `http://localhost:3000/sign-in`
3. Fill email from `process.env.E2E_TEST_EMAIL`
4. Fill password from `process.env.E2E_TEST_PASSWORD`
5. Submit and wait for redirect to `/dashboard`
6. Save storage state to `e2e/.auth/user.json`
7. Close browser

All spec files load this storage state via `playwright.config.ts → use.storageState`. No individual test performs a login. Session is reused until it expires (Clerk dev-mode sessions last ~1 day).

---

## 5. Page Object Model Pattern

Each POM class:
- Receives `page: Page` in constructor
- Exposes `goto()` method
- Exposes named action methods (e.g., `fillSignInForm()`, `submitMessage()`)
- Exposes assertion helpers (e.g., `expectConversationOpen()`)
- Never uses raw selectors in tests — all selectors are encapsulated in the POM

Example:
```typescript
class InboxPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/inbox'); }
  async openConversation(contactName: string) { ... }
  async replyWithText(text: string) { ... }
  async resolveConversation() { ... }
}
```

---

## 6. Test Data Strategy

**Setup:** Each spec's `beforeAll` creates test data via direct API calls to `http://localhost:4000/v1`, using the Bearer token extracted from the saved Clerk session storage state.

**Naming:** All test contacts use the prefix `[E2E]` (e.g., `[E2E] Test User`) so they are identifiable and can be bulk-cleaned if teardown fails.

**Teardown:** Each spec's `afterAll` deletes created contacts, conversations, and campaigns via the same API. Tests that fail mid-way leave `[E2E]` prefixed records that can be cleaned manually or by a `npm run test:e2e:cleanup` helper script.

---

## 7. Test Scenarios

### `auth.spec.ts`
- Unauthenticated visit to `/inbox` redirects to `/sign-in`
- Sign-in with valid credentials navigates to `/dashboard`
- Sign-out via user menu removes session and redirects to `/sign-in`

### `onboarding.spec.ts`
- New org setup wizard completes all steps
- WhatsApp Embedded Signup flow loads Meta iframe, completes connection
- Phone number appears in provisioning step after connection
- Onboarding checklist marks WhatsApp step as complete

### `inbox.spec.ts`
- Inbox loads and displays existing conversations
- Agent can open a conversation
- Agent types and sends a text reply (real WhatsApp send via test credentials)
- Sent message appears in conversation with delivery status
- Agent can resolve a conversation (status changes to closed)
- Agent can assign a conversation to another team member

### `contacts.spec.ts`
- Create a new contact with phone number
- Contact appears in contacts list with search
- Block contact via contact detail page
- Unblock contact
- Toggle bot on/off for a contact
- Add notes to a contact

### `campaigns.spec.ts`
- Create a new message template with body text
- Template appears in templates list with status `pending`
- Create a campaign targeting a contact segment
- Launch campaign — status changes to `sending`
- Campaign analytics page shows sent count

### `settings-whatsapp.spec.ts`
- WhatsApp Account settings page loads
- Health check shows connected status
- Sync phone numbers refreshes the phone number list
- Display name field can be updated and saved

---

## 8. Environment Variables (`.env.test`)

```
# Clerk test account
E2E_TEST_EMAIL=<test-only Clerk account email>
E2E_TEST_PASSWORD=<test-only Clerk account password>

# Meta WhatsApp test credentials (from Meta Developer sandbox)
E2E_WA_PHONE_NUMBER_ID=1084186771447470
E2E_WA_ACCESS_TOKEN=<meta test token — regenerate before long test runs>
E2E_WA_TEST_RECIPIENT=919907072035
```

`.env.test` is gitignored. A `.env.test.example` (with placeholder values) is committed.

---

## 9. File Additions & Changes

| File | Action |
|---|---|
| `apps/web/playwright.config.ts` | Create |
| `apps/web/e2e/global-setup.ts` | Create |
| `apps/web/e2e/fixtures/auth.ts` | Create |
| `apps/web/e2e/fixtures/index.ts` | Create |
| `apps/web/e2e/pages/auth.page.ts` | Create |
| `apps/web/e2e/pages/onboarding.page.ts` | Create |
| `apps/web/e2e/pages/inbox.page.ts` | Create |
| `apps/web/e2e/pages/contacts.page.ts` | Create |
| `apps/web/e2e/pages/campaigns.page.ts` | Create |
| `apps/web/e2e/pages/settings-wa.page.ts` | Create |
| `apps/web/e2e/tests/auth.spec.ts` | Create |
| `apps/web/e2e/tests/onboarding.spec.ts` | Create |
| `apps/web/e2e/tests/inbox.spec.ts` | Create |
| `apps/web/e2e/tests/contacts.spec.ts` | Create |
| `apps/web/e2e/tests/campaigns.spec.ts` | Create |
| `apps/web/e2e/tests/settings-whatsapp.spec.ts` | Create |
| `apps/web/e2e/.auth/user.json` | Runtime (gitignored) |
| `apps/web/.env.test` | Runtime (gitignored) |
| `apps/web/.env.test.example` | Create (committed) |
| `apps/web/.gitignore` | Update (add `.auth/`, `.env.test`) |
| `apps/web/package.json` | Update (add `@playwright/test` devDep + scripts) |

---

## 10. Dependencies

```json
"devDependencies": {
  "@playwright/test": "^1.44.0"
}
```

Install browsers: `pnpm exec playwright install chromium`

---

## 11. Out of Scope

- Mobile (Expo) app testing
- CI/GitHub Actions integration (can be added later)
- Performance testing
- Visual regression testing
- Testing against production/staging environments
