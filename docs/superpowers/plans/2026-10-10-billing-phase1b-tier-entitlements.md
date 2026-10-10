# Billing Phase 1B (Tier Entitlements, Shadow-First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an organization's plan tier actually determine its limits and feature switches, without surprising existing customers: off by default, then log-only "shadow" mode, then enforcement for new organizations only.

**Architecture:** All enforcement already flows through two functions in `apps/api/src/lib/plan-limits.ts` (`checkPlanLimit`, `isFeatureEnabled`), so the change lives there. A pure tier table (`lib/billing/plans.ts`) and a mode resolver (`lib/billing/entitlement-mode.ts`) feed them. Per-org `VendorSetting` platform overrides still win over the tier table. No route, signature or response shape changes.

**Tech Stack:** TypeScript, Prisma, Vitest.

**Spec:** `docs/prd-billing-phase1.md` (sections 3.1, 3.2, 6 criterion 5). Independent of Plan 1A except that it uses the same `BILLING_V2_ENABLED` flag helper (`apps/api/src/lib/billing/flags.ts`, created in Plan 1A Task 1). If 1A Task 1 is not merged yet, implement that file first exactly as written in 1A.

## Global Constraints

- Branch `feat/billing-phase1` in worktree `E:\Product\WhatsApp_CRM-billing`. Never touch `E:\Product\WhatsApp_CRM`.
- No Prisma schema change in this plan.
- Flags off (`BILLING_V2_ENABLED` not exactly `"true"`) => `checkPlanLimit` and `isFeatureEnabled` must behave **byte-for-byte as today**, with **zero extra database queries** (existing route tests mock Prisma narrowly and must not change).
- `GET /v1/billing/usage`, the analytics plan block and every `402 PLAN_LIMIT_REACHED` response shape stay unchanged.
- Tier values below are the owner-approved **placeholders** (spec section 8, decision 1); they live in one table so they can be edited in one place.
- Shadow logs contain organization id, entity, current and limit only. Never log secrets or message content.
- Known flaky: 2 pre-existing API failures (`segments.test.ts`) and Redis-rejection noise.

## Review Focus

- Org with an existing `plan_limit_*` row: the row wins in every mode (platform override), including `-1` = unlimited.
- Tier value `null` means unlimited; `0` means none allowed (blocks the first item when enforcing).
- Shadow mode never changes the returned `allowed`/`limit` values, only logs; an org over its tier limit still gets `allowed: true` in shadow mode.
- Feature switches in shadow mode return today's value (false without a row) and log what enforce would do; enforce returns the tier value.
- Org created before `BILLING_ENTITLEMENTS_ENFORCE_AFTER` stays shadow even when enforce is on.
- Unknown/invalid env values fail safe (treated as not enforcing).
- Organization not found, or `planTier` unexpected: fall back to today's behavior, no throw.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/api/src/lib/billing/plans.ts` (new) + test | Tier table and accessors (pure) |
| `apps/api/src/lib/billing/entitlement-mode.ts` (new) + test | `off` / `shadow` / `enforce` resolver (pure) |
| `apps/api/src/lib/plan-limits.ts` (modify) | Use the two modules; same exports and signatures |
| `apps/api/src/lib/plan-limits.test.ts` (new) | Behaviour matrix incl. flags-off regression |

Run API tests with `cd apps/api && npx vitest run <files>`; type-check with `cd apps/api && npx tsc --noEmit 2>&1 | grep -E "<touched paths>"` (slow, up to 10 minutes).

---

### Task 1: Tier table

**Files:**
- Create: `apps/api/src/lib/billing/plans.ts`, `apps/api/src/lib/billing/plans.test.ts`

**Interfaces:**
- Produces:

