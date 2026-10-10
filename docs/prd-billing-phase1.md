# PRD: Billing Phase 1 - Entitlements, One Activation Pipeline, Stripe Lifecycle

Status: DRAFT for owner review (no code written)
Date: 2026-10-10
Parent: `docs/prd-usage-billing.md` (Phase 1 of 4). Phase 0 (security + page) is merged to `main` (029c390).
Author role: backend / billing engineer

## 1. Problem and evidence

| # | Finding | Evidence |
|---|---------|----------|
| E1 | **Nothing sets plan limits.** Limits are read from per-org `VendorSetting plan_limit_*` / `plan_feature_*`, default unlimited / off. The only writer-facing code (`vendor-settings.ts`) *blocks* tenants from setting them; no code anywhere sets them from `planTier`. Changing a customer's plan changes nothing they can do. | `lib/plan-limits.ts:61-69`, `routes/vendor-settings.ts:15,105`, grep of `plan_limit_`/`plan_feature_` writers (none) |
| E2 | `PLAN_LIMITS` (contacts/messages per tier) is display-only. Only contacts has a defined per-tier value; campaigns, chatbots, flows, custom fields, team members, AI bot and API access have **no per-tier values anywhere**. | `lib/stripe.ts:20-25`, `lib/plan-limits.ts:3-9` |
| E3 | `Organization.planTier` is written in 8+ places with different side effects (webhooks, approve, switch-plan, cancel-now, admin PATCH). The admin "create manual subscription" route creates an *active* `ManualSubscription` but never updates `Organization.planTier`. | `routes/billing.ts:44,151,186`, `billing-gateway-webhooks.ts:79,124`, `routes/admin.ts:127-146,215` |
| E4 | **No `Transaction` row is ever created** by any code path, so the customer's transaction history is always empty, and there is no idempotency record for webhooks. | grep `transaction.create|upsert|update` in `src` = none |
| E5 | Stripe webhook handles only `checkout.session.completed` and does not check `payment_status`. Failed payments, cancellations, plan changes made in the Stripe portal, and period ends never reach the app. | `routes/billing-webhook.ts:38-59` |
| E6 | `switch-plan` sets `planTier` right after the Stripe update call, before any invoice is paid. | `routes/billing.ts:177-188` |
| E7 | The org has no billing-state fields (past due, grace period end, cancel-at-period-end). The Stripe customer id lives in `Organization.settings` JSON (`stripeCustomerId`); a real `stripeId` column exists but is unused. | `prisma/schema.prisma` Organization (`stripeId`, `trialEndsAt`), `billing-webhook.ts:55` |
| E8 | `trialEndsAt` exists on Organization and ManualSubscription but no code reads it. | grep `trialEndsAt` in `src` (selects only) |
| E9 | Public-API and outbound-webhook features are gated by `plan_feature_api_access`; with no row the feature is off. Unknown how many prod orgs have hand-set rows. | `lib/webhook-dispatch.ts:11`, `lib/plan-limits.ts:42-52` |

## 2. Goals and non-goals

Goals
1. One tested definition of what each tier includes, and one function that turns an org's tier into its effective limits/features (with platform per-org overrides still winning).
2. One activation function used by every payment path, idempotent, always writing a `Transaction` row.
3. Stripe lifecycle: paid-only activation, failed-payment handling with a grace period, cancellation and plan changes from the Stripe portal, scheduled downgrade after grace.
4. Ship safely: no surprise restrictions for existing customers.

Non-goals (later phases): usage metering and pricing (Phase 2), `/admin/billing` editor (Phase 3), invoices/tax, auto top-up, per-message `source` field.

## 3. Design

### 3.1 Plan definitions (code, not DB, in Phase 1)
`apps/api/src/lib/billing/plans.ts` exports `PLAN_DEFINITIONS: Record<BillableTier | "enterprise", { limits: {contacts,campaigns,chatbots,flows,custom_fields,team_members: number | null}, features: {ai_chat_bot, api_access: boolean} }>` (`null` = unlimited), plus `getEntitlements(prisma, organizationId)`.
Precedence: **per-org platform override (`VendorSetting plan_limit_*`/`plan_feature_*` if a row exists) > tier definition > (if flag off) today's behavior**. `checkPlanLimit` and `isFeatureEnabled` call it; their signatures and `GET /billing/usage` response shape do not change (dashboard consumes it).
Phase 3 can move the definitions into DB tables behind the same function.

