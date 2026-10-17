# One-Registration Sign-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In own-auth (wbmsg) mode, sign-up becomes 2 screens (account, then business) and **one** registration: nothing is stored until the emailed code is verified, then the account, workspace and admin user are created together.

**Architecture:** `POST /v1/auth/signup` receives account + business fields, stores a *pending sign-up* in Redis (password already hashed, 30-min TTL) and emails a code. `POST /v1/auth/signup/verify` checks the code, then in one Prisma transaction creates `auth_accounts` (verified), the organization, the admin `users` row and default role settings (shared helper extracted from `/v1/register`), then issues a session. The web sign-up form shows two screens before posting.

**Tech Stack:** Fastify + Prisma + ioredis (API), Next.js 15 (web), Vitest, Playwright (local e2e).

**Spec (owner decision 2026-10-18):** "2 screens, 1 registration" — screen 1 name/email/password, screen 2 business details, then the 6-digit email code; nothing saved until verified; account + workspace created together. Parent spec: `docs/prd-own-auth.md`.

## Global Constraints

- Clerk mode (default) unchanged: `/register` and the business-details page keep working exactly as today.
- No user enumeration: `POST /v1/auth/signup` always replies `202 {"ok":true}` before any lookup or write (existing pattern in `signup.ts`).
- **First pending wins:** if a pending sign-up already exists for an email, a new submission does not overwrite it (no password swap); it only re-sends a code for the existing pending entry. Existing verified account → nothing sent.
- Pending entry: Redis key `auth:pending-signup:<normalizedEmail>`, TTL 1800 s, JSON `{ passwordHash, firstName, lastName, business }`; plaintext password never stored.
- Account + organization + users row + role-permission settings + lead-status seed: one `$transaction`; any failure → nothing created.
- Stage files by explicit path only; never commit `.env*`, `node_modules`, logs or build output. Before push: root `pnpm type-check`, `pnpm lint`, API + web suites.

## Review Focus

1. Concurrent verify of the same code (double click / two tabs): exactly one account + workspace, the other gets the standard 400 `INVALID_CODE`.
2. Email already registered (verified) by the time the code is verified (race with another path): no duplicate account; 400 `INVALID_CODE`; pending entry deleted.
3. Pending entry expired but the code still valid (TTL mismatch): 400 `INVALID_CODE` with message "Your sign-up expired. Please start again."
4. Business field validation is identical to `/v1/register` (same required fields, same lengths).
5. `REQUIRE_VENDOR_ACTIVATION=true` still creates the admin user inactive, as `/register` does.

---

### Task 1: Extract the workspace-creation helper (API refactor, no behavior change)

**Files:** Create `apps/api/src/lib/create-workspace.ts` (+ `create-workspace.test.ts`); modify `apps/api/src/routes/register.ts` to use it.

**Interfaces — Produces:** `createWorkspace(tx: Prisma.TransactionClient | PrismaClient, input: { userId: string; email: string; fullName: string; business: BusinessInput }): Promise<{ organizationId: string }>` and `type BusinessInput = { companyName: string; companyWebsite: string; companyLocation: string; industry: string; subCategory: string; revenue: string }` plus exported `BUSINESS_SCHEMA` (the JSON-schema properties `/register` validates today). It performs exactly what `register.ts` does on the first-time path: organization create (with `registeredAt` and `settings`), `seedLeadStatuses`, admin `users` row (inactive when `REQUIRE_VENDOR_ACTIVATION=true`), role-permission `vendorSetting.createMany` excluding `FIXED_PERMISSION_ROLES`.

