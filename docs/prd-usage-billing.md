# PRD: Capped Pay-Per-Message Billing + Billing Security Fixes

Status: DRAFT for owner review (no code written)
Date: 2026-10-10
Author role: billing architect / backend engineer
Related: `docs/auth-and-permissions.md`, memory notes on RBAC and prod-DB handling

## 1. Problem and evidence

Billing today is broken, insecure and disconnected from what customers actually value (messages).

| # | Finding | Evidence |
|---|---------|----------|
| P1 | `/settings/billing` crashes: client reads `usage.usage.contacts` / `usage.limits`, API returns `{plan, unavailableFeatures, gates}` | `BillingClient.tsx:122-123`, `billing.ts:222-236` |
| P2 | Upgrade link `/settings/billing/checkout` has no page (404 confirmed live) | `BillingClient.tsx:163` |
| P3 | Manual-subscription approve is not org-scoped and only checks `role === "admin"`; `submit-proof` is open to any user and records `charges: 0` | `billing.ts:556-564`, `billing.ts:496-541` |
| P4 | Razorpay/YooMoney take `amount` and `planId` from the client; webhook then sets `planTier` from those notes | `billing.ts:284-299`, `billing.ts:325-333`, `billing.ts:404-441` |
| P5 | Webhook verification is weak: Razorpay skips check when header absent; Razorpay/Paystack hash re-serialized JSON; YooMoney has none | `billing.ts:316`, `364`, `477-493` |
| P6 | Stripe webhook handles only `checkout.session.completed`; no `Transaction` row, no event-id idempotency, no failed-payment / cancel / downgrade handling | `billing-webhook.ts:38-59` |
| P7 | `setup-webhook` registers `/v1/billing/stripe/webhook`, real route is `/v1/billing/webhook` | `billing.ts:584`, `billing-webhook.ts:17`, `index.ts:85` |
| P8 | Missing `settings_billing` RBAC on `/billing/checkout`, `/billing/manual/submit-proof`, `/billing/manual/cancel-request`; caller-supplied `successUrl`/`cancelUrl` (open redirect) | `billing.ts:240-260`, `546-553` |
| P9 | Plan tier and enforced limits are disconnected: limits come from per-org `VendorSetting plan_limit_*` (default unlimited); `PLAN_LIMITS` is display only; messages are never metered | `plan-limits.ts:61-69`, `stripe.ts:20` |
| P10 | Plans hard-coded in code | `billing.ts:48-57` |
| P11 | Legacy brand "TrustCRM" in UPI QR / YooMoney text | `billing.ts:434`, `609-610` |

Business context (owner, 2026-10-10): every customer is billed by Meta directly for WhatsApp messages; messages are the core value of the product; customers will not accept "platform fee + markup", and will not accept a flat plan they feel they waste when they send little.

## 2. Goals and non-goals

Goals
1. Close the security holes (P3-P8) and fix the page (P1, P2).
2. Replace flat tiers with **capped pay-per-message**: bill = `min(billable_messages_cost, plan_cap)` with a monthly free allowance, volume-tiered rates, no markup on Meta.
3. Let a super admin configure all pricing from a new `/admin` Billing section, safely.
4. One payment-activation pipeline for all gateways.

Non-goals
- No wallet or markup on Meta's charges (Meta bills customers directly).
- No change to Meta/WABA connection flow.
- No tax/invoice engine in this PRD (later phase).
- No gateway removal in this PRD (hide PhonePe/YooKassa from default checkout only after prod usage is known).

## 3. Pricing model

- **Billable message**: outbound template, broadcast/campaign and automation send, delivered through WBMSG. Agent manual replies and all inbound are free (owner default; configurable).
- **Free allowance**: N billable messages per org per calendar month.
- **Rate tiers**: price per message by cumulative monthly volume band, per currency.
- **Cap**: each plan (Starter / Growth / Scale / Enterprise) has a monthly cap in each currency. Bill = `min(tiered_cost, cap)`. Plans still carry feature limits (seats, contacts, automations, API, AI) but **no message allowance**.
- Billed monthly in arrears. Meta's charges are never part of our invoice.
- Illustrative numbers only (not decided): 1,000 free; $0.003 for next 10,000; $0.002 after; cap $49.

## 4. Architecture fit

Layers touched: `apps/api` (billing routes, new billing lib, metering, admin routes), `apps/web` (customer billing page, `/admin` Billing section), Prisma schema, hand-authored migration.

Reuse: `/admin` area + `superAdmin` gating (`admin.ts:14`), admin audit log, `Transaction` and `ManualSubscription` models, `canAccessSub(..., "settings_billing")`, Stripe lib.

### 4.1 Data model (new / changed)
- `BillingPlan` (tier, name, feature limits JSON, active) and `BillingPlanPrice` (planId, currency, monthlyCap, freeMessages, effectiveFrom, supersededAt).
- `BillingRateTier` (priceId, fromMessage, toMessage nullable, ratePerMessage).
- `OrgBillingOverride` (organizationId, optional rate/cap/free allowance, reason, createdBy).
- `UsagePeriod` (organizationId, periodStart, billableMessages, computedAmount, currency, status) built from message data; exact source table/fields = **Unknown, verify before implementation** (see section 9).
- `WebhookEvent` (gateway, eventId UNIQUE, processedAt) for idempotency.
- Entitlement derivation: one function maps a plan to the existing `plan_limit_*` / `plan_feature_*` VendorSetting rows, so current enforcement keeps working (P9).
- Migration: hand-authored SQL (local DB drifted; `prisma migrate dev` fails). Out-of-band DDL on prod must be followed by `prisma migrate resolve --applied`. Backfill: seed plans from the current hard-coded values; existing orgs keep their current `plan_limit_*` rows (grandfathered 90 days, owner decision pending).

