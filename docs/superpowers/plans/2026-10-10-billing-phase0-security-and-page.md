# Billing Phase 0 (Security Fixes + Broken Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the billing security holes (free upgrades, forged/underpaid webhooks, missing RBAC, open redirect) and make `/settings/billing` render and upgrade again, with no schema change.

**Architecture:** A small server-side price catalog (`lib/billing/catalog.ts`) becomes the only source of "what a plan costs" for gateway activation. Gateway webhooks move into one raw-body plugin so signatures are verified on the exact bytes. The web page gets pure, tested helpers that adapt the API's current `gates` shape and decide access from permissions instead of a hard-coded role.

**Tech Stack:** Fastify 4, Prisma, Vitest (apps/api, apps/web), Next.js App Router, Clerk, Stripe SDK, Razorpay SDK.

**Spec:** `docs/prd-usage-billing.md` (this plan = its Phase 0; Phases 1-4 get separate plans after metering is verified).

## Global Constraints

- No Prisma schema change and no migration in this plan. (`WebhookEvent`/`Transaction` writes are Phase 1.)
- Do not change the response shape or auth of `GET /v1/billing/usage` (the dashboard page consumes it: `apps/web/app/(dashboard)/dashboard/page.tsx:62`).
- Every billing route keeps `organizationId` from `request.auth`; customer routes use `canAccessSub(role, permissions, "settings_access", "settings_billing")`; platform-only routes require `role === "superAdmin"`.
- Never log or return gateway secrets.
- Customer-facing text must say WBMSG, not "TrustCRM"; never mention "Plivo".
- Existing public webhook URLs must not change: `/v1/billing/razorpay/webhook`, `/v1/billing/paystack/webhook`, `/v1/billing/yoomoney/webhook`, `/v1/billing/webhook`.
- Production: no prod data scripts in this plan. Deploy checklist is in Task 9.

## Review Focus

- Replayed Razorpay/Paystack webhook: must not downgrade or double-apply; plan is set to the same tier (idempotent by nature).
- Webhook with valid signature but wrong/missing currency or underpaid amount: must NOT activate; returns 200 (so the gateway stops retrying) and logs for manual review.
- Webhook body re-serialized differently (key order/whitespace): signature must still verify because raw bytes are used.
- Agent/viewer role calling checkout, submit-proof, cancel-request, subscriptions, transactions: 403.
- Org admin calling manual approve/reject: 403 (platform `superAdmin` only), including another org's subscription id.
- Billing page with usage `null`, old shape, new `gates` shape, or empty `plans`: renders, never throws.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/api/src/lib/billing/catalog.ts` (new) | Server-side plan prices + `isPaidAmountSufficient` |
| `apps/api/src/lib/billing/catalog.test.ts` (new) | Catalog unit tests |
| `apps/api/src/lib/billing/safe-redirect.ts` (new) | Redirect-URL allow-list |
| `apps/api/src/lib/billing/safe-redirect.test.ts` (new) | Allow-list unit tests |
| `apps/api/src/routes/billing-gateway-webhooks.ts` (new) | Razorpay/Paystack/YooMoney webhooks, raw-body, verified |
| `apps/api/src/routes/billing-gateway-webhooks.test.ts` (new) | Webhook tests |
| `apps/api/src/routes/billing.ts` (modify) | Remove 3 webhooks, harden checkout/create-order/manual routes, RBAC, fix setup-webhook URL, brand text |
| `apps/api/src/routes/billing.test.ts` (modify) | Update mocks and add RBAC/price tests |
| `apps/api/src/routes/index.ts` (modify :85) | Register new plugin |
| `apps/web/lib/billing-page.ts` (new) | `normalizeUsage`, `canViewBilling` |
| `apps/web/lib/billing-page.test.ts` (new) | Helper tests |
| `apps/web/app/(dashboard)/settings/billing/page.tsx` (modify) | Use helpers, permission gate |
| `apps/web/app/(dashboard)/settings/billing/BillingClient.tsx` (modify) | New usage UI, working Subscribe button |

Run API tests with `cd apps/api && npx vitest run <file>`; web with `cd apps/web && npx vitest run <file>`. Known flaky: 2 pre-existing API failures (segments/conversations) and Redis-rejection noise; any other failure is real.

---

### Task 1: Server-side price catalog

**Files:**
- Create: `apps/api/src/lib/billing/catalog.ts`
- Test: `apps/api/src/lib/billing/catalog.test.ts`

**Interfaces:**
- Produces: `PLAN_CATALOG`, `type BillableTier`, `isBillableTier(v: unknown): v is BillableTier`, `isPaidAmountSufficient(tier: unknown, currency: string, paidMinorUnits: number): boolean`. Prices are copied from the current hard-coded list (`billing.ts:51-53`); amounts are minor units (INR paise, USD cents).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { PLAN_CATALOG, isBillableTier, isPaidAmountSufficient } from "./catalog.js";

describe("catalog", () => {
  it("knows billable tiers only", () => {
    expect(isBillableTier("starter")).toBe(true);
    expect(isBillableTier("enterprise")).toBe(false);
    expect(isBillableTier("plan-standard")).toBe(false);
    expect(isBillableTier(undefined)).toBe(false);
    expect(isBillableTier("__proto__")).toBe(false);
  });
  it("accepts exact or higher INR payment", () => {
    expect(isPaidAmountSufficient("starter", "INR", PLAN_CATALOG.starter.priceInr * 100)).toBe(true);
    expect(isPaidAmountSufficient("starter", "inr", 100_000)).toBe(true);
  });
  it("rejects underpayment", () => {
    expect(isPaidAmountSufficient("scale", "INR", 100)).toBe(false);
    expect(isPaidAmountSufficient("growth", "USD", 100)).toBe(false);
  });
  it("fails closed for unknown currency or tier", () => {
    expect(isPaidAmountSufficient("starter", "RUB", 10_000_000)).toBe(false);
    expect(isPaidAmountSufficient("enterprise", "INR", 10_000_000)).toBe(false);
    expect(isPaidAmountSufficient("nope", "INR", 10_000_000)).toBe(false);
    expect(isPaidAmountSufficient("starter", "INR", Number.NaN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/billing/catalog.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
export const PLAN_CATALOG = {
  starter: { name: "Starter", priceInr: 999, priceUsd: 12 },
  growth: { name: "Growth", priceInr: 2999, priceUsd: 36 },
  scale: { name: "Scale", priceInr: 7999, priceUsd: 96 },
} as const;

export type BillableTier = keyof typeof PLAN_CATALOG;

export function isBillableTier(v: unknown): v is BillableTier {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PLAN_CATALOG, v);
}

/** True only when the paid amount (minor units) covers at least the monthly list price in a catalogued currency. */
export function isPaidAmountSufficient(tier: unknown, currency: string, paidMinorUnits: number): boolean {
  if (!isBillableTier(tier) || !Number.isFinite(paidMinorUnits)) return false;
  const cur = currency.toUpperCase();
  const plan = PLAN_CATALOG[tier];
  if (cur === "INR") return paidMinorUnits >= plan.priceInr * 100;
  if (cur === "USD") return paidMinorUnits >= plan.priceUsd * 100;
  return false;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/billing/catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/billing/catalog.ts apps/api/src/lib/billing/catalog.test.ts
git commit -m "feat(api): server-side billing price catalog"
```