```ts
export type LimitEntity = "contacts" | "campaigns" | "chatbots" | "flows" | "custom_fields" | "team_members";
export type FeatureKey = "ai_chat_bot" | "api_access";
export interface TierDefinition { limits: Record<LimitEntity, number | null>; features: Record<FeatureKey, boolean> } // null = unlimited
export const TIER_DEFINITIONS: Record<"starter" | "growth" | "scale" | "enterprise", TierDefinition>
export function isKnownTier(v: unknown): v is keyof typeof TIER_DEFINITIONS
export function tierLimit(tier: string, entity: LimitEntity): number | null | undefined   // undefined = unknown tier
export function tierFeature(tier: string, feature: FeatureKey): boolean | undefined       // undefined = unknown tier
```

- [ ] **Step 1: Write the failing tests** (`plans.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { TIER_DEFINITIONS, isKnownTier, tierLimit, tierFeature } from "./plans.js";
import { PLAN_LIMITS } from "../stripe.js";

describe("tier table", () => {
  it("contacts limits match the advertised PLAN_LIMITS (starter/growth/scale)", () => {
    for (const t of ["starter", "growth", "scale"] as const) {
      expect(tierLimit(t, "contacts")).toBe(PLAN_LIMITS[t]!.contacts);
    }
  });
  it("enterprise is unlimited with every feature on", () => {
    for (const e of ["contacts", "campaigns", "chatbots", "flows", "custom_fields", "team_members"] as const) {
      expect(tierLimit("enterprise", e)).toBeNull();
    }
    expect(tierFeature("enterprise", "ai_chat_bot")).toBe(true);
    expect(tierFeature("enterprise", "api_access")).toBe(true);
  });
  it("limits never decrease as the tier goes up (null = unlimited counts as highest)", () => {
    const order = ["starter", "growth", "scale", "enterprise"] as const;
    const rank = (v: number | null | undefined) => (v === null ? Infinity : (v as number));
    for (const e of Object.keys(TIER_DEFINITIONS.starter.limits) as (keyof typeof TIER_DEFINITIONS.starter.limits)[]) {
      for (let i = 1; i < order.length; i++) {
        expect(rank(tierLimit(order[i]!, e))).toBeGreaterThanOrEqual(rank(tierLimit(order[i - 1]!, e)));
      }
    }
  });
  it("features never turn off as the tier goes up", () => {
    const order = ["starter", "growth", "scale", "enterprise"] as const;
    for (const f of ["ai_chat_bot", "api_access"] as const) {
      for (let i = 1; i < order.length; i++) {
        expect(Number(tierFeature(order[i]!, f))).toBeGreaterThanOrEqual(Number(tierFeature(order[i - 1]!, f)));
      }
    }
  });
  it("returns undefined for unknown tiers and rejects prototype keys", () => {
    expect(tierLimit("nope", "contacts")).toBeUndefined();
    expect(tierFeature("nope", "api_access")).toBeUndefined();
    expect(isKnownTier("__proto__")).toBe(false);
    expect(isKnownTier("growth")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/billing/plans.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `plans.ts`**

```ts
export type LimitEntity = "contacts" | "campaigns" | "chatbots" | "flows" | "custom_fields" | "team_members";
export type FeatureKey = "ai_chat_bot" | "api_access";

export interface TierDefinition {
  limits: Record<LimitEntity, number | null>; // null = unlimited
  features: Record<FeatureKey, boolean>;
}

// Owner-approved PLACEHOLDER values (docs/prd-billing-phase1.md section 8). Edit here only.
export const TIER_DEFINITIONS = {
  starter: {
    limits: { contacts: 500, campaigns: 5, chatbots: 1, flows: 3, custom_fields: 5, team_members: 2 },
    features: { ai_chat_bot: false, api_access: false },
  },
  growth: {
    limits: { contacts: 5000, campaigns: 50, chatbots: 5, flows: 20, custom_fields: 25, team_members: 5 },
    features: { ai_chat_bot: true, api_access: true },
  },
  scale: {
    limits: { contacts: 50000, campaigns: null, chatbots: null, flows: null, custom_fields: null, team_members: 20 },
    features: { ai_chat_bot: true, api_access: true },
  },
  enterprise: {
    limits: { contacts: null, campaigns: null, chatbots: null, flows: null, custom_fields: null, team_members: null },
    features: { ai_chat_bot: true, api_access: true },
  },
} as const satisfies Record<string, TierDefinition>;

export function isKnownTier(v: unknown): v is keyof typeof TIER_DEFINITIONS {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TIER_DEFINITIONS, v);
}