### 4.2 API
- New `lib/billing/` modules: `pricing` (compute bill), `metering` (count billable messages), `activation` (single pipeline: verify -> idempotency -> Transaction row -> plan + entitlements, all in one DB transaction), `gateways/*` (create payment with server-computed price, verify signed webhook on raw body).
- `GET /v1/billing/usage` keeps `gates` and adds `messages: {billable, freeAllowance, tieredCost, cap, projectedBill}`. Backward compatible: existing keys unchanged.
- Admin (superAdmin only): CRUD for plans/prices/tiers/overrides, bill preview ("what would org X have paid last month"), all audit-logged.

### 4.3 Web
- Customer `/settings/billing`: fix crash, show usage vs limits, month-to-date messages, projected bill, cap, plan comparison, working upgrade via existing `POST /billing/checkout`, cancel at period end.
- `/admin/billing`: plans and rates editor, per-org overrides on the org detail page, effective-date scheduling, rollback to previous version.

## 5. Security

- Org scoping: every query filtered by `organizationId` from `request.auth`; manual approve/reject must verify target org or be platform-only.
- RBAC: customer routes require `settings_billing`; admin routes require `superAdmin`.
- Price and plan are computed server-side; clients never send amount or tier-as-truth.
- Webhooks: verify signature on raw body, reject when header missing, idempotent on event id, no unauthenticated activation.
- Validate `successUrl` / `cancelUrl` against an allow-list of own origins.
- Admin changes: audit-logged (who, when, before/after); prices take effect only from a future date.
- Secrets: gateway credentials never logged or returned.

## 6. Rollout and rollback

Phase 0 (ship first, independent): security fixes P3-P8, page fix P1, upgrade flow P2, brand text P11. Rollback: revert PR; no schema change (`WebhookEvent` idempotency and Stripe `Transaction` rows moved to Phase 1). Added during execution: platform plan-payment webhooks (Razorpay, Paystack, YooMoney) verify only against platform env secrets, never tenant-writable VendorSetting credentials (tenants can write arbitrary keys via `vendor-settings`, so a tenant-set secret would let them forge a payment).
Phase 1: plans and entitlements as single source of truth; unified activation pipeline; Stripe lifecycle events; webhook URL fix. Flag: `BILLING_V2_ENABLED` (off by default).
Phase 2: metering + capped pricing + customer projected-bill UI, in **shadow mode** first (compute and display, do not charge) for one full month, compare against flat plans.
Phase 3: `/admin/billing` editor (can begin in parallel with Phase 2 on config side).
Phase 4: charge by usage; non-Stripe regions use prepaid never-expiring packs or monthly invoice + payment link (Razorpay/Paystack lack metered subscriptions).
Later: invoices/tax, dunning emails, auto-pause.

Production impact: read-only until Phase 4. Any prod data script dry-runs by default; `--apply` needs explicit confirmation.

## 7. Acceptance criteria

1. `/settings/billing` renders for admin and for any role holding `settings_billing`; never white-screens on missing/changed data.
2. A customer admin cannot approve any manual subscription, and cannot change plan without a verified payment of the server-computed amount.
3. Unsigned/forged webhooks for every gateway are rejected; replayed events do not double-activate.
4. A failed payment, cancellation or period end in Stripe changes the plan state via webhook.
5. Bill for a month equals `min(tiered_cost, cap)` for the test matrix in section 3 (quiet / small / growing / heavy).
6. Changing a rate in `/admin/billing` never alters the current month and is recorded in the audit log.
7. Every touched API route passes the org-scoping + RBAC audit.

## 8. Test plan

TDD per task. API (Vitest): pricing calculator table tests, metering counts, activation idempotency, webhook signature negative tests, RBAC 403 tests, org-isolation tests. Web (Vitest): billing page with old/new/empty usage shapes. Known flaky: 2 pre-existing API failures (segments/conversations) and Redis-rejection noise.

## 9. Risks, unknowns and open questions

Unknowns (not verified)
- Which table/fields record outbound messages and their type, and whether they suffice for metering.
- Real production gateway usage and tier distribution (needs approved read-only prod query).
- Resolved: `role === "admin"` is the ordinary customer org-admin role (`apps/api/src/lib/permissions.ts:20`), so P3 was exploitable by any customer org admin. Whether it was actually exploited is not verified.
- Exact Meta rates are irrelevant to our bill but needed for customer-facing explanations; use Meta's official page, not search snippets.

Owner decisions needed (recommended default)
1. Our cost per outbound message and the actual rates/caps [model from cost data before setting].
2. Agent replies free, billable = template/broadcast/automation [yes].
3. Free monthly allowance [1,000].
4. Grandfather existing customers for 90 days [yes].
5. Non-Stripe regions: prepaid never-expiring packs [yes].
6. Grace period after failed payment [7 days].
7. Manual subscription approval: platform owner only [yes].

Risks
- Metering accuracy directly drives revenue -> shadow month before charging.
- Migrating orgs with hand-set `plan_limit_*` rows -> dry-run script, no overwrite without confirmation.
- Gateway regions without metered billing -> prepaid packs add scope.
- Phase 0 and the new pipeline touch the same routes -> ship Phase 0 first, then refactor.
