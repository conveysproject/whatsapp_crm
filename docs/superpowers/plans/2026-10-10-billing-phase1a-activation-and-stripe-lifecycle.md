# Billing Phase 1A (Activation Pipeline + Stripe Lifecycle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every payment path activate plans through one idempotent function that writes a `Transaction` row, and handle the Stripe lifecycle (paid invoices, failed payments with a grace period, cancellations) so plans follow what Stripe says.

**Architecture:** `activatePlan` (one DB transaction: insert `Transaction` first so its unique keys are the idempotency guard, then update the org) replaces the scattered `planTier` writes in the payment paths. Stripe events are resolved to an org through `Organization.stripeId`, which checkout now sets up front by creating the Stripe customer itself. Lifecycle behaviour is behind `BILLING_V2_ENABLED` (default off); a daily job downgrades orgs whose grace period ended.

**Tech Stack:** Fastify 4, Prisma/Postgres (hand-authored SQL migration), Stripe SDK (`2026-04-22.dahlia`), BullMQ, Vitest.

**Spec:** `docs/prd-billing-phase1.md` (sections 3.3, 3.4, 3.5, 4, 5, 6). Entitlements (spec 3.1, 3.2) are Plan 1B and independent of this plan.

## Global Constraints

- Branch `feat/billing-phase1` in worktree `E:\Product\WhatsApp_CRM-billing`. Never touch `E:\Product\WhatsApp_CRM` (other sessions' uncommitted work).
- Migration SQL is hand-authored; `prisma migrate dev` fails (local DB drifted). Additive only; never edit existing migrations. After any out-of-band DDL on prod run `prisma migrate resolve --applied <name>`.
- Production: no prod access in this plan; the backfill script dry-runs by default and `--apply` needs explicit owner confirmation. Never print or hardcode DB credentials (use `DATABASE_URL` from env only).
- `Transaction.amount` is stored in **minor units** (the billing page shows `amount / 100`).
- Phase 0 rules stay: platform plan-payment verification uses env secrets only; manual subscriptions are activated only by superAdmin approval; `GET /v1/billing/usage` shape unchanged; org scoping from `request.auth` or from verified/signed payloads only; customer routes need `settings_billing`.
- `BILLING_V2_ENABLED` (env, exactly `"true"` enables) gates: the new Stripe lifecycle cases, `switch-plan` pending behaviour, and the grace job. The activation pipeline and Transaction rows are NOT gated.
- Customer-facing text says WBMSG, never TrustCRM, never a competitor name.
- Known flaky: 2 pre-existing API failures (`segments.test.ts`) and Redis-rejection noise; any other failure is real.

## Review Focus

- Same webhook delivered twice (Razorpay, Paystack, YooMoney, Stripe invoice): exactly one Transaction row and one plan change; second delivery returns 200.
- Webhook for an unknown organization id: 200, no crash, no retry storm (Prisma `P2003` foreign key or `P2025`), while any other DB error still returns 500 so the gateway retries.
- Stripe events arriving out of order (invoice paid before `checkout.session.completed`): still resolves the org because checkout stores `stripeId` before payment.
- `invoice.payment_failed` delivered repeatedly: grace end date is set once, never extended.
- `customer.subscription.deleted` while another active subscription exists for the customer: no downgrade.
- Org paid after being `past_due`: status returns to `active`, grace cleared.
- Flag off: Stripe webhook and `switch-plan` behave exactly as after Phase 0.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/api/prisma/schema.prisma` (modify) | Org billing-state columns, `PaymentGateway` += `paystack`,`yoomoney` |
| `apps/api/prisma/migrations/20261010100000_billing_lifecycle/migration.sql` (new) | Hand-written DDL |
| `apps/api/src/lib/billing/flags.ts` (new) + test | `isBillingV2Enabled()`, `graceDays()` |
| `apps/api/src/lib/billing/activation.ts` (new) + test | `activatePlan` |
| `apps/api/src/lib/billing/stripe-customer.ts` (new) + test | `getStripeCustomerId`, `tierFromPriceId` |
| `apps/api/src/lib/billing/payment-failed-email.ts` (new) + test | best-effort admin email |
| `apps/api/src/lib/billing/grace.ts` (new) + test | `expireGraceOrgs` |
| `apps/api/src/workers/billing-grace.worker.ts` (new) | queue + cron + worker |
| `apps/api/src/routes/billing-webhook.ts` (modify) + test | Stripe lifecycle |
| `apps/api/src/routes/billing-gateway-webhooks.ts` (modify) | use `activatePlan` |
| `apps/api/src/routes/billing.ts` (modify) | approve, checkout, switch-plan, customer id helper |
| `apps/api/src/routes/admin.ts` (modify) | manual create updates the plan |
| `apps/api/src/index.ts` (modify) | start grace worker when flag on |
| `apps/api/scripts/backfill-stripe-id.ts` (new) + test | dry-run-by-default backfill |

Run API tests with `cd apps/api && npx vitest run <files>`; type-check with `cd apps/api && npx tsc --noEmit 2>&1 | grep -E "<touched paths>"` (slow, up to 10 minutes).

---

### Task 1: Schema, migration and flags

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Organization model; `enum PaymentGateway`)
- Create: `apps/api/prisma/migrations/20261010100000_billing_lifecycle/migration.sql`
- Create: `apps/api/src/lib/billing/flags.ts`, `apps/api/src/lib/billing/flags.test.ts`

**Interfaces:**
- Produces: Prisma fields `Organization.billingStatus: string` ("active" | "past_due" | "cancelled"), `billingGraceEndsAt: Date | null`, `planCancelAtPeriodEnd: boolean`; enum values `PaymentGateway.paystack`, `PaymentGateway.yoomoney`; `isBillingV2Enabled(env?): boolean`; `graceDays(env?): number`.

- [ ] **Step 1: Write the failing test** (`flags.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { isBillingV2Enabled, graceDays } from "./flags.js";

describe("billing flags", () => {
  it("is enabled only for the exact string true", () => {
    expect(isBillingV2Enabled({ BILLING_V2_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(true);
    for (const v of [undefined, "", "1", "TRUE", "false"]) {
      expect(isBillingV2Enabled({ BILLING_V2_ENABLED: v } as NodeJS.ProcessEnv)).toBe(false);
    }
  });
  it("defaults the grace period to 7 days and rejects junk", () => {
    expect(graceDays({} as NodeJS.ProcessEnv)).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: "3" } as NodeJS.ProcessEnv)).toBe(3);
    expect(graceDays({ BILLING_GRACE_DAYS: "abc" } as NodeJS.ProcessEnv)).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: "-2" } as NodeJS.ProcessEnv)).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: "0" } as NodeJS.ProcessEnv)).toBe(7);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/billing/flags.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `flags.ts`**

