# Account Details page rework (display-only)

Spec and plan in one file (small, frontend-only, no API or DB change; user to agree to this shortcut).

## Problem (evidence)
- `apps/web/app/(dashboard)/settings/account-details/page.tsx` shows "Subscription Type / Start / End" from `planTier` and `trialEndsAt`. Start is hardcoded "—" (line 86). Billing is now usage-based (`docs/billing-decisions.md`), so these rows are stale or empty.
- Onboarding data (`phone`, `website`, `location`, `industry`, `facebookPageId`, `instagramAccountId`) is returned by `GET /v1/organizations/me` (`ORG_PUBLIC_SELECT`, organizations.ts) but never shown.
- IDs have no copy button; empty values show a bare "—"; fixed `w-64` label column and `div` rows are poor on mobile and for screen readers.

## Goals
1. Replace subscription rows with a **Billing** card (admin/billing-permission only): current cycle dates, reset date, usage vs free allowance, link to `/settings/billing`.
2. **Business profile** card (read-only) from existing org fields.
3. **WhatsApp connection** card: IDs with copy buttons, Connected / Not connected badge, link to `/settings/whatsapp-account`.
4. Header with name + status badge. `<dl>` rows, stacked on mobile, error state with retry.

## Non-goals
Editing the profile (needs API extension, separate PRD), exposing `billingStatus`, any API/DB/migration change.

## Architecture fit
- Reuse `canViewBilling` (`lib/billing-page.ts`), `normalizeMessageUsage`, `periodLabel`, `resetLabel`, `formatCount` (`lib/message-usage.ts`). Same server-side fetch pattern as `settings/billing/page.tsx`.
- Billing data comes from `GET /v1/billing/message-usage`, already gated by `settings_access@settings_billing` and scoped by `request.auth.organizationId` (billing-message-usage.ts:12-33). The page fetches it only when `canViewBilling(user)` is true; otherwise the card is not rendered and the call is not made.
- Billing cycle is derived from `org.createdAt` (billing-message-usage.ts:32), not `registeredAt`.

## Security
- No new API route. No change to `ORG_PUBLIC_SELECT`; `wabaAccessToken` and `stripeId` stay excluded.
- Billing card hidden from users without billing permission (API 403 is the backstop).
- Copy buttons are client-side only; no data leaves the page.

## Tasks (TDD where logic exists)
1. `lib/account-details.ts` + `account-details.test.ts`: pure helpers: status badge mapping, "connected" detection (WABA id + phone number id), usage-bar percent (clamped 0-100, handles allowance 0), profile row list that drops empty fields.
2. `CopyButton.tsx` client component (clipboard with try/catch, "Copied" feedback, aria-label).
3. Rewrite `page.tsx`: fetch org, user, and (if allowed) message usage in parallel; render header + 4 cards; error card with retry link (reload).
4. Delete nothing else. Settings hub card unchanged.
5. Verify: `/test-web`, `/check`, security note, manual render check (empty org, connected org, non-billing role).

## Acceptance criteria
- Non-billing role sees no Billing card and no billing request is made.
- Billing role sees cycle dates, reset date, "N / 500 free" bar, link to billing; null usage degrades to link only.
- Empty IDs show "Not connected" with a link, not "—".
- Layout has no horizontal scroll at 360px.

## Risks / open questions
- Free allowance value comes from `plan.freeAllowance` (500 currently); if plan is null show no bar.
- Whether `org.status` has values beyond `active` (not verified in this scan): badge falls back to a neutral label for unknown values.