---

### Task 2: Checkout hardening (RBAC + redirect allow-list)

**Files:**
- Create: `apps/api/src/lib/billing/safe-redirect.ts`, `apps/api/src/lib/billing/safe-redirect.test.ts`
- Modify: `apps/api/src/routes/billing.ts:240-260`
- Modify: `apps/api/src/routes/billing.test.ts:5-16` (mock) and append tests

**Interfaces:**
- Produces: `allowedRedirectOrigins(env?: NodeJS.ProcessEnv): string[]`, `isAllowedRedirect(url: string, origins?: string[]): boolean`.
- Consumes: `canAccessSub` (already imported in billing.ts).

- [ ] **Step 1: Write failing tests** (`safe-redirect.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { allowedRedirectOrigins, isAllowedRedirect } from "./safe-redirect.js";

describe("safe-redirect", () => {
  const origins = ["https://wbmsg.com"];
  it("allows same-origin urls", () => {
    expect(isAllowedRedirect("https://wbmsg.com/settings/billing?x=1", origins)).toBe(true);
  });
  it("rejects other hosts, lookalikes, schemes and garbage", () => {
    expect(isAllowedRedirect("https://evil.com/", origins)).toBe(false);
    expect(isAllowedRedirect("https://wbmsg.com.evil.com/", origins)).toBe(false);
    expect(isAllowedRedirect("javascript:alert(1)", origins)).toBe(false);
    expect(isAllowedRedirect("//evil.com", origins)).toBe(false);
    expect(isAllowedRedirect("", origins)).toBe(false);
  });
  it("derives origins from WEB_PUBLIC_URL and adds localhost outside production", () => {
    expect(allowedRedirectOrigins({ WEB_PUBLIC_URL: "https://wbmsg.com/x", NODE_ENV: "production" } as NodeJS.ProcessEnv))
      .toEqual(["https://wbmsg.com"]);
    expect(allowedRedirectOrigins({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toContain("http://localhost:3000");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/lib/billing/safe-redirect.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `safe-redirect.ts`**

```ts
export function allowedRedirectOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const origins: string[] = [];
  const web = env["WEB_PUBLIC_URL"];
  if (web) {
    try { origins.push(new URL(web).origin); } catch { /* ignore malformed env */ }
  }
  if (env["NODE_ENV"] !== "production") origins.push("http://localhost:3000");
  return origins;
}

export function isAllowedRedirect(url: string, origins: string[] = allowedRedirectOrigins()): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && origins.includes(u.origin);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Update billing.test.ts mock and add failing checkout tests**

Replace the `vi.mock("../lib/stripe.js", ...)` block (lines 5-16) with:

```ts
const { stripeSessionCreate } = vi.hoisted(() => ({ stripeSessionCreate: vi.fn() }));
vi.mock("../lib/stripe.js", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: stripeSessionCreate } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) },
  }),
  PLAN_PRICE_IDS: { starter: "price_starter", growth: "price_growth" },
  PLAN_LIMITS: {
    starter: { contacts: 500, messages: 1000 },
    growth: { contacts: 5000, messages: 20000 },
  },
  ZERO_DECIMAL_CURRENCIES: new Set<string>(),
}));
```

Append:

```ts
describe("POST /v1/billing/checkout", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["WEB_PUBLIC_URL"] = "https://wbmsg.com";
    stripeSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("creates a session for allowed redirect urls", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/checkout",
      payload: { planTier: "starter", successUrl: "https://wbmsg.com/settings/billing", cancelUrl: "https://wbmsg.com/settings/billing" } });
    expect(res.statusCode).toBe(200);
  });

  it("rejects redirect urls on other origins", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/checkout",
      payload: { planTier: "starter", successUrl: "https://evil.com/x", cancelUrl: "https://wbmsg.com/settings/billing" } });
    expect(res.statusCode).toBe(400);
    expect(stripeSessionCreate).not.toHaveBeenCalled();
  });

  it("returns 403 without settings_billing", async () => {
    const other = Fastify({ logger: false });
    other.decorate("prisma", mockPrisma as unknown as PrismaClient);
    other.addHook("onRequest", async (r) => { r.auth = { ...mockAuth, role: "agent" as never, permissions: {} }; });
    const { billingRouter } = await import("./billing.js");
    await other.register(billingRouter, { prefix: "/v1" });
    const res = await other.inject({ method: "POST", url: "/v1/billing/checkout",
      payload: { planTier: "starter", successUrl: "https://wbmsg.com/a", cancelUrl: "https://wbmsg.com/a" } });
    expect(res.statusCode).toBe(403);
    await other.close();
  });
});
```