```ts
export function isBillingV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["BILLING_V2_ENABLED"] === "true";
}

export function graceDays(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env["BILLING_GRACE_DAYS"]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 7;
}
```

- [ ] **Step 4: Edit `schema.prisma`**

In `model Organization`, next to `stripeId` / `trialEndsAt`, add:

```prisma
  billingStatus          String    @default("active") @map("billing_status") // active | past_due | cancelled
  billingGraceEndsAt     DateTime? @map("billing_grace_ends_at")
  planCancelAtPeriodEnd  Boolean   @default(false) @map("plan_cancel_at_period_end")
```

and, next to the model's existing `@@map("organizations")`, add:

```prisma
  @@index([stripeId])
  @@index([billingStatus, billingGraceEndsAt])
```

In `enum PaymentGateway` append `paystack` and `yoomoney`.

- [ ] **Step 5: Hand-write the migration** (`20261010100000_billing_lifecycle/migration.sql`)

```sql
-- Billing lifecycle (Phase 1A). Additive only; safe to deploy with BILLING_V2_ENABLED off.
ALTER TABLE "organizations"
  ADD COLUMN "billing_status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "billing_grace_ends_at" TIMESTAMP(3),
  ADD COLUMN "plan_cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "organizations_stripe_id_idx" ON "organizations"("stripe_id");
CREATE INDEX "organizations_billing_status_billing_grace_ends_at_idx"
  ON "organizations"("billing_status", "billing_grace_ends_at");

ALTER TYPE "PaymentGateway" ADD VALUE IF NOT EXISTS 'paystack';
ALTER TYPE "PaymentGateway" ADD VALUE IF NOT EXISTS 'yoomoney';
```

- [ ] **Step 6: Validate and regenerate the client**

Run: `cd apps/api && npx prisma validate && npx prisma generate`
Expected: "The schema ... is valid" and a regenerated client. Note: `node_modules` is junctioned from the main checkout, so this regenerates the shared client; the change is additive and harmless to the other checkout. Do NOT run `prisma migrate dev` or touch a database.

- [ ] **Step 7: Run tests, type-check, commit**

Run: `cd apps/api && npx vitest run src/lib/billing/flags.test.ts` (PASS) and the tsc filter on `lib/billing`.

```bash
git add apps/api/prisma apps/api/src/lib/billing/flags.ts apps/api/src/lib/billing/flags.test.ts
git commit -m "feat(api): billing lifecycle columns, gateway enum values and V2 flag"
```

---

### Task 2: `activatePlan`

**Files:**
- Create: `apps/api/src/lib/billing/activation.ts`, `apps/api/src/lib/billing/activation.test.ts`

**Interfaces:**
- Consumes: new Prisma fields and enum values (Task 1).
- Produces:

```ts
export type ActivationSource = "stripe" | "razorpay" | "paystack" | "yoomoney" | "manual_approval" | "admin";
export interface ActivatePlanInput {
  organizationId: string;
  planTier: PlanTier;
  source: ActivationSource;
  gateway: PaymentGateway;
  referenceId: string;            // globally unique idempotency key, e.g. "razorpay:pay_123"
  gatewayTransactionId?: string;
  amountMinor?: number;
  currency?: string;
  stripeSubscriptionId?: string;
  manualSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
}
export type ActivationResult = { duplicate: boolean };
export function isUnknownOrgError(err: unknown): boolean   // Prisma P2003 or P2025
export async function activatePlan(prisma: PrismaClient, input: ActivatePlanInput): Promise<ActivationResult>
```

- [ ] **Step 1: Write the failing tests** (`activation.test.ts`)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { activatePlan, isUnknownOrgError } from "./activation.js";

const tx = {
  transaction: { create: vi.fn() },
  organization: { update: vi.fn() },
  manualSubscription: { updateMany: vi.fn(), update: vi.fn() },
};
const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) } as unknown as PrismaClient;
const base = { organizationId: "org-1", planTier: "growth" as const, source: "razorpay" as const, gateway: "razorpay" as const, referenceId: "razorpay:pay_1", gatewayTransactionId: "pay_1", amountMinor: 299900, currency: "inr" };
const p2002 = Object.assign(new Error("unique"), { code: "P2002" });

describe("activatePlan", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("records the transaction first, then updates the org and clears billing state", async () => {
    const order: string[] = [];
    tx.transaction.create.mockImplementation(async () => { order.push("txn"); });
    tx.organization.update.mockImplementation(async () => { order.push("org"); });
    const res = await activatePlan(prisma, base);
    expect(res).toEqual({ duplicate: false });
    expect(order).toEqual(["txn", "org"]);
    expect(tx.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      organizationId: "org-1", amount: 299900, currency: "INR", type: "subscription", status: "completed",
      gateway: "razorpay", gatewayTransactionId: "pay_1", referenceId: "razorpay:pay_1" }) });
    expect(tx.organization.update).toHaveBeenCalledWith({ where: { id: "org-1" },
      data: { planTier: "growth", billingStatus: "active", billingGraceEndsAt: null, planCancelAtPeriodEnd: false } });
  });

  it("is a no-op duplicate when the transaction keys already exist", async () => {
    tx.transaction.create.mockRejectedValue(p2002);
    const res = await activatePlan(prisma, base);
    expect(res).toEqual({ duplicate: true });
    expect(tx.organization.update).not.toHaveBeenCalled();
  });

  it("rethrows non-unique errors", async () => {
    tx.transaction.create.mockRejectedValue(new Error("db down"));
    await expect(activatePlan(prisma, base)).rejects.toThrow("db down");
  });

  it("activates a manual subscription and cancels the org's other active ones", async () => {
    await activatePlan(prisma, { ...base, source: "manual_approval", gateway: "other", referenceId: "manual:ms-1", gatewayTransactionId: undefined, manualSubscriptionId: "ms-1" });
    expect(tx.manualSubscription.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", status: "active", id: { not: "ms-1" } }, data: { status: "cancelled" } });
    expect(tx.manualSubscription.update).toHaveBeenCalledWith({ where: { id: "ms-1" }, data: { status: "active" } });
  });

  it("passes cancelAtPeriodEnd through", async () => {
    await activatePlan(prisma, { ...base, cancelAtPeriodEnd: true });
    expect(tx.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planCancelAtPeriodEnd: true }) }));
  });
});