export function tierLimit(tier: string, entity: LimitEntity): number | null | undefined {
  return isKnownTier(tier) ? TIER_DEFINITIONS[tier].limits[entity] : undefined;
}

export function tierFeature(tier: string, feature: FeatureKey): boolean | undefined {
  return isKnownTier(tier) ? TIER_DEFINITIONS[tier].features[feature] : undefined;
}
```

- [ ] **Step 4: Run to verify pass, type-check, commit**

Run: `cd apps/api && npx vitest run src/lib/billing/plans.test.ts` (PASS) and the tsc filter on `lib/billing`.

```bash
git add apps/api/src/lib/billing/plans.ts apps/api/src/lib/billing/plans.test.ts
git commit -m "feat(api): tier entitlement table"
```

---

### Task 2: Entitlement mode resolver

**Files:**
- Create: `apps/api/src/lib/billing/entitlement-mode.ts`, `apps/api/src/lib/billing/entitlement-mode.test.ts`

**Interfaces:**
- Consumes: `isBillingV2Enabled` from `./flags.js`.
- Produces: `export type EntitlementMode = "off" | "shadow" | "enforce"` and `export function resolveEntitlementMode(org: { createdAt: Date } | null, env?: NodeJS.ProcessEnv): EntitlementMode`.

Rules: `off` when `BILLING_V2_ENABLED` is not `"true"` **or the org is null**; `shadow` when `BILLING_ENTITLEMENTS_ENFORCE` is not exactly `"true"`; when enforcing, if `BILLING_ENTITLEMENTS_ENFORCE_AFTER` is a valid ISO date and `org.createdAt` is before it => `shadow` (grandfathered); an invalid date string => `shadow` (fail safe); otherwise `enforce`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { resolveEntitlementMode } from "./entitlement-mode.js";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const org = (iso: string) => ({ createdAt: new Date(iso) });

describe("resolveEntitlementMode", () => {
  it("is off without the V2 flag, or without an org", () => {
    expect(resolveEntitlementMode(org("2026-01-01"), env({}))).toBe("off");
    expect(resolveEntitlementMode(org("2026-01-01"), env({ BILLING_ENTITLEMENTS_ENFORCE: "true" }))).toBe("off");
    expect(resolveEntitlementMode(null, env({ BILLING_V2_ENABLED: "true" }))).toBe("off");
  });
  it("is shadow when V2 is on but enforcement is not exactly true", () => {
    for (const v of [undefined, "", "1", "TRUE", "false"]) {
      const e = env({ BILLING_V2_ENABLED: "true", ...(v === undefined ? {} : { BILLING_ENTITLEMENTS_ENFORCE: v }) });
      expect(resolveEntitlementMode(org("2026-01-01"), e)).toBe("shadow");
    }
  });
  it("enforces when on, with no cutover date", () => {
    expect(resolveEntitlementMode(org("2026-01-01"), env({ BILLING_V2_ENABLED: "true", BILLING_ENTITLEMENTS_ENFORCE: "true" }))).toBe("enforce");
  });
  it("grandfathers orgs created before the cutover and enforces newer ones", () => {
    const e = env({ BILLING_V2_ENABLED: "true", BILLING_ENTITLEMENTS_ENFORCE: "true", BILLING_ENTITLEMENTS_ENFORCE_AFTER: "2026-11-01T00:00:00Z" });
    expect(resolveEntitlementMode(org("2026-10-31T23:59:59Z"), e)).toBe("shadow");
    expect(resolveEntitlementMode(org("2026-11-01T00:00:00Z"), e)).toBe("enforce");
  });
  it("treats an invalid cutover date as shadow (fail safe)", () => {
    const e = env({ BILLING_V2_ENABLED: "true", BILLING_ENTITLEMENTS_ENFORCE: "true", BILLING_ENTITLEMENTS_ENFORCE_AFTER: "not-a-date" });
    expect(resolveEntitlementMode(org("2027-01-01"), e)).toBe("shadow");
  });
});
```