- [ ] **Step 5: Run to verify fail**

Run: `cd apps/api && npx vitest run src/routes/billing.test.ts -t "checkout"`
Expected: FAIL (redirect not rejected / 403 not returned)

- [ ] **Step 6: Implement in `billing.ts`**

Add import `import { isAllowedRedirect } from "../lib/billing/safe-redirect.js";` and replace the checkout handler body (lines 243-258):

```ts
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_billing permission required" } });
      }
      const { successUrl, cancelUrl } = request.body;
      if (!isAllowedRedirect(successUrl) || !isAllowedRedirect(cancelUrl)) {
        return reply.status(400).send({ error: { code: "INVALID_REDIRECT", message: "Redirect URL is not allowed" } });
      }
      // GAP-S56: support "{planTier}___monthly" / "{planTier}___yearly" selectors
      const { planTier } = parsePlanSelector(request.body.planTier as string);
      const priceId = PLAN_PRICE_IDS[planTier];
      if (!priceId) return reply.status(400).send({ error: "invalid_plan" });

      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { organizationId, planTier },
      });

      return { data: { url: session.url } };
```

- [ ] **Step 7: Run to verify pass**

Run: `cd apps/api && npx vitest run src/lib/billing/safe-redirect.test.ts src/routes/billing.test.ts`
Expected: PASS (existing tests included)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/billing apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts
git commit -m "fix(api): gate billing checkout by settings_billing and allow-list redirect urls"
```

---

### Task 3: Manual subscription + read-route RBAC

**Files:**
- Modify: `apps/api/src/routes/billing.ts` (`/billing/subscriptions` :60, `/billing/transactions` :182, `submit-proof` :496, `cancel-request` :546, `approve` :556, `reject` :567)
- Modify: `apps/api/src/routes/billing.test.ts`

**Interfaces:**
- Consumes: `canAccessSub`, `isBillableTier` (Task 1).

Design: `approve`/`reject` become `superAdmin` only (platform owner approves proofs). `submit-proof`, `cancel-request`, `GET /billing/subscriptions`, `GET /billing/transactions` need `settings_billing`. `GET /billing/usage` and `/billing/plans` stay open (dashboard uses usage). `submit-proof` rejects non-billable tiers.

- [ ] **Step 1: Write failing tests** (append to billing.test.ts; helper `buildAppAs` exists inside another describe, so add a module-level helper)

```ts
async function buildAs(role: string, permissions: Record<string, string> = {}): Promise<FastifyInstance> {
  const a = Fastify({ logger: false });
  a.decorate("prisma", mockPrisma as unknown as PrismaClient);
  a.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-9", organizationId: "org-1", role: role as never, permissions, teamId: null, teamRole: null };
  });
  const { billingRouter } = await import("./billing.js");
  await a.register(billingRouter, { prefix: "/v1" });
  return a;
}