- [ ] Step 1: Failing tests for `createWorkspace` (calls and data match today's `register.ts` first-time path; activation flag honored; fixed roles excluded). Make `seedLeadStatuses` accept a transaction client if its signature requires `PrismaClient`.
- [ ] Step 2: Run → FAIL. Step 3: implement, switch `register.ts` first-time branch to the helper. Step 4: `npx vitest run src/lib/create-workspace.test.ts src/routes/register.test.ts` → PASS (existing register tests unchanged).
- [ ] Step 5: Commit `refactor(api): shared workspace creation for register and sign-up`

### Task 2: Sign-up stores a pending registration; verify creates account + workspace together

**Files:** Modify `apps/api/src/auth/routes/signup.ts` (+ `signup.test.ts`); create `apps/api/src/auth/pending-signup.ts` (+ test).

**Interfaces — Produces:**
- `savePendingSignup(email, data): Promise<"created" | "exists">` (Redis `SET key value EX 1800 NX`), `loadPendingSignup(email)`, `deletePendingSignup(email)`.
- `POST /v1/auth/signup` body: `{ email, password, firstName, lastName, business: BusinessInput, turnstileToken? }` (business validated with `BUSINESS_SCHEMA`, all required as in `/register`). Reply 202 first; afterwards: verified account exists → nothing; else hash password, `savePendingSignup` (on `"exists"` keep the stored entry), `issueCode({ purpose: "email_verify", target: email })` (no accountId), send code email.
- `POST /v1/auth/signup/verify` `{ email, code, client }`: `verifyCode` (purpose `email_verify`) → load pending (missing → 400 `INVALID_CODE` "Your sign-up expired. Please start again.") → `$transaction`: create `auth_accounts` (`newAccountId()`, verified now, hash, names) + `createWorkspace(tx, …)`; P2002 → 400 `INVALID_CODE`; then delete pending, `createSession` + `trustDevice` → `200 { accessToken, refreshToken, expiresIn: 600, deviceId, organizationId }`.
- Remove the old "create unverified account at sign-up" path (own-auth has never run in production, so no legacy pending accounts exist).

- [ ] Step 1: Failing tests: no DB write at sign-up (only Redis + code); second sign-up for the same email keeps the first pending entry; verified-existing email → no code; verify success creates account + org + users in one transaction and returns tokens + `organizationId`; Review Focus 1–3 and 5; weak password still 400 before 202; Turnstile still checked before 202.
- [ ] Step 2: Run → FAIL. Step 3: implement. Step 4: `npx vitest run src/auth` → PASS.
- [ ] Step 5: Commit `feat(auth): one registration — account and workspace created together after email verification`

### Task 3: Web — two-screen sign-up

**Files:** Create `apps/web/components/auth/BusinessFields.tsx` (extracted from `app/(setup)/business-details/page.tsx`: company name, website, location, industry → category, revenue, terms checkbox, with the same validation messages) and `apps/web/lib/auth/signup-steps.ts` (+ test: pure validation for screen 1 and screen 2); modify `apps/web/components/auth/SignUpForm.tsx` and `app/(setup)/business-details/page.tsx` (use the shared component; Clerk-mode behavior unchanged).

Flow: Screen 1 (first name, last name, email, password) → "Continue" (validates screen 1) → Screen 2 (business fields, "Back" keeps entered values) → "Create account" posts BFF `sign-up` with `business` → code step ("Check your email") → BFF `sign-up/verify` → `window.location.assign("/dashboard")`. Errors from the API shown inline; "Your sign-up expired" offers "Start again" (back to screen 1, fields kept).

- [ ] Step 1: Failing tests for `signup-steps.ts`. Step 2: FAIL. Step 3: implement components. Step 4: web full vitest + `pnpm type-check` + `pnpm lint` → pass.
- [ ] Step 5: Commit `feat(web-auth): two-screen sign-up with a single registration`

### Task 4: End-to-end (controller, local)

- [ ] Update the local (git-ignored) fixture `apps/web/e2e/fixtures/auth-wbmsg.ts` `signUp` + `completeBusinessDetails` into one `signUp` flow ending on `/dashboard`.
- [ ] Run the runbook stack (throwaway containers, production web build, ports 4100/3100) and `npx playwright test e2e/tests/auth-wbmsg.spec.ts --headed --workers=1` → 3/3 pass.
- [ ] Final review of the branch, then push after owner approval.