- [ ] **Step 2: Run to verify fail**, then **Step 3: implement**

```ts
import { isBillingV2Enabled } from "./flags.js";

export type EntitlementMode = "off" | "shadow" | "enforce";

export function resolveEntitlementMode(org: { createdAt: Date } | null, env: NodeJS.ProcessEnv = process.env): EntitlementMode {
  if (!org || !isBillingV2Enabled(env)) return "off";
  if (env["BILLING_ENTITLEMENTS_ENFORCE"] !== "true") return "shadow";
  const cutoverRaw = env["BILLING_ENTITLEMENTS_ENFORCE_AFTER"];
  if (cutoverRaw) {
    const cutover = new Date(cutoverRaw);
    if (Number.isNaN(cutover.getTime())) return "shadow";
    if (org.createdAt.getTime() < cutover.getTime()) return "shadow";
  }
  return "enforce";
}
```

- [ ] **Step 4: Run to verify pass, type-check, commit**

Run: `cd apps/api && npx vitest run src/lib/billing/entitlement-mode.test.ts` (PASS).

```bash
git add apps/api/src/lib/billing/entitlement-mode.ts apps/api/src/lib/billing/entitlement-mode.test.ts
git commit -m "feat(api): entitlement mode resolver with shadow and grandfather cutover"
```

---

### Task 3: Wire `checkPlanLimit` and `isFeatureEnabled`

**Files:**
- Modify: `apps/api/src/lib/plan-limits.ts`
- Create: `apps/api/src/lib/plan-limits.test.ts`

**Interfaces:**
- Consumes: `tierLimit`, `tierFeature`, `LimitEntity`, `FeatureKey` (Task 1), `resolveEntitlementMode` (Task 2).
- Produces: unchanged exports `checkPlanLimit(prisma, organizationId, entity)` and `isFeatureEnabled(prisma, organizationId, feature)` with unchanged return types (`{ allowed, limit, current }` where `limit` is `-1` for unlimited, and `boolean`).

Behaviour (existing code stays as the base path):
- Existing lookup: `VendorSetting` row for the key.
- Mode `off`: return exactly what the existing code returns, **no organization query**.
- Otherwise load `organization.findUnique({ where: { id }, select: { planTier: true, createdAt: true } })` once and resolve the mode. Organization missing => behave as `off`.
- **Limits.** Effective limit = existing row value if a row exists (parse as today; negative/NaN means unlimited) else `tierLimit(planTier, entity)` (`null` => unlimited, `undefined` => unlimited, i.e. unknown tier fails open).
  - Mode `enforce`: return `{ allowed: current < effective, limit: effective (or -1 for unlimited), current }`.
  - Mode `shadow`: return today's result (unlimited when no row) and, if `current >= tierLimit` (tier limit is a number), log `console.warn("[entitlements] shadow_block", { organizationId, entity, current, limit })`.
- **Features.** Existing row value if a row exists. Without a row: `enforce` returns `tierFeature(planTier, feature) ?? false`; `shadow` returns `false` (today) and, when the tier would turn it on, logs `console.warn("[entitlements] shadow_enable", { organizationId, feature })`; `off` returns `false`.
- Never throws because of the new code: wrap the organization lookup in try/catch and fall back to `off` behaviour on any error.

- [ ] **Step 1: Write the failing tests** (`plan-limits.test.ts`; Prisma mock with `vendorSetting.findFirst`, `organization.findUnique`, `contact.count`, `campaign.count`, `chatbot.count`, `flow.count`, `contactCustomField.count`, `user.count`; set env in `beforeEach`, restore in `afterEach`; reset persistent mocks in `beforeEach`)