describe("manual subscription + read RBAC", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("org admin cannot approve a manual subscription", async () => {
    const a = await buildAs("admin");
    const res = await a.inject({ method: "POST", url: "/v1/billing/manual/ms-1/approve" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.manualSubscription.findFirst).not.toHaveBeenCalled();
    await a.close();
  });

  it("org admin cannot reject a manual subscription", async () => {
    const a = await buildAs("admin");
    const res = await a.inject({ method: "POST", url: "/v1/billing/manual/ms-1/reject" });
    expect(res.statusCode).toBe(403);
    await a.close();
  });

  it("superAdmin can approve", async () => {
    mockPrisma.manualSubscription.findFirst.mockResolvedValue({ id: "ms-1", organizationId: "org-2", planTier: "growth" });
    const a = await buildAs("superAdmin");
    const res = await a.inject({ method: "POST", url: "/v1/billing/manual/ms-1/approve" });
    expect(res.statusCode).toBe(200);
    await a.close();
  });

  it("agent cannot submit proof, cancel request, or read subscriptions/transactions", async () => {
    const a = await buildAs("agent");
    for (const [method, url] of [
      ["POST", "/v1/billing/manual/submit-proof"],
      ["DELETE", "/v1/billing/manual/cancel-request"],
      ["GET", "/v1/billing/subscriptions"],
      ["GET", "/v1/billing/transactions"],
    ] as const) {
      const res = await a.inject({ method, url, payload: method === "POST" ? { planId: "starter", proofUrl: "https://x/y", transactionRef: "T1" } : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    await a.close();
  });

  it("submit-proof rejects unknown plan tiers", async () => {
    const a = await buildAs("admin");
    const res = await a.inject({ method: "POST", url: "/v1/billing/manual/submit-proof",
      payload: { planId: "plan-standard", proofUrl: "https://x/y", transactionRef: "T2" } });
    expect(res.statusCode).toBe(400);
    await a.close();
  });
});
```

Also update the existing submit-proof test payload (billing.test.ts:93) to `planId: "starter"` so it still returns 201.

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/routes/billing.test.ts -t "manual subscription"`
Expected: FAIL

- [ ] **Step 3: Implement**

Add at top of billing.ts: `import { isBillableTier } from "../lib/billing/catalog.js";`. Add a local helper after `calcEndsAt`:

```ts
function requireBilling(request: { auth: { role: string; permissions: Record<string, string> } }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }): boolean {
  if (canAccessSub(request.auth.role, request.auth.permissions, "settings_access", "settings_billing")) return true;
  reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_billing permission required" } });
  return false;
}
```

At the start of the handlers for `/billing/subscriptions`, `/billing/transactions`, `submit-proof`, `cancel-request` add `if (!requireBilling(request, reply)) return reply;` (these handlers currently take only `request`; add `reply` as the second parameter). In `submit-proof`, after computing `planTier`, add:

```ts
      if (!isBillableTier(planTier)) {
        return reply.status(400).send({ error: { code: "INVALID_PLAN", message: "Unknown plan tier" } });
      }
```

In `approve` and `reject` replace `request.auth.role !== "admin"` with `request.auth.role !== "superAdmin"` and the message with `"Platform admin only"`.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx vitest run src/routes/billing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts
git commit -m "fix(api): platform-only manual approval and settings_billing on billing read/proof routes"
```

---

### Task 4: Razorpay create-order uses server price

**Files:**
- Modify: `apps/api/src/routes/billing.ts:284-301`
- Modify: `apps/api/src/routes/billing.test.ts:67-81`

**Interfaces:**
- Consumes: `PLAN_CATALOG`, `isBillableTier` (Task 1), `parsePlanSelector` (billing.ts:21).

- [ ] **Step 1: Update/add failing tests** (replace the existing Razorpay describe)

```ts
describe("POST /v1/billing/razorpay/create-order", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates an order for the server-side price and ignores the client amount", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/create-order",
      payload: { planId: "starter", amount: 1 } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { orderId: string } }>().data.orderId).toBe("order_test123");
    const Razorpay = (await import("razorpay")).default as unknown as ReturnType<typeof vi.fn>;
    const instance = Razorpay.mock.results[0]!.value as { orders: { create: ReturnType<typeof vi.fn> } };
    expect(instance.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 99900, currency: "INR" }));
  });

  it("rejects unknown and enterprise plans", async () => {
    for (const planId of ["plan-standard", "enterprise", "starter___yearly"]) {
      const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/create-order", payload: { planId } });
      expect(res.statusCode, planId).toBe(400);
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/routes/billing.test.ts -t "razorpay/create-order"`
Expected: FAIL (amount comes from client)

- [ ] **Step 3: Implement** (replace handler body; add `PLAN_CATALOG, isBillableTier` import from `../lib/billing/catalog.js`)

```ts
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_billing permission required" } });
      }
      const { planTier, interval } = parsePlanSelector(String(request.body.planId ?? ""));
      if (!isBillableTier(planTier) || interval !== "monthly") {
        return reply.status(400).send({ error: { code: "INVALID_PLAN", message: "Unknown or unsupported plan" } });
      }
      // GAP-S60: DB credentials take precedence over env vars
      const creds = await getGatewayCredentials(fastify.prisma, organizationId, "razorpay");
      const rzp = new Razorpay({
        key_id: creds["razorpay_key_id"] ?? process.env["RAZORPAY_KEY_ID"] ?? "",
        key_secret: creds["razorpay_key_secret"] ?? process.env["RAZORPAY_KEY_SECRET"] ?? "",
      });
      const order = await rzp.orders.create({
        amount: PLAN_CATALOG[planTier].priceInr * 100, // server-side price; client amount is ignored
        currency: "INR",
        notes: { planId: planTier, organizationId },
      });
      return reply.send({ data: { orderId: order.id, amount: order.amount, currency: order.currency } });
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx vitest run src/routes/billing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts
git commit -m "fix(api): razorpay order price comes from the server catalog"
```

---

### Task 5: Verified gateway webhooks (Razorpay + Paystack) in a raw-body plugin

**Files:**
- Create: `apps/api/src/routes/billing-gateway-webhooks.ts`, `apps/api/src/routes/billing-gateway-webhooks.test.ts`
- Modify: `apps/api/src/routes/billing.ts` (delete the `razorpay/webhook` handler :303-337 and `paystack/webhook` handler :353-376; keep `getGatewayCredentials`, `activateManualSubscription`, which move to exports)
- Modify: `apps/api/src/routes/index.ts:85` (register new plugin)

**Interfaces:**
- Consumes: `isPaidAmountSufficient`, `isBillableTier` (Task 1).
- Produces: `billingGatewayWebhooksRouter: FastifyPluginAsync`; `export` the two helpers from billing.ts (`getGatewayCredentials`, `activateManualSubscription`) so the plugin imports them.

Rules (both gateways): parse body from raw Buffer; compute HMAC on raw bytes; reject (400) when signature header is missing or mismatched (timing-safe compare); only act on `payment.captured` / `charge.success`; manual-sub path unchanged (org-scoped lookup); plan path requires `isPaidAmountSufficient(planId, currency, amountMinorUnits)` else log and return 200 without changes.

- [ ] **Step 1: Write failing tests** (`billing-gateway-webhooks.test.ts`)

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createHmac } from "crypto";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  organization: { findUnique: vi.fn().mockResolvedValue({ settings: {} }), update: vi.fn() },
  vendorSetting: { findMany: vi.fn().mockResolvedValue([]) },
  manualSubscription: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  const { billingGatewayWebhooksRouter } = await import("./billing-gateway-webhooks.js");
  await app.register(billingGatewayWebhooksRouter, { prefix: "/v1" });
  return app;
}
const rzpBody = (amount: number, currency = "INR", planId = "starter") => JSON.stringify({
  event: "payment.captured",
  payload: { payment: { entity: { amount, currency, notes: { organizationId: "org-1", planId } } } },
});
const sign = (algo: "sha256" | "sha512", secret: string, raw: string) => createHmac(algo, secret).update(raw).digest("hex");

describe("razorpay webhook", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); process.env["RAZORPAY_WEBHOOK_SECRET"] = "rzp_secret"; app = await build(); });
  afterEach(async () => { await app.close(); });

  it("rejects a missing signature", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json" }, payload: rzpBody(99900) });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
  it("rejects a bad signature", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": "deadbeef" }, payload: rzpBody(99900) });
    expect(res.statusCode).toBe(400);
  });
  it("activates the plan for a correct signature and sufficient amount", async () => {
    const raw = rzpBody(99900);
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "rzp_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-1" }, data: expect.objectContaining({ planTier: "starter" }) }));
  });
  it("verifies on raw bytes even when whitespace differs from JSON.stringify", async () => {
    const raw = rzpBody(99900).replace(/,/g, ", ");
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "rzp_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
  });
  it("does NOT activate an underpaid order (returns 200)", async () => {
    const raw = rzpBody(100, "INR", "scale");
    const res = await app.inject({ method: "POST", url: "/v1/billing/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": sign("sha256", "rzp_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});

describe("paystack webhook", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); process.env["PAYSTACK_SECRET_KEY"] = "ps_secret"; app = await build(); });
  afterEach(async () => { await app.close(); });
  const body = (amount: number, currency: string) => JSON.stringify({ event: "charge.success", data: { amount, currency, metadata: { organizationId: "org-1", planId: "growth" } } });

  it("rejects a bad signature", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/paystack/webhook", headers: { "content-type": "application/json", "x-paystack-signature": "nope" }, payload: body(299900, "INR") });
    expect(res.statusCode).toBe(400);
  });
  it("fails closed for a non-catalogued currency", async () => {
    const raw = body(99999999, "NGN");
    const res = await app.inject({ method: "POST", url: "/v1/billing/paystack/webhook", headers: { "content-type": "application/json", "x-paystack-signature": sign("sha512", "ps_secret", raw) }, payload: raw });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/routes/billing-gateway-webhooks.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Export helpers from billing.ts**

Change `async function getGatewayCredentials` to `export async function getGatewayCredentials` and `async function activateManualSubscription` to `export async function activateManualSubscription`. Delete the two webhook handlers (:303-337 and :353-376) from `billingRouter`.

- [ ] **Step 4: Implement the plugin** (`billing-gateway-webhooks.ts`)

```ts
import type { FastifyPluginAsync } from "fastify";
import type { PlanTier, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { getGatewayCredentials, activateManualSubscription } from "./billing.js";
import { isBillableTier, isPaidAmountSufficient } from "../lib/billing/catalog.js";

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export const billingGatewayWebhooksRouter: FastifyPluginAsync = async (fastify) => {
  // Raw bytes so HMAC verification does not depend on JSON re-serialization.
  fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  function parse<T>(body: unknown): T | null {
    try { return JSON.parse((body as Buffer).toString("utf8")) as T; } catch { return null; }
  }

  // ── Razorpay ────────────────────────────────────────────────────────────
  type RzpEvent = { event?: string; payload?: { payment?: { entity?: { amount?: number; currency?: string; notes?: { organizationId?: string; planId?: string; manualSubId?: string } } } } };
  fastify.post("/billing/razorpay/webhook", { config: { public: true } }, async (request, reply) => {
    const signature = request.headers["x-razorpay-signature"];
    const event = parse<RzpEvent>(request.body);
    if (typeof signature !== "string" || !event) return reply.status(400).send({ error: "Invalid signature" });
    const entity = event.payload?.payment?.entity;
    const orgId = entity?.notes?.organizationId;
    let secret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
    if (orgId) {
      const creds = await getGatewayCredentials(fastify.prisma, orgId, "razorpay");
      secret = creds["razorpay_webhook_secret"] ?? secret;
    }
    const expected = createHmac("sha256", secret).update(request.body as Buffer).digest("hex");
    if (!secret || !safeEqualHex(signature, expected)) return reply.status(400).send({ error: "Invalid signature" });

    if (event.event === "payment.captured" && orgId && entity) {
      const { planId, manualSubId } = entity.notes ?? {};
      if (manualSubId) {
        const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
        if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
      } else if (isBillableTier(planId) && isPaidAmountSufficient(planId, entity.currency ?? "", entity.amount ?? NaN)) {
        const org = await fastify.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
        const existing = (org?.settings as Record<string, unknown>) ?? {};
        await fastify.prisma.organization.update({
          where: { id: orgId },
          data: {
            planTier: planId as PlanTier,
            settings: ({ ...existing, razorpayPlanId: planId, activatedAt: new Date().toISOString() } as Record<string, unknown>) as Prisma.InputJsonValue,
          },
        });
      } else if (planId) {
        fastify.log.warn({ orgId, planId, currency: entity.currency, amount: entity.amount }, "razorpay payment not activated: unknown plan or insufficient amount (manual review)");
      }
    }
    return reply.send({ received: true });
  });

  // ── Paystack ────────────────────────────────────────────────────────────
  type PsEvent = { event?: string; data?: { amount?: number; currency?: string; metadata?: { organizationId?: string; planId?: string; manualSubId?: string } } };
  fastify.post("/billing/paystack/webhook", { config: { public: true } }, async (request, reply) => {
    const hash = request.headers["x-paystack-signature"];
    const event = parse<PsEvent>(request.body);
    if (typeof hash !== "string" || !event) return reply.status(400).send({ error: "Invalid signature" });
    const orgId = event.data?.metadata?.organizationId;
    let secretKey = process.env["PAYSTACK_SECRET_KEY"] ?? "";
    if (orgId) {
      const creds = await getGatewayCredentials(fastify.prisma, orgId, "paystack");
      secretKey = creds["paystack_secret_key"] ?? secretKey;
    }
    const expected = createHmac("sha512", secretKey).update(request.body as Buffer).digest("hex");
    if (!secretKey || !safeEqualHex(hash, expected)) return reply.status(400).send({ error: "Invalid signature" });

    if (event.event === "charge.success" && orgId && event.data) {
      const { planId, manualSubId } = event.data.metadata ?? {};
      if (manualSubId) {
        const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
        if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
      } else if (isBillableTier(planId) && isPaidAmountSufficient(planId, event.data.currency ?? "", event.data.amount ?? NaN)) {
        await fastify.prisma.organization.update({ where: { id: orgId }, data: { planTier: planId as PlanTier } });
      } else if (planId) {
        fastify.log.warn({ orgId, planId, currency: event.data.currency, amount: event.data.amount }, "paystack payment not activated: unknown plan or insufficient amount (manual review)");
      }
    }
    return reply.send({ received: true });
  });
};
```

Register it: in `apps/api/src/routes/index.ts` add `import { billingGatewayWebhooksRouter } from "./billing-gateway-webhooks.js";` and, after line 85, `await fastify.register(billingGatewayWebhooksRouter, { prefix: "/v1" });`.

Note: `billing-gateway-webhooks.ts` imports from `./billing.js`, which imports `razorpay`/`stripe`; the test file must therefore also `vi.mock("../lib/stripe.js", ...)` and `vi.mock("razorpay", ...)` with the same stubs as billing.test.ts. Add them to the top of the new test file (same factory bodies as Task 2 Step 4, with `ZERO_DECIMAL_CURRENCIES` and `getStripe`).

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/api && npx vitest run src/routes/billing-gateway-webhooks.test.ts src/routes/billing.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes
git commit -m "fix(api): verify razorpay/paystack webhooks on raw body, require signature and sufficient amount"
```

---

### Task 6: YooMoney webhook verified by calling the gateway

**Files:**
- Modify: `apps/api/src/routes/billing-gateway-webhooks.ts` (add route), `apps/api/src/routes/billing.ts` (delete `yoomoney/webhook` :477-493)
- Test: `apps/api/src/routes/billing-gateway-webhooks.test.ts` (append)

YooKassa notifications are unsigned; the supported check is to fetch the payment (`GET https://api.yookassa.ru/v3/payments/{id}`) with shop credentials and trust only that response. Because the catalog has no RUB price, a verified RUB payment is NOT auto-activated; it is logged for manual review (fail closed) until the owner supplies RUB prices (see Open Questions).

**Interfaces:**
- Consumes: `getGatewayCredentials`, `isPaidAmountSufficient`, `isBillableTier`.

- [ ] **Step 1: Write failing tests**

```ts
describe("yoomoney webhook", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); process.env["YOOMONEY_SHOP_ID"] = "shop"; process.env["YOOMONEY_SECRET_KEY"] = "sk"; app = await build(); });
  afterEach(async () => { await app.close(); vi.unstubAllGlobals(); });
  const hook = JSON.stringify({ event: "payment.succeeded", object: { id: "pay-1", metadata: { organizationId: "org-1", planId: "starter" } } });

  it("ignores a forged notification when the gateway does not confirm the payment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const res = await app.inject({ method: "POST", url: "/v1/billing/yoomoney/webhook", headers: { "content-type": "application/json" }, payload: hook });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
  it("activates when gateway confirms a paid, sufficient INR payment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "pay-1", status: "succeeded", paid: true, amount: { value: "999.00", currency: "INR" }, metadata: { organizationId: "org-1", planId: "starter" } }) }));
    const res = await app.inject({ method: "POST", url: "/v1/billing/yoomoney/webhook", headers: { "content-type": "application/json" }, payload: hook });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: { planTier: "starter" } }));
  });
  it("does not auto-activate RUB payments (no catalog price)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "pay-1", status: "succeeded", paid: true, amount: { value: "99999.00", currency: "RUB" }, metadata: { organizationId: "org-1", planId: "starter" } }) }));
    const res = await app.inject({ method: "POST", url: "/v1/billing/yoomoney/webhook", headers: { "content-type": "application/json" }, payload: hook });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/routes/billing-gateway-webhooks.test.ts -t yoomoney`
Expected: FAIL (route not in plugin)

- [ ] **Step 3: Implement** (add inside the plugin; remove the old handler from billing.ts)

```ts
  // ── YooMoney / YooKassa (notifications are unsigned: confirm with the gateway) ──
  type YmEvent = { event?: string; object?: { id?: string; metadata?: { organizationId?: string } } };
  type YmPayment = { id?: string; status?: string; paid?: boolean; amount?: { value?: string; currency?: string }; metadata?: { organizationId?: string; planId?: string; manualSubId?: string } };
  fastify.post("/billing/yoomoney/webhook", { config: { public: true } }, async (request, reply) => {
    const event = parse<YmEvent>(request.body);
    const paymentId = event?.object?.id;
    const orgHint = event?.object?.metadata?.organizationId;
    if (event?.event !== "payment.succeeded" || !paymentId || !orgHint) return reply.send({ received: true });

    const creds = await getGatewayCredentials(fastify.prisma, orgHint, "yoomoney");
    const shopId = creds["yoomoney_shop_id"] ?? process.env["YOOMONEY_SHOP_ID"] ?? "";
    const secretKey = creds["yoomoney_secret_key"] ?? process.env["YOOMONEY_SECRET_KEY"] ?? "";
    if (!shopId || !secretKey) return reply.send({ received: true });

    let payment: YmPayment | null = null;
    try {
      const res = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}` },
      });
      if (res.ok) payment = (await res.json()) as YmPayment;
    } catch { /* gateway unreachable: treat as unconfirmed */ }
    if (!payment || payment.status !== "succeeded" || payment.paid !== true) return reply.send({ received: true });

    const orgId = payment.metadata?.organizationId;
    const { planId, manualSubId } = payment.metadata ?? {};
    if (!orgId || orgId !== orgHint) return reply.send({ received: true });
    if (manualSubId) {
      const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
      if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
    } else {
      const minor = Math.round(Number(payment.amount?.value ?? "NaN") * 100);
      if (isBillableTier(planId) && isPaidAmountSufficient(planId, payment.amount?.currency ?? "", minor)) {
        await fastify.prisma.organization.update({ where: { id: orgId }, data: { planTier: planId as PlanTier } });
      } else if (planId) {
        fastify.log.warn({ orgId, planId, currency: payment.amount?.currency }, "yoomoney payment not activated: unknown plan, currency or insufficient amount (manual review)");
      }
    }
    return reply.send({ received: true });
  });
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx vitest run src/routes/billing-gateway-webhooks.test.ts src/routes/billing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes
git commit -m "fix(api): confirm yoomoney payments with the gateway before activating a plan"
```

---

### Task 7: Stripe webhook URL fix + brand text

**Files:**
- Modify: `apps/api/src/routes/billing.ts` (`setup-webhook` :584; UPI QR :609-610; YooMoney description :434)
- Modify: `apps/api/src/routes/billing.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe("billing branding and webhook url", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
  it("setup-webhook registers the real stripe webhook path", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync(new URL("./billing.ts", import.meta.url), "utf8");
    expect(src).toContain("/v1/billing/webhook`");
    expect(src).not.toContain("/v1/billing/stripe/webhook");
  });
  it("has no TrustCRM text left in customer-facing billing strings", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync(new URL("./billing.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/TrustCRM/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/routes/billing.test.ts -t "branding"`
Expected: FAIL

- [ ] **Step 3: Implement**

- `billing.ts:584`: change to `url: \`${apiUrl.replace(/\/$/, "")}/v1/billing/webhook\`,`.
- `billing.ts:434`: change `TrustCRM Subscription` to `WBMSG Subscription`.
- `billing.ts:609-610`: change `TrustCRM ${...}` and `pn=TrustCRM` to `WBMSG ${...}` and `pn=WBMSG`.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx vitest run src/routes/billing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts
git commit -m "fix(api): correct stripe webhook url and remove legacy brand text"
```

---

### Task 8 (web): Fix the billing page and upgrade button

**Files:**
- Create: `apps/web/lib/billing-page.ts`, `apps/web/lib/billing-page.test.ts`
- Modify: `apps/web/app/(dashboard)/settings/billing/page.tsx`, `apps/web/app/(dashboard)/settings/billing/BillingClient.tsx`

**Interfaces:**
- Produces:
  - `type UsageRow = { key: string; label: string; used: number; limit: number | null }`
  - `type BillingUsage = { plan: string; rows: UsageRow[] }`
  - `normalizeUsage(raw: unknown): BillingUsage | null` accepts the current `{plan, gates}` shape, ignores unknown/old shapes (returns `{plan, rows: []}` when `plan` is present but `gates` is not), and `null` for non-objects.
  - `canViewBilling(user: CurrentUser | null): boolean` = `canAccessSub(user, "settings_access", "settings_billing")` from `lib/can.ts`.
- Consumes: `CurrentUser`, `canAccessSub` from `apps/web/lib/can.ts`.

- [ ] **Step 1: Write failing tests** (`billing-page.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { normalizeUsage, canViewBilling } from "./billing-page";

describe("normalizeUsage", () => {
  it("maps the current gates shape; null limit means unlimited", () => {
    const u = normalizeUsage({ plan: "starter", unavailableFeatures: [], gates: {
      contacts: { current: 100, limit: 500, allowed: true },
      campaigns: { current: 2, limit: null, allowed: true },
      ai_chat_bot: { enabled: true },
    } });
    expect(u?.plan).toBe("starter");
    expect(u?.rows).toEqual([
      { key: "contacts", label: "Contacts", used: 100, limit: 500 },
      { key: "campaigns", label: "Campaigns", used: 2, limit: null },
    ]);
  });
  it("tolerates the old/unknown shape and junk", () => {
    expect(normalizeUsage({ plan: "growth", usage: { contacts: 1 }, limits: {} })).toEqual({ plan: "growth", rows: [] });
    expect(normalizeUsage(null)).toBeNull();
    expect(normalizeUsage("x")).toBeNull();
    expect(normalizeUsage({ plan: "starter", gates: { contacts: { current: "a" } } })).toEqual({ plan: "starter", rows: [] });
  });
});

describe("canViewBilling", () => {
  const u = (role: string, permissions: Record<string, string> = {}) => ({ id: "1", fullName: "A", email: "a@b.c", role, permissions });
  it("allows admin and superAdmin", () => {
    expect(canViewBilling(u("admin"))).toBe(true);
    expect(canViewBilling(u("superAdmin"))).toBe(true);
  });
  it("allows a manager only with the sub permission", () => {
    expect(canViewBilling(u("manager"))).toBe(false);
    expect(canViewBilling(u("manager", { settings_access: "allow", "settings_access@settings_billing": "allow" }))).toBe(true);
  });
  it("denies a missing user", () => { expect(canViewBilling(null)).toBe(false); });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/web && npx vitest run lib/billing-page.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `billing-page.ts`**

```ts
import { canAccessSub, type CurrentUser } from "./can";

export interface UsageRow { key: string; label: string; used: number; limit: number | null }
export interface BillingUsage { plan: string; rows: UsageRow[] }

const GATE_LABELS: Record<string, string> = {
  contacts: "Contacts",
  campaigns: "Campaigns",
  chatbots: "Chatbots",
  flows: "Flows",
  custom_fields: "Custom fields",
  team_members: "Team members",
};

export function normalizeUsage(raw: unknown): BillingUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { plan?: unknown; gates?: unknown };
  const plan = typeof r.plan === "string" ? r.plan : "starter";
  const rows: UsageRow[] = [];
  if (r.gates && typeof r.gates === "object") {
    for (const [key, label] of Object.entries(GATE_LABELS)) {
      const g = (r.gates as Record<string, unknown>)[key];
      if (g && typeof g === "object") {
        const { current, limit } = g as { current?: unknown; limit?: unknown };
        if (typeof current === "number" && (typeof limit === "number" || limit === null)) {
          rows.push({ key, label, used: current, limit });
        }
      }
    }
  }
  return { plan, rows };
}

export function canViewBilling(user: CurrentUser | null): boolean {
  return canAccessSub(user, "settings_access", "settings_billing");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx vitest run lib/billing-page.test.ts`
Expected: PASS

- [ ] **Step 5: Wire `page.tsx`**

Replace the `UsageData` interface, `getUserRole`, and the role check:
- Import `{ normalizeUsage, canViewBilling } from "@/lib/billing-page"` and `type { CurrentUser } from "@/lib/can"`.
- Replace `getUserRole` with:

```ts
async function getCurrentUser(token: string): Promise<CurrentUser | null> {
  try {
    const res = await fetch(`${API_URL}/v1/users/me`, { headers: await serverApiHeaders(token), cache: "no-store" });
    return res.ok ? ((await res.json()) as { data: CurrentUser }).data : null;
  } catch { return null; }
}
```

- In `BillingPage`: `const user = await getCurrentUser(token); if (!canViewBilling(user)) redirect("/settings");`
- Fetch usage as `fetchJson<unknown>(...)` and pass `usage={normalizeUsage(rawUsage)}`.

Behavior note: a failed `/users/me` still redirects (user null). That matches the prior fail-closed behavior, but the failure no longer masquerades as "role = agent".

- [ ] **Step 6: Update `BillingClient.tsx`**

- Import `type { BillingUsage }` from `@/lib/billing-page`; delete the local `UsageData`; `Props.usage: BillingUsage | null`.
- `Plan.limits` keeps `contacts` only in the rendering; replace lines 143-144 with `{p.limits.contacts ? \`${p.limits.contacts.toLocaleString()} contacts\` : "Unlimited contacts"}` (message allowances are not enforced, so they must not be advertised).
- Replace lines 122-123 with `{usage.rows.map((r) => <UsageBar key={r.key} used={r.used} limit={r.limit} label={r.label} />)}`.
- Add a `subscribe(tier)` function and replace the `<a href=".../checkout...">` (line 163) with a button:

```tsx
  async function subscribe(tier: string) {
    setSwitching(tier);
    const token = await getToken();
    const here = `${window.location.origin}/settings/billing`;
    const res = await fetch(`${API_URL}/v1/billing/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ planTier: tier, successUrl: `${here}?status=success`, cancelUrl: here }),
    });
    setSwitching(null);
    if (res.ok) {
      const json = await res.json() as { data: { url: string } };
      window.location.href = json.data.url;
    }
  }