### 3.2 Rollout safety for entitlements
- Flag `BILLING_V2_ENABLED` (env, default off): off = exactly today's behavior.
- Even with the flag on, tier limits apply in **shadow mode first**: when an org would be blocked, log `entitlement_shadow_block` (org, entity, current, limit) and allow. A second flag `BILLING_ENTITLEMENTS_ENFORCE=1` turns on real blocking. This answers E9 and avoids locking out existing customers.
- Orgs that already have `plan_limit_*` rows keep them (override wins). Optional grandfather list = orgs with a row are never changed by this phase.

### 3.3 One activation pipeline
`lib/billing/activation.ts`: `activatePlan(prisma, input)` where input = `{ organizationId, planTier, source: "stripe"|"razorpay"|"paystack"|"yoomoney"|"manual_approval"|"admin", gateway, gatewayTransactionId?, referenceId, amountMinor?, currency?, stripeSubscriptionId?, manualSubscriptionId? }`.
In ONE DB transaction: (1) insert `Transaction` (unique `gatewayTransactionId` / `referenceId` = idempotency; unique violation => return `{ duplicate: true }` and do nothing else), (2) update `Organization.planTier` and clear billing-state (`billingStatus = active`, `graceEndsAt = null`), (3) when `manualSubscriptionId` given, activate it and cancel previous active ones (existing `activateManualSubscription` logic moves here).
Callers: Razorpay, Paystack, YooMoney webhooks (after their existing verification), Stripe webhook, `POST /billing/manual/:id/approve`, `POST /admin/subscriptions` (fixes E3).
`switch-plan` stops writing `planTier` directly; the change takes effect when the Stripe `customer.subscription.updated`/`invoice.payment_succeeded` event arrives (fixes E6). The UI shows "plan change pending".

### 3.4 Stripe lifecycle (webhook `/v1/billing/webhook`, signature already verified with env secret)
| Event | Action |
|-------|--------|
| `checkout.session.completed` | activate only if `payment_status === "paid"` (else wait for the invoice event); store `stripeId` |
| `invoice.payment_succeeded` | `activatePlan` (tier from subscription price id), Transaction row (id = invoice id) |
| `invoice.payment_failed` | set `billingStatus = past_due`, `graceEndsAt = now + GRACE_DAYS`; email the org admins (existing mail path, Railway -> Vercel -> SMTP) |
| `customer.subscription.updated` | map price id -> tier; record `cancelAtPeriodEnd`; plan change applies via the paid invoice |
| `customer.subscription.deleted` | downgrade to `starter`, `billingStatus = cancelled` |
Org lookup by Stripe customer id uses the existing `Organization.stripeId` column (new index; backfilled from `settings.stripeCustomerId`).
Unknown event types: return 200 and ignore. Events for unknown customers: log and return 200.

### 3.5 Scheduled grace expiry
Daily BullMQ job (pattern of existing workers): orgs with `billingStatus = past_due AND graceEndsAt < now` -> downgrade to `starter`, `billingStatus = cancelled`, audit log entry. Dry-run mode logs only until `BILLING_V2_ENABLED`.

## 4. Data model / migration (hand-authored SQL; local DB is drifted so `prisma migrate dev` fails)
`organizations`: add `billing_status text not null default 'active'`, `billing_grace_ends_at timestamptz null`, `plan_cancel_at_period_end boolean not null default false`; index on `stripe_id`; index on `(billing_status, billing_grace_ends_at)`.
Backfill (separate dry-run-by-default script, `--apply` only after owner confirmation): `stripe_id` from `settings->>'stripeCustomerId'`.
No change to `transactions` (existing unique columns serve as the idempotency key).
Rollback: all additive columns, nullable/defaulted; flags off restores today's behavior. After any out-of-band DDL on prod run `prisma migrate resolve --applied <name>`.

## 5. Security
- Every Stripe event handler resolves the org only from the signed event (customer id -> `stripeId`), never from request input.
- `activatePlan` is the only code allowed to change `planTier` for payments; a lint-style test greps for other `planTier` writes (admin PATCH stays, audited).
- Idempotency prevents replayed webhooks from re-activating a cancelled plan: an older event for a Transaction that already exists is a no-op; ordering vs. cancellation is handled by recording `billingStatus` transitions from the event's own subscription status, not from arrival order.
- No secrets in logs; shadow-block logs contain org id and counts only.
- RBAC unchanged (`settings_billing` customer routes, `superAdmin` platform routes).