Cases:
1. **Flags off, no row** => `{ allowed: true, limit: -1, current: N }` and `organization.findUnique` NOT called (assert zero calls). Flags off, row `"5"`, current 5 => `allowed: false, limit: 5`. Row `"-1"` and row `"abc"` => unlimited. (This block is the regression guard: values identical to the current implementation.)
2. **Feature flags off**: `plan_feature_api_access = "1"` => true; no row => false; `organization.findUnique` not called.
3. **Shadow** (`BILLING_V2_ENABLED=true`, enforce unset): starter org with 6 campaigns and no row => returns `allowed: true, limit: -1` and `console.warn` called with `"[entitlements] shadow_block"` and `{ organizationId: "org-1", entity: "campaigns", current: 6, limit: 5 }`; an org under its tier limit logs nothing.
4. **Shadow feature**: growth org, no row, `api_access` => returns false and logs `shadow_enable`; starter org => false and no log.
5. **Enforce** (`BILLING_ENTITLEMENTS_ENFORCE=true`): starter org with 5 campaigns, no row => `allowed: false, limit: 5`; with 4 => `allowed: true, limit: 5`; scale org, `campaigns` => `limit: -1, allowed: true`; enterprise unlimited; unknown tier => unlimited.
6. **Override wins in enforce**: starter org, row `plan_limit_campaigns = "100"` with 50 campaigns => `allowed: true, limit: 100`; row `"-1"` => unlimited; row `"2"` with 2 => `allowed: false`.
7. **Feature enforce**: growth, no row => true; starter => false; row `"0"`/`"false"`-like value => the existing parse rule (`"1"`/`"true"` true, anything else false) applies to the row and wins.
8. **Grandfather**: enforce on with `BILLING_ENTITLEMENTS_ENFORCE_AFTER=2026-11-01T00:00:00Z`; org created 2026-10-01 => behaves as shadow (unlimited, logs); org created 2026-11-02 => enforced.
9. **Fail safe**: `organization.findUnique` returning `null` or rejecting => today's behaviour, no throw.

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx vitest run src/lib/plan-limits.test.ts`
Expected: FAIL (cases 3-9; the case-1/2 regression cases may already pass, which is the point)

- [ ] **Step 3: Implement.** Keep `countEntity`, `SETTING_KEY` and the row parsing as they are. Skeleton for the new `checkPlanLimit` (the `isFeatureEnabled` change follows the same shape):

```ts
async function loadOrgForEntitlements(prisma: PrismaClient, organizationId: string) {
  try {
    return await prisma.organization.findUnique({ where: { id: organizationId }, select: { planTier: true, createdAt: true } });
  } catch {
    return null;
  }
}