```

```tsx
<button onClick={() => { void subscribe(p.tier); }} disabled={switching === p.tier}
  className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
  {switching === p.tier ? "Redirecting…" : "Subscribe"}
</button>
```

- Leave `mailto:sales@trustcrm.in` unchanged and list it under Open Questions (the correct sales address is not in the repo).

- [ ] **Step 7: Type-check and test**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run lib/billing-page.test.ts`
Expected: no type errors; PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/billing-page.ts apps/web/lib/billing-page.test.ts "apps/web/app/(dashboard)/settings/billing"
git commit -m "fix(web): billing page renders with current usage shape, permission gate, working subscribe"
```

---

### Task 9: Verify, audit, document

- [ ] **Step 1: Security audit (required by project rules)** for every touched route; record result in the final report:
  - `GET /billing/subscriptions`, `GET /billing/transactions`, `POST /billing/checkout`, `/manual/submit-proof`, `/manual/cancel-request`, `/razorpay/create-order`: `organizationId` from `request.auth`, `settings_billing` enforced.
  - `/manual/:id/approve|reject`: `superAdmin` only (cross-org by design; platform action).
  - Webhooks: public by design; signature (Razorpay/Paystack) or gateway confirmation (YooMoney); org taken from signed/confirmed payload, manual-sub lookup filtered by that org.
- [ ] **Step 2:** `/check` (lint + type-check), `/test-api`, `/test-web`. Report any failure other than the 2 known flaky API tests.
- [ ] **Step 3:** Update `docs/prd-usage-billing.md`: Phase 0 note that `WebhookEvent` and Stripe `Transaction` rows moved to Phase 1; section 9 note that `role === "admin"` is the ordinary customer org-admin role (`apps/api/src/lib/permissions.ts:20`), so P3 was exploitable by any org admin.
- [ ] **Step 4: Pre-deploy checklist (owner/ops, not code):**
  1. `WEB_PUBLIC_URL` set on Railway to `https://wbmsg.com` (checkout fails closed with 400 `INVALID_REDIRECT` otherwise; also add `https://www.wbmsg.com` handling if that host is used).
  2. `RAZORPAY_WEBHOOK_SECRET` / `PAYSTACK_SECRET_KEY` set (webhooks now reject when the secret is empty).
  3. In Stripe dashboard, confirm the registered webhook points at `/v1/billing/webhook`.
  4. Check mobile app and any API clients for calls to approve/reject/submit-proof before release (not verified here).