## 6. Acceptance criteria
1. Same Stripe/Razorpay/Paystack/YooMoney event delivered twice => one Transaction row, one plan change.
2. Every successful payment path writes a Transaction row; `GET /billing/transactions` shows it.
3. `invoice.payment_failed` => org past_due with grace end; after grace the daily job downgrades to starter; a later successful payment restores the plan.
4. `customer.subscription.deleted` downgrades; a Stripe-portal plan change updates the tier after payment.
5. With flags off, `checkPlanLimit`/`isFeatureEnabled` return exactly what they return today (existing tests unchanged). With shadow on, no request is blocked but a log line is emitted; with enforce on, an org over its tier limit is blocked with the existing error shape.
6. Admin-created manual subscription changes `Organization.planTier`.
7. `switch-plan` no longer changes `planTier` directly.
8. Every touched route passes the org-scoping + RBAC audit.

## 7. Test plan
TDD per task. API (Vitest): entitlement precedence table tests; activation idempotency and rollback on failure; each Stripe event with a signed fixture; grace job with a fake clock; admin manual create updates tier; replay and out-of-order event tests; flags-off regression. Known flaky: 2 pre-existing API failures (`segments.test.ts`) and Redis-rejection noise.

## 8. Risks, unknowns, open questions
Unknowns (not verified)
- Which prod orgs already have `plan_limit_*` / `plan_feature_*` rows, and how many orgs per tier (needs the approved read-only prod query; no prod access used so far).
- Whether Stripe prod has subscriptions whose customer id is missing from `settings` (backfill dry-run will show).
- Which Stripe events the prod webhook endpoint is currently subscribed to (checkout dashboard).
- Mail template path for payment-failure emails (exists for other mail; subject/body to write).

Owner decisions needed (recommended default)
1. **Limits and features per tier** (contacts 500/5,000/50,000 exist; the rest do not). Recommended starting table, to be edited by you: campaigns 5/50/unlimited, chatbots 1/5/unlimited, flows 3/20/unlimited, custom fields 5/25/unlimited, team members 2/5/20, AI bot off/on/on, API access off/on/on; enterprise unlimited and on. Treat these as placeholders until you set them.
2. Enforce limits on existing customers? [No: shadow mode for 30 days, then enforce only for orgs created after the cutover; existing orgs grandfathered]
3. Grace period after a failed payment [7 days]
4. Email on payment failure [yes, to org admins]
5. Approve the read-only prod query (per-tier org counts, existing `plan_*` rows; exclude own orgs) [yes]
6. Enterprise: keep manual, unlimited [yes]

Risks
- Turning on limits can lock customers out -> shadow mode, flags, grandfathering.
- Stripe event ordering/duplication -> Transaction-row idempotency + status-derived transitions.
- Refactor touches live webhooks -> keep Phase 0 tests, add regression tests per gateway before moving code.

## 9. Phase 1A deploy checklist

1. Deploy. Railway `start.sh` runs `prisma migrate deploy` before the app. The new code selects and writes `billingStatus` even with the flag off, so the migration must land before the code; `start.sh` enforces this. If DDL is ever applied out of band, run `prisma migrate resolve --applied 20261010100000_billing_lifecycle`.
2. Run `scripts/backfill-stripe-id.ts` as a dry run, review the conflicts, and eyeball any org where `stripeId` and `settings.stripeCustomerId` differ. After the owner confirms, run it with `--apply`. This is a HARD GATE before `BILLING_V2_ENABLED=true`: orgs whose Stripe customer id exists only in settings are otherwise unresolved by webhooks.
3. Subscribe the Stripe webhook endpoint to `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated` and `customer.subscription.deleted`.
4. Flag rollback hazard: with the flag off, successful Stripe payments from `past_due` orgs are ignored. Before turning the flag back on, reconcile or reset `past_due` orgs (set `billingStatus` to `active`), or the grace job will downgrade customers who paid in between.
5. Enable `BILLING_V2_ENABLED=true` only after steps 1 to 3 are done.

## 10. Known follow-ups

- Switch-plan upgrades whose proration invoice fails end in a downgrade to starter after grace. Consider `payment_behavior: "pending_if_incomplete"` in Phase 2 (needs Stripe-side verification).
- The grace job could re-check the live Stripe subscription status before downgrading.
- Manual submit-proof records charges as 0, so the ledger shows 0 for approved manual subscriptions.
- Currency for manual/admin rows defaults to INR, and zero-decimal Stripe currencies display 100x too small.
- `gatewayTransactionId` is not namespaced across gateways.
- Manual-subscription update is not org-scoped or status-guarded.
- Add a lint-style test (PRD section 5) for other `planTier` writes.
- `PATCH /organizations/me` returns the full org row including `wabaAccessToken` and `stripeId` (separate security ticket).
- With the flag off, Stripe payments write no Transaction row (legacy path, by design).
- A legacy customer deleted in Stripe now returns 500 at checkout.