export async function checkPlanLimit(prisma: PrismaClient, organizationId: string, entity: LimitEntity) {
  const setting = await prisma.vendorSetting.findFirst({ where: { organizationId, key: SETTING_KEY[entity] }, select: { value: true } });
  const current = await countEntity(prisma, entity, organizationId);

  const hasRow = setting !== null && setting !== undefined; // any VendorSetting row is a platform override, even with a null value (today that means unlimited)
  const rowLimit = parseInt(setting?.value ?? "-1", 10);
  const today = (): { allowed: boolean; limit: number; current: number } =>
    isNaN(rowLimit) || rowLimit < 0 ? { allowed: true, limit: -1, current } : { allowed: current < rowLimit, limit: rowLimit, current };

  if (!isBillingV2Enabled()) return today(); // no extra queries when the flag is off
  const org = await loadOrgForEntitlements(prisma, organizationId);
  const mode = resolveEntitlementMode(org);
  if (mode === "off" || !org) return today();

  if (hasRow) return today(); // platform per-org override always wins
  const tier = tierLimit(org.planTier, entity); // number | null | undefined
  if (mode === "shadow") {
    if (typeof tier === "number" && current >= tier) {
      console.warn("[entitlements] shadow_block", { organizationId, entity, current, limit: tier });
    }
    return today();
  }
  if (typeof tier !== "number") return { allowed: true, limit: -1, current }; // unlimited or unknown tier
  return { allowed: current < tier, limit: tier, current };
}
```

Keep the existing "row present but unparsable => unlimited" behaviour exactly (`today()`). For `isFeatureEnabled`: compute `rowValue` as today; if a row exists return today's boolean; else follow the feature rules above. Import `isBillingV2Enabled` from `./billing/flags.js`.

- [ ] **Step 4: Run to verify pass, then regressions**

Run: `cd apps/api && npx vitest run src/lib/plan-limits.test.ts src/routes/analytics.test.ts src/routes/invitations.test.ts src/routes/campaigns.test.ts src/routes/chatbots.test.ts src/routes/flows.test.ts src/routes/contacts.test.ts src/routes/billing.test.ts`
Expected: PASS (they run with the flag off, so Prisma mocks need no change; if one fails because it now sees an extra query, the flag-off path is wrong: fix the code, not the test).

- [ ] **Step 5: Type-check and commit**

```bash
git add apps/api/src/lib/plan-limits.ts apps/api/src/lib/plan-limits.test.ts
git commit -m "feat(api): tier-derived limits and features with shadow and enforce modes"
```

---

### Task 4: Verify, audit, document

- [ ] **Step 1: Audit.** No routes were added or changed; confirm by `git diff --stat` that only `lib/` files changed. Confirm every `checkPlanLimit` call site still passes `organizationId` from `request.auth` (grep results listed in the plan: campaigns, chatbots, contacts, custom-fields, flows, invitations, analytics, billing) and that no new log line contains anything beyond ids and counts.
- [ ] **Step 2:** Run the full API suite (`cd apps/api && npx vitest run`; expect only the 2 known `segments.test.ts` failures), eslint on the touched files, tsc filter on `lib/billing|lib/plan-limits`.
- [ ] **Step 3: Docs.** In `docs/prd-billing-phase1.md` add the rollout runbook: (1) deploy with `BILLING_V2_ENABLED` unset => no change; (2) set `BILLING_V2_ENABLED=true` => shadow logging only (search logs for `[entitlements] shadow_block` / `shadow_enable` for 30 days); (3) set `BILLING_ENTITLEMENTS_ENFORCE=true` and `BILLING_ENTITLEMENTS_ENFORCE_AFTER=<cutover ISO date>` to enforce for orgs created on or after that date; (4) editing tier values = one table in `lib/billing/plans.ts`. Record that the AI-bot and API-access features are OFF by default today for orgs without a row, so enabling enforce turns them ON for growth/scale/enterprise orgs created after the cutover.
- [ ] **Step 4:** Finish the branch (`superpowers:finishing-a-development-branch`): ask before merging to `main`; do not push.

---

## Open Questions (owner; default in brackets)

1. Approve or edit the placeholder tier table in Task 1 before enforcement is ever switched on [placeholders as written; enforcement stays off until you confirm].
2. Cutover date for `BILLING_ENTITLEMENTS_ENFORCE_AFTER` [set at the time you decide to enforce].
3. Read-only production query to see which orgs already have `plan_limit_*`/`plan_feature_*` rows and the org count per tier before enabling shadow mode [yes, needs your explicit approval].

## Self-review

- Spec coverage: 3.1 (Tasks 1, 3), 3.2 (Tasks 2, 3), criterion 5 (Task 3 cases 1-9). Spec 3.3-3.5 are Plan 1A.
- Placeholders: none; tier values are explicit owner-approved placeholders in a single table.
- Type consistency: `LimitEntity`, `FeatureKey`, `tierLimit`, `tierFeature`, `resolveEntitlementMode`, `EntitlementMode` are defined once and used with the same signatures. `LimitEntity` is currently also declared locally in `plan-limits.ts`: replace that local type with the import to avoid two definitions.
- Known risk: flags-off path must add no queries; the regression cases in Task 3 assert that explicitly.