- [ ] **Step 5:** Finish branch by merging locally (`superpowers:finishing-a-development-branch`, option 1). Save lasting facts to memory (billing model decision, PRD path, Phase 0 findings).

---

## Open Questions (need owner answers; recommended default in brackets)

1. Correct sales contact address to replace `sales@trustcrm.in` [provide the real address; left unchanged until then].
2. RUB (and Paystack NGN/GHS/ZAR) plan prices so those payments can auto-activate [until provided they are logged for manual review, not activated].
3. Yearly Razorpay checkout: the catalog has no yearly price, so `___yearly` is rejected [confirm nobody uses it, or supply yearly prices].
4. Who approves manual proofs in practice: no admin UI exists for it in `apps/web` (grep found none) [add an `/admin` approvals screen in Phase 3, or call the API by hand meanwhile].

## Self-review

- Spec coverage: P1 (Task 8), P2 (Task 8 subscribe), P3 (Task 3), P4 (Tasks 4, 5, 6), P5 (Tasks 5, 6), P7 and P11 (Task 7), P8 (Tasks 2, 3). P6, P9, P10 and the pricing model are Phases 1-4 by design.
- Placeholders: none; open questions are owner decisions, not plan gaps.
- Type consistency: `isBillableTier`, `isPaidAmountSufficient`, `PLAN_CATALOG`, `getGatewayCredentials`, `activateManualSubscription`, `normalizeUsage`, `canViewBilling` are defined once and used with the same signatures.
- Known limitation: the Task 3 `requireBilling` helper's loose structural types may need adjusting to the repo's Fastify types when implemented; run `/check` and prefer inline `canAccessSub` checks (as the existing handlers do) if it fights the compiler.