describe("isUnknownOrgError", () => {
  it("matches P2003 and P2025 only", () => {
    expect(isUnknownOrgError({ code: "P2003" })).toBe(true);
    expect(isUnknownOrgError({ code: "P2025" })).toBe(true);
    expect(isUnknownOrgError({ code: "P2002" })).toBe(false);
    expect(isUnknownOrgError(new Error("x"))).toBe(false);
    expect(isUnknownOrgError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/lib/billing/activation.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `activation.ts`**

```ts
import type { PrismaClient, PlanTier, PaymentGateway } from "@prisma/client";

export type ActivationSource = "stripe" | "razorpay" | "paystack" | "yoomoney" | "manual_approval" | "admin";

export interface ActivatePlanInput {
  organizationId: string;
  planTier: PlanTier;
  source: ActivationSource;
  gateway: PaymentGateway;
  referenceId: string;
  gatewayTransactionId?: string;
  amountMinor?: number;
  currency?: string;
  stripeSubscriptionId?: string;
  manualSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface ActivationResult { duplicate: boolean }

function prismaCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
}

/** True when the organization does not exist (foreign key on the Transaction insert, or update of a missing row). */
export function isUnknownOrgError(err: unknown): boolean {
  const c = prismaCode(err);
  return c === "P2003" || c === "P2025";
}

/**
 * The only function allowed to change Organization.planTier for a payment. The Transaction row is inserted
 * FIRST: its unique keys (referenceId, gatewayTransactionId) make a replayed event a no-op, and a unique
 * violation aborts the DB transaction before anything else is written.
 */
export async function activatePlan(prisma: PrismaClient, input: ActivatePlanInput): Promise<ActivationResult> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          organizationId: input.organizationId,
          amount: input.amountMinor ?? 0,
          currency: (input.currency ?? "INR").toUpperCase(),
          type: "subscription",
          status: "completed",
          gateway: input.gateway,
          gatewayTransactionId: input.gatewayTransactionId ?? null,
          referenceId: input.referenceId,
          manualSubscriptionId: input.manualSubscriptionId ?? null,
          stripeSubscriptionId: input.stripeSubscriptionId ?? null,
          metadata: { source: input.source, planTier: input.planTier },
        },
      });
      if (input.manualSubscriptionId) {
        await tx.manualSubscription.updateMany({
          where: { organizationId: input.organizationId, status: "active", id: { not: input.manualSubscriptionId } },
          data: { status: "cancelled" },
        });
        await tx.manualSubscription.update({ where: { id: input.manualSubscriptionId }, data: { status: "active" } });
      }
      await tx.organization.update({
        where: { id: input.organizationId },
        data: {
          planTier: input.planTier,
          billingStatus: "active",
          billingGraceEndsAt: null,
          planCancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        },
      });
    });
    return { duplicate: false };
  } catch (err) {
    if (prismaCode(err) === "P2002") return { duplicate: true };
    throw err;
  }
}
```

- [ ] **Step 4: Run to verify pass, type-check, commit**

Run: `cd apps/api && npx vitest run src/lib/billing/activation.test.ts` (PASS) and the tsc filter on `lib/billing`.

```bash
git add apps/api/src/lib/billing/activation.ts apps/api/src/lib/billing/activation.test.ts
git commit -m "feat(api): idempotent activatePlan pipeline with Transaction ledger"
```

---

### Task 3: Move every payment path onto `activatePlan`

**Files:**
- Modify: `apps/api/src/routes/billing-gateway-webhooks.ts` (Razorpay, Paystack, YooMoney plan paths)
- Modify: `apps/api/src/routes/billing.ts` (`/billing/manual/:id/approve`; delete `activateManualSubscription`)
- Modify: `apps/api/src/routes/admin.ts` (`POST` manual-subscription create, ~lines 127-146)
- Modify tests: `billing-gateway-webhooks.test.ts`, `billing.test.ts`, `admin.test.ts`

**Interfaces:**
- Consumes: `activatePlan`, `isUnknownOrgError` (Task 2).

Rules:
- Each gateway webhook, after its existing verification and `isBillableTier && isPaidAmountSufficient` guard, calls `activatePlan` with `referenceId = "<source>:<gateway payment id>"` and `gatewayTransactionId = <gateway payment id>`: Razorpay `entity.id` (add `id?: string` to the entity type), Paystack `data.reference`, YooMoney `payment.id`. **If the payment id is missing, do not activate** (fail closed, log a warn with orgId/planId only).
- The existing "unknown org" handling (currently `isRecordNotFound` = P2025) must use `isUnknownOrgError` (P2025 or P2003); every other error is rethrown (500, gateway retries). A duplicate result returns 200 `{received:true}` like success.
- Approve: `activatePlan` with `source: "manual_approval"`, `gateway: sub.gateway`, `referenceId: "manual:<sub.id>"`, `manualSubscriptionId: sub.id`, `amountMinor: Math.round(Number(sub.charges) * 100)`; remove `activateManualSubscription` and its imports.
- Admin create: after the `manualSubscription.create` (already `status: "active"`), call `activatePlan` with `source: "admin"`, `gateway` = the request gateway, `referenceId: "admin:<sub.id>"`, `manualSubscriptionId: sub.id`, `amountMinor: Math.round(charges * 100)` so `Organization.planTier` follows the subscription (fixes spec E3). Keep the audit call.

- [ ] **Step 1: Update tests first (they must fail against the current code)**

In `billing-gateway-webhooks.test.ts`: add `vi.mock("../lib/billing/activation.js", async (orig) => ({ ...(await orig<typeof import("../lib/billing/activation.js")>()), activatePlan: activatePlanMock }))` with `const { activatePlanMock } = vi.hoisted(() => ({ activatePlanMock: vi.fn() }))` (default `mockResolvedValue({ duplicate: false })` in `beforeEach`). Replace the assertions that expect `organization.update` to be called in the success cases with:

```ts
expect(activatePlanMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
  organizationId: "org-1", planTier: "starter", source: "razorpay", gateway: "razorpay",
  referenceId: "razorpay:pay_1", gatewayTransactionId: "pay_1", amountMinor: 99900, currency: "INR" }));
```

(add `id: "pay_1"` to the Razorpay payload entity; for Paystack use `data.reference: "ref_1"` and expect `referenceId: "paystack:ref_1"`, gateway `paystack`; for YooMoney expect `referenceId: "yoomoney:pay-1"`, gateway `yoomoney`.) Keep every Phase 0 negative test (bad signature, underpaid, RUB, unknown tier, manualSubId activates nothing) asserting `activatePlanMock` NOT called. Add: payload without a payment id => 200 and `activatePlanMock` not called; `activatePlanMock.mockResolvedValue({ duplicate: true })` => 200; `activatePlanMock` rejecting `{ code: "P2003" }` => 200 (warn) and rejecting `new Error("x")` => 500 (replace the old P2025 `organization.update` rejection tests with these two).

In `billing.test.ts`: the superAdmin approve test asserts `activatePlan` called with `{ organizationId: "org-2", planTier: "growth", source: "manual_approval", manualSubscriptionId: "ms-1", referenceId: "manual:ms-1" }` (mock the activation module the same way). In `admin.test.ts`: the manual-subscription create test asserts `activatePlan` called with `source: "admin"` and `referenceId: "admin:<id>"`.

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/routes/billing-gateway-webhooks.test.ts src/routes/billing.test.ts src/routes/admin.test.ts`
Expected: FAIL on the changed assertions.

- [ ] **Step 3: Implement the edits** exactly per the rules above. Example for the Razorpay plan path (replacing the `organization.findUnique`/`update` block):

```ts
      } else if (isBillableTier(planId) && isPaidAmountSufficient(planId, entity.currency ?? "", entity.amount ?? NaN)) {
        if (!entity.id) {
          fastify.log.warn({ orgId, planId }, "razorpay payment not activated: missing payment id");
        } else {
          try {
            await activatePlan(fastify.prisma, {
              organizationId: orgId, planTier: planId as PlanTier, source: "razorpay", gateway: "razorpay",
              referenceId: `razorpay:${entity.id}`, gatewayTransactionId: entity.id,
              amountMinor: entity.amount, currency: entity.currency,
            });
          } catch (err) {
            if (isUnknownOrgError(err)) fastify.log.warn({ orgId, planId }, "razorpay payment for unknown organization");
            else throw err;
          }
        }
      }
```

(The Razorpay `settings.razorpayPlanId` / `activatedAt` write is dropped: it was display-only. Remove any import that becomes unused.)

- [ ] **Step 4: Run to verify pass**

Run the three test files above, then `cd apps/api && npx vitest run src/routes src/lib/billing` for regressions.
Expected: PASS apart from the known flaky `segments.test.ts`.

- [ ] **Step 5: Type-check and commit**

Run the tsc filter for `routes/billing|routes/admin|lib/billing`.

```bash
git add apps/api/src/routes apps/api/src/lib/billing
git commit -m "refactor(api): route all payment activations through activatePlan"
```

---

### Task 4: Stripe customer up front and tier lookup helpers

**Files:**
- Create: `apps/api/src/lib/billing/stripe-customer.ts`, `apps/api/src/lib/billing/stripe-customer.test.ts`
- Modify: `apps/api/src/routes/billing.ts` (`/billing/checkout`, `/billing/subscriptions`, `/billing/cancel`, `/billing/cancel-now`, `/billing/switch-plan`, `/billing/portal`)
- Modify: `apps/api/src/routes/billing.test.ts`

**Interfaces:**
- Produces:

```ts
export function getStripeCustomerId(org: { stripeId: string | null; settings: unknown } | null): string | null  // stripeId column first, then settings.stripeCustomerId
export function tierFromPriceId(priceId: string | undefined, priceIds?: Record<string, string>): BillableTier | null
```

- [ ] **Step 1: Write the failing tests** (`stripe-customer.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { getStripeCustomerId, tierFromPriceId } from "./stripe-customer.js";

describe("getStripeCustomerId", () => {
  it("prefers the column, falls back to settings, else null", () => {
    expect(getStripeCustomerId({ stripeId: "cus_col", settings: { stripeCustomerId: "cus_set" } })).toBe("cus_col");
    expect(getStripeCustomerId({ stripeId: null, settings: { stripeCustomerId: "cus_set" } })).toBe("cus_set");
    expect(getStripeCustomerId({ stripeId: null, settings: {} })).toBeNull();
    expect(getStripeCustomerId({ stripeId: null, settings: null })).toBeNull();
    expect(getStripeCustomerId(null)).toBeNull();
  });
});

describe("tierFromPriceId", () => {
  const ids = { starter: "price_s", growth: "price_g", scale: "price_sc", enterprise: "price_e", empty: "" };
  it("maps known billable price ids", () => {
    expect(tierFromPriceId("price_g", ids)).toBe("growth");
  });
  it("returns null for unknown, empty, enterprise and missing ids", () => {
    expect(tierFromPriceId("price_x", ids)).toBeNull();
    expect(tierFromPriceId("", ids)).toBeNull();
    expect(tierFromPriceId(undefined, ids)).toBeNull();
    expect(tierFromPriceId("price_e", ids)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**, then **Step 3: implement**

```ts
import { PLAN_PRICE_IDS } from "../stripe.js";
import { isBillableTier, type BillableTier } from "./catalog.js";

export function getStripeCustomerId(org: { stripeId: string | null; settings: unknown } | null): string | null {
  if (!org) return null;
  if (org.stripeId) return org.stripeId;
  const s = org.settings as Record<string, unknown> | null;
  const v = s?.["stripeCustomerId"];
  return typeof v === "string" && v ? v : null;
}

export function tierFromPriceId(priceId: string | undefined, priceIds: Record<string, string> = PLAN_PRICE_IDS): BillableTier | null {
  if (!priceId) return null;
  for (const [tier, id] of Object.entries(priceIds)) {
    if (id && id === priceId && isBillableTier(tier)) return tier;
  }
  return null;
}
```

Run: `cd apps/api && npx vitest run src/lib/billing/stripe-customer.test.ts` (PASS).

- [ ] **Step 4: Write failing route tests** (`billing.test.ts`, extend the `getStripe` mock with `customers: { create }` via `vi.hoisted`)

- checkout, org without `stripeId`: `customers.create` called once with `{ metadata: { organizationId: "org-1" } }`; `organization.update` called with `{ where: { id: "org-1" }, data: { stripeId: "cus_new" } }`; `sessions.create` called with `customer: "cus_new"`, `metadata` unchanged, and `subscription_data: { metadata: { organizationId: "org-1", planTier: "starter" } }`.
- checkout, org with `stripeId: "cus_old"`: `customers.create` NOT called; `sessions.create` called with `customer: "cus_old"`.
- the existing Phase 0 checkout tests keep passing (mock `organization.findUnique` to return `{ stripeId: null, settings: {} }` in their `beforeEach`).
- `/billing/subscriptions` and `/billing/cancel` find the customer through `stripeId` when settings has none.

- [ ] **Step 5: Implement in `billing.ts`**

In `/billing/checkout`, after validating the tier and redirects:

```ts
      const org = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { stripeId: true, settings: true } });
      let customerId = getStripeCustomerId(org);
      if (!customerId) {
        const customer = await getStripe().customers.create({ metadata: { organizationId } });
        customerId = customer.id;
        await fastify.prisma.organization.update({ where: { id: organizationId }, data: { stripeId: customerId } });
      }
      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { organizationId, planTier },
        subscription_data: { metadata: { organizationId, planTier } },
      });
```

In the other five handlers replace the `settings?.["stripeCustomerId"]` lookups by `getStripeCustomerId(org)` and add `stripeId: true` to each `select`.

- [ ] **Step 6: Run to verify pass, type-check, commit**

Run: `cd apps/api && npx vitest run src/routes/billing.test.ts src/lib/billing` then the tsc filter.

```bash
git add apps/api/src/lib/billing apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts
git commit -m "feat(api): create the Stripe customer at checkout and resolve it from Organization.stripeId"
```

---

### Task 5: Stripe lifecycle webhook

**Files:**
- Modify: `apps/api/src/routes/billing-webhook.ts`
- Test: `apps/api/src/routes/billing-webhook.test.ts` (create if it does not exist; check first with `ls`)

**Interfaces:**
- Consumes: `activatePlan`, `isUnknownOrgError` (Task 2), `getStripeCustomerId`, `tierFromPriceId` (Task 4), `isBillingV2Enabled`, `graceDays` (Task 1), `notifyPaymentFailed` (Task 6: **until Task 6 lands, import it from a stub**; to keep tasks independent this task defines the call as `await notifyPaymentFailed(fastify.prisma, orgId, graceEndsAt)` and Task 6 creates the module; therefore Tasks 5 and 6 MUST be implemented in the order 6 then 5 — see Ordering).
- Stripe objects are read through minimal local interfaces, not SDK types, because the SDK API version (`2026-04-22.dahlia`) moved some invoice fields: use only `customer`, `id`, `amount_paid`, `currency` on invoices and `customer`, `status`, `cancel_at_period_end`, `items.data[].price.id` on subscriptions.

**Ordering:** implement Task 6 before Task 5.

Behaviour (flag on; flag off = the current Phase 0 `checkout.session.completed` block, byte-for-byte behaviour):

| Event | Action |
|-------|--------|
| `checkout.session.completed` | only store `stripeId` when the org has none: `organization.updateMany({ where: { id: metadata.organizationId, stripeId: null }, data: { stripeId: customerId } })`. No activation here. |
| `invoice.payment_succeeded` | org = `findFirst({ where: { stripeId: customerId } })`; unknown => warn + 200. Else `subscriptions.list({ customer, status: "active", limit: 1 })`; `tier = tierFromPriceId(sub.items.data[0].price.id) ?? org.planTier`; `activatePlan({ source: "stripe", gateway: "stripe", referenceId: "stripe:invoice:<id>", gatewayTransactionId: invoice.id, amountMinor: invoice.amount_paid, currency: invoice.currency, stripeSubscriptionId: sub?.id, cancelAtPeriodEnd: sub?.cancel_at_period_end })`. A non-billable/unknown tier (e.g. enterprise) keeps `org.planTier`. |
| `invoice.payment_failed` | org lookup; if `billingStatus !== "past_due"`: set `billingStatus: "past_due"`, `billingGraceEndsAt: now + graceDays()`, then `notifyPaymentFailed` (errors swallowed). If already `past_due`: do nothing (grace never extended). |
| `customer.subscription.updated` | org lookup; `organization.update({ data: { planCancelAtPeriodEnd: sub.cancel_at_period_end ?? false } })`. |
| `customer.subscription.deleted` | org lookup; list active subs for the customer; if one exists skip (customer re-subscribed); else `organization.update({ data: { planTier: "starter", billingStatus: "cancelled", billingGraceEndsAt: null, planCancelAtPeriodEnd: false } })`. |
| anything else | 200, ignored. |

Unknown customer, duplicate delivery and unknown org (`isUnknownOrgError`) all return 200; any other error propagates (500) so Stripe retries.

- [ ] **Step 1: Write failing tests** — build the app like `billing.test.ts` does (Fastify + `billingWebhookRouter`, mock `../lib/stripe.js` with `getStripe: () => ({ webhooks: { constructEvent }, subscriptions: { list } })` via `vi.hoisted`, `PLAN_PRICE_IDS: { starter: "price_s", growth: "price_g", scale: "price_sc", enterprise: "" }`, `PLAN_LIMITS`, `ZERO_DECIMAL_CURRENCIES`), mock `../lib/billing/activation.js` (`activatePlan`) and `../lib/billing/payment-failed-email.js` (`notifyPaymentFailed`), set `process.env.STRIPE_WEBHOOK_SECRET = "whsec"` and `BILLING_V2_ENABLED = "true"` (restore both in `afterEach`). Each test posts a body with header `stripe-signature` and makes `constructEvent` return the event object. Cases (each asserts on the mocks):
  1. missing signature header or `constructEvent` throwing => 400, nothing called.
  2. `invoice.payment_succeeded` for a known customer with an active growth subscription => `activatePlan` called with `{ organizationId: "org-1", planTier: "growth", source: "stripe", gateway: "stripe", referenceId: "stripe:invoice:in_1", gatewayTransactionId: "in_1", amountMinor: 299900, currency: "inr", stripeSubscriptionId: "sub_1" }`.
  3. same event with an unknown customer (`organization.findFirst` => null) => 200, `activatePlan` not called.
  4. `activatePlan` resolving `{ duplicate: true }` => 200.
  5. `invoice.payment_failed`: org active => `organization.update` called with `billingStatus: "past_due"` and a `billingGraceEndsAt` ≈ now + 7 days (use fake timers), `notifyPaymentFailed` called once; org already `past_due` => no update, no email.
  6. `customer.subscription.updated` with `cancel_at_period_end: true` => update `{ planCancelAtPeriodEnd: true }`.
  7. `customer.subscription.deleted`: no other active sub => downgrade update exactly as in the table; another active sub (`subscriptions.list` returns one) => no update.
  8. `checkout.session.completed` flag on => `updateMany` with `stripeId: null` filter, `activatePlan` NOT called.
  9. flag off (`BILLING_V2_ENABLED` unset): `checkout.session.completed` keeps the Phase 0 behaviour (calls `organization.update` with `planTier` and `settings`), and `invoice.payment_failed` is ignored (200, no update).
  10. `activatePlan` rejecting `{ code: "P2003" }` => 200; rejecting `new Error("x")` => 500.
  11. unknown event type => 200.

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/routes/billing-webhook.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** in `billing-webhook.ts` keeping the raw-body parser, signature verification and the `STRIPE_WEBHOOK_SECRET` check exactly as they are. Add after `constructEvent`:

```ts
      const v2 = isBillingV2Enabled();
      const obj = event.data.object as unknown as Record<string, unknown>;
      const customerOf = (c: unknown): string | null =>
        typeof c === "string" ? c : (c as { id?: string } | null)?.id ?? null;
      const findOrg = async (customerId: string | null) =>
        customerId
          ? fastify.prisma.organization.findFirst({
              where: { stripeId: customerId },
              select: { id: true, planTier: true, billingStatus: true },
            })
          : null;

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        if (v2) {
          const orgId = session.metadata?.["organizationId"];
          const customerId = customerOf(session.customer);
          if (orgId && customerId) {
            await fastify.prisma.organization.updateMany({ where: { id: orgId, stripeId: null }, data: { stripeId: customerId } });
          }
        } else {
          /* legacy Phase 0 block, unchanged */
        }
      } else if (v2 && event.type === "invoice.payment_succeeded") {
        const org = await findOrg(customerOf(obj["customer"]));
        if (!org) { fastify.log.warn("stripe invoice for unknown customer"); return reply.status(200).send({ received: true }); }
        const subs = await getStripe().subscriptions.list({ customer: customerOf(obj["customer"]) as string, status: "active", limit: 1 });
        const sub = subs.data[0] as unknown as { id: string; cancel_at_period_end?: boolean; items?: { data: { price?: { id?: string } }[] } } | undefined;
        const tier = tierFromPriceId(sub?.items?.data[0]?.price?.id) ?? org.planTier;
        try {
          await activatePlan(fastify.prisma, {
            organizationId: org.id, planTier: tier as PlanTier, source: "stripe", gateway: "stripe",
            referenceId: `stripe:invoice:${String(obj["id"])}`, gatewayTransactionId: String(obj["id"]),
            amountMinor: typeof obj["amount_paid"] === "number" ? obj["amount_paid"] : undefined,
            currency: typeof obj["currency"] === "string" ? obj["currency"] : undefined,
            stripeSubscriptionId: sub?.id, cancelAtPeriodEnd: sub?.cancel_at_period_end,
          });
        } catch (err) {
          if (!isUnknownOrgError(err)) throw err;
          fastify.log.warn({ orgId: org.id }, "stripe invoice for unknown organization");
        }
      } else if (v2 && event.type === "invoice.payment_failed") { /* per table */ }
      else if (v2 && event.type === "customer.subscription.updated") { /* per table */ }
      else if (v2 && event.type === "customer.subscription.deleted") { /* per table */ }
```

Fill the three `/* per table */` branches exactly as the table specifies (use `new Date(Date.now() + graceDays() * 86_400_000)` for the grace end). Keep the legacy checkout block verbatim in the flag-off branch. Return `{ received: true }` at the end as before. Do not log full event payloads.

- [ ] **Step 4: Run to verify pass, type-check, commit**

Run: `cd apps/api && npx vitest run src/routes/billing-webhook.test.ts src/routes/billing.test.ts src/lib/billing` then the tsc filter on `routes/billing`.

```bash
git add apps/api/src/routes/billing-webhook.ts apps/api/src/routes/billing-webhook.test.ts
git commit -m "feat(api): Stripe lifecycle events behind BILLING_V2_ENABLED"
```

---

### Task 6: Payment-failed email (implement BEFORE Task 5)

**Files:**
- Create: `apps/api/src/lib/billing/payment-failed-email.ts`, `apps/api/src/lib/billing/payment-failed-email.test.ts`

**Interfaces:**
- Consumes: `sendMail`, `isEmailConfigured` from `apps/api/src/lib/mail.ts` (`sendMail({ to, subject, html })`).
- Produces: `notifyPaymentFailed(prisma: PrismaClient, organizationId: string, graceEndsAt: Date): Promise<void>` (never throws).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("../mail.js", () => ({ sendMail, isEmailConfigured: () => true }));
import { notifyPaymentFailed } from "./payment-failed-email.js";

const prisma = { user: { findMany: vi.fn() } } as unknown as PrismaClient;
const findMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

describe("notifyPaymentFailed", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("emails the active admins of the org only", async () => {
    findMany.mockResolvedValue([{ email: "a@x.com" }, { email: "b@x.com" }]);
    await notifyPaymentFailed(prisma, "org-1", new Date("2026-10-17T00:00:00Z"));
    expect(findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", role: "admin", isActive: true }, select: { email: true } });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["a@x.com", "b@x.com"], subject: expect.stringContaining("WBMSG") }));
    expect(String(sendMail.mock.calls[0]![0].html)).toContain("17");
  });

  it("does nothing when there are no admins", async () => {
    findMany.mockResolvedValue([]);
    await notifyPaymentFailed(prisma, "org-1", new Date());
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("never throws when sending fails", async () => {
    findMany.mockResolvedValue([{ email: "a@x.com" }]);
    sendMail.mockRejectedValue(new Error("smtp down"));
    await expect(notifyPaymentFailed(prisma, "org-1", new Date())).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**, then **Step 3: implement**

```ts
import type { PrismaClient } from "@prisma/client";
import { sendMail } from "../mail.js";

export async function notifyPaymentFailed(prisma: PrismaClient, organizationId: string, graceEndsAt: Date): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { organizationId, role: "admin", isActive: true },
      select: { email: true },
    });
    const to = admins.map((a) => a.email).filter(Boolean);
    if (to.length === 0) return;
    const until = graceEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    await sendMail({
      to,
      subject: "WBMSG: your last payment failed",
      html: `<p>We could not process your latest WBMSG subscription payment.</p>
<p>Please update your payment method in Settings &gt; Billing before <strong>${until}</strong> to keep your current plan. After that date your account moves to the Starter plan.</p>`,
    });
  } catch (err) {
    console.warn("[billing] payment-failed email not sent", err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 4: Run to verify pass, type-check, commit**

Run: `cd apps/api && npx vitest run src/lib/billing/payment-failed-email.test.ts` (PASS).

```bash
git add apps/api/src/lib/billing/payment-failed-email.ts apps/api/src/lib/billing/payment-failed-email.test.ts
git commit -m "feat(api): payment-failed email to org admins"
```

---

### Task 7: Grace expiry job

**Files:**
- Create: `apps/api/src/lib/billing/grace.ts`, `apps/api/src/lib/billing/grace.test.ts`, `apps/api/src/workers/billing-grace.worker.ts`
- Modify: `apps/api/src/index.ts` (start next to the `AUTO_REGISTER_PHONE_ENABLED` block)

**Interfaces:**
- Consumes: `isBillingV2Enabled` (Task 1).
- Produces: `expireGraceOrgs(prisma: PrismaClient, now?: Date): Promise<string[]>` (ids downgraded), `startBillingGraceWorker()`, `scheduleBillingGraceCron()`.

- [ ] **Step 1: Write failing tests** (`grace.test.ts`)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { expireGraceOrgs } from "./grace.js";

const prisma = { organization: { findMany: vi.fn(), updateMany: vi.fn() } } as unknown as PrismaClient;
const findMany = prisma.organization.findMany as ReturnType<typeof vi.fn>;
const updateMany = prisma.organization.updateMany as ReturnType<typeof vi.fn>;
const now = new Date("2026-10-20T00:00:00Z");

describe("expireGraceOrgs", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("selects only past_due orgs whose grace has ended", async () => {
    findMany.mockResolvedValue([]);
    await expireGraceOrgs(prisma, now);
    expect(findMany).toHaveBeenCalledWith({ where: { billingStatus: "past_due", billingGraceEndsAt: { lt: now } }, select: { id: true }, take: 500 });
  });

  it("downgrades each due org to starter and clears grace, guarded on still being past_due", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    updateMany.mockResolvedValue({ count: 1 });
    const ids = await expireGraceOrgs(prisma, now);
    expect(ids).toEqual(["a", "b"]);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "a", billingStatus: "past_due" },
      data: { planTier: "starter", billingStatus: "cancelled", billingGraceEndsAt: null, planCancelAtPeriodEnd: false } });
  });

  it("does not report orgs that paid in the meantime (guard matched nothing)", async () => {
    findMany.mockResolvedValue([{ id: "a" }]);
    updateMany.mockResolvedValue({ count: 0 });
    expect(await expireGraceOrgs(prisma, now)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**, then **Step 3: implement `grace.ts`**

```ts
import type { PrismaClient } from "@prisma/client";

const BATCH = 500;

export async function expireGraceOrgs(prisma: PrismaClient, now: Date = new Date()): Promise<string[]> {
  const due = await prisma.organization.findMany({
    where: { billingStatus: "past_due", billingGraceEndsAt: { lt: now } },
    select: { id: true },
    take: BATCH,
  });
  const downgraded: string[] = [];
  for (const { id } of due) {
    const res = await prisma.organization.updateMany({
      where: { id, billingStatus: "past_due" },
      data: { planTier: "starter", billingStatus: "cancelled", billingGraceEndsAt: null, planCancelAtPeriodEnd: false },
    });
    if (res.count > 0) downgraded.push(id);
  }
  return downgraded;
}
```

- [ ] **Step 4: Create the worker** (`billing-grace.worker.ts`), copying the imports and `Queue` construction from `apps/api/src/workers/register-phone.worker.ts` lines 1-20 (same `redisConnection`, `prisma`, queue error handler), with queue name `"billing-grace"`:

```ts
export function startBillingGraceWorker() {
  const worker = new Worker(
    "billing-grace",
    async () => {
      const ids = await expireGraceOrgs(prisma);
      if (ids.length > 0) console.log(`[billing-grace] downgraded ${ids.length} org(s): ${ids.join(",")}`);
    },
    { connection: redisConnection, concurrency: 1 }
  );
  worker.on("error", (err) => console.error(`[billing-grace] worker error: ${err.message}`));
  return worker;
}

export async function scheduleBillingGraceCron() {
  await billingGraceQueue.add("sweep", {}, { repeat: { pattern: "0 4 * * *" }, jobId: "billing-grace-cron" }); // 4am daily
}
```

(Each downgrade is also covered by the console log; if `writeAdminAudit` in `lib/audit.ts` supports a system actor without a `request`, add an audit entry per org; otherwise leave the log line and note it in the report.)

- [ ] **Step 5: Wire in `index.ts`**, after the register-phone block:

```ts
  // Billing grace expiry: only when BILLING_V2_ENABLED=true (see docs/prd-billing-phase1.md).
  if (isBillingV2Enabled()) {
    startBillingGraceWorker();
    scheduleBillingGraceCron().catch((err) => server.log.warn({ err }, "Billing grace cron schedule failed"));
  }
```

with the imports for `isBillingV2Enabled`, `startBillingGraceWorker`, `scheduleBillingGraceCron`.

- [ ] **Step 6: Run to verify pass, type-check, commit**

Run: `cd apps/api && npx vitest run src/lib/billing/grace.test.ts` (PASS) and the tsc filter on `workers/billing-grace|src/index|lib/billing`.

```bash
git add apps/api/src/lib/billing/grace.ts apps/api/src/lib/billing/grace.test.ts apps/api/src/workers/billing-grace.worker.ts apps/api/src/index.ts
git commit -m "feat(api): daily grace-expiry downgrade job behind BILLING_V2_ENABLED"
```

---

### Task 8: `switch-plan` waits for payment (flag on)

**Files:**
- Modify: `apps/api/src/routes/billing.ts` (`/billing/switch-plan`), `apps/api/src/routes/billing.test.ts`
- Modify: `apps/web/app/(dashboard)/settings/billing/BillingClient.tsx` (message only)

- [ ] **Step 1: Write failing tests** (flag set via `process.env["BILLING_V2_ENABLED"]`, restored in `afterEach`): with the flag on, a successful switch calls `subscriptions.update` and does NOT call `organization.update`, and returns `{ data: { success: true, planTier: "growth", pending: true } }`; with the flag off the response and the `organization.update({ data: { planTier } })` call are unchanged (`pending` absent). Mock `subscriptions.list` to return one subscription with `items.data[0].id`.

- [ ] **Step 2: Run to verify fail**, then **Step 3: implement**

```ts
    await getStripe().subscriptions.update(sub.id, { /* unchanged */ });
    if (isBillingV2Enabled()) {
      // The plan changes when the paid invoice arrives (invoice.payment_succeeded).
      return { data: { success: true, planTier, pending: true } };
    }
    await fastify.prisma.organization.update({ where: { id: organizationId }, data: { planTier } });
    return { data: { success: true, planTier } };
```

- [ ] **Step 4: Web message.** In `BillingClient.tsx` `switchPlan`, when the JSON response has `data.pending === true`, show a short inline note "Plan change requested. It applies once the payment is confirmed." (add one `useState<string | null>` and render it under the plans list; keep the existing `router.refresh()`). No other web change.

- [ ] **Step 5: Run `cd apps/api && npx vitest run src/routes/billing.test.ts` and `cd apps/web && npx eslint "app/(dashboard)/settings/billing"`; commit**

```bash
git add apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts "apps/web/app/(dashboard)/settings/billing"
git commit -m "feat(api): switch-plan applies after payment when BILLING_V2_ENABLED"
```

---

### Task 9: `stripeId` backfill script (dry-run by default)

**Files:**
- Create: `apps/api/scripts/backfill-stripe-id.ts`, `apps/api/scripts/backfill-stripe-id.test.ts`

First read one existing script in `apps/api/scripts/` that supports `--apply` (e.g. `grep -l "\-\-apply" apps/api/scripts/*.ts`) and follow its structure for argument parsing, Prisma client creation and output. Never hardcode credentials; use `DATABASE_URL` from the environment only and never print it.

**Interfaces:**
- Produces: `planStripeIdBackfill(orgs: { id: string; stripeId: string | null; settings: unknown }[]): { id: string; stripeId: string }[]` (pure) and a CLI that prints the plan (counts and org ids only) and applies it only with `--apply`.

- [ ] **Step 1: Write failing tests** for the pure function: returns entries only for orgs with `stripeId === null` and a non-empty string `settings.stripeCustomerId`; skips orgs that already have `stripeId`; skips junk settings (`null`, number, empty string); never returns the same Stripe id for two orgs (if duplicates exist, skip both and report them in a second returned list `conflicts`).
- [ ] **Step 2: Run to verify fail**, **Step 3: implement** the function plus the CLI (`--apply` runs `organization.updateMany({ where: { id, stripeId: null }, data: { stripeId } })` per entry; default prints `DRY RUN: would update N orgs (ids: ...)`).
- [ ] **Step 4: Run tests; commit**

```bash
git add apps/api/scripts/backfill-stripe-id.ts apps/api/scripts/backfill-stripe-id.test.ts
git commit -m "feat(api): dry-run-by-default backfill of Organization.stripeId from settings"
```

---

### Task 10: Verify, audit, document

- [ ] **Step 1: Security audit (required)** for every touched route; record results in the report: `/billing/checkout`, `/subscriptions`, `/cancel`, `/cancel-now`, `/switch-plan`, `/portal` (org from `request.auth`, `settings_billing`; customer id only from the caller's own org row), `/billing/manual/:id/approve` (superAdmin), admin manual create (superAdmin), Razorpay/Paystack/YooMoney/Stripe webhooks (org only from verified payload or Stripe customer lookup; no tenant-writable input affects verification), grace job (no HTTP surface).
- [ ] **Step 2:** `cd apps/api && npx vitest run` (full suite; expect only the 2 known `segments.test.ts` failures), `cd apps/web && npx vitest run lib/billing-page.test.ts`, eslint on all touched files in both apps, tsc filter on touched paths.
- [ ] **Step 3: Docs.** Update `docs/prd-billing-phase1.md` with any rulings made during execution and the final env list. Add the deploy checklist: apply migration `20261010100000_billing_lifecycle` (note: the enum `ADD VALUE` statements cannot be used in the same transaction; they are only used by later requests, so a normal `prisma migrate deploy` is fine), run the backfill dry-run then `--apply` only after owner confirmation, set `BILLING_V2_ENABLED=true` only after the Stripe webhook endpoint is subscribed to `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` and `checkout.session.completed`.
- [ ] **Step 4:** Finish the branch (`superpowers:finishing-a-development-branch`): ask before merging to `main`; do not push.

---

## Open Questions (owner; default in brackets)

1. Run the read-only production query (orgs per tier; which orgs already have `plan_limit_*`/`plan_feature_*` rows; subscriptions missing a Stripe customer id) before enabling the flag [yes; needed for Plan 1B rollout and for the backfill].
2. Stripe prod endpoint event subscriptions: confirm in the Stripe dashboard before `BILLING_V2_ENABLED=true` [required].
3. Grace period length [7 days via `BILLING_GRACE_DAYS`].

## Self-review

- Spec coverage: 3.3 (Tasks 2, 3), 3.4 (Tasks 4, 5, 6), 3.5 (Task 7), E6 switch-plan (Task 8), E7 backfill (Task 9), 4 migration (Task 1), E3 admin create (Task 3), E4 Transactions (Tasks 2-3). Entitlements 3.1/3.2 are Plan 1B.
- Placeholders: none; the three `/* per table */` branches are fully specified by the table above them and must be filled exactly as written.
- Type consistency: `activatePlan`, `isUnknownOrgError`, `getStripeCustomerId`, `tierFromPriceId`, `notifyPaymentFailed`, `expireGraceOrgs`, `isBillingV2Enabled`, `graceDays` are defined once and used with the same signatures.
- Known limitation: Stripe invoice/subscription fields are read through minimal local interfaces because the SDK version moved some fields; implementers must verify against the installed `stripe` types and fixtures, and say so if a field differs.
- Ordering constraint: Task 6 before Task 5; Task 1 before everything; Task 2 before 3 and 5; Task 4 before 5.
