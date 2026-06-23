# Roles & Permissions Auth-Engine Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the RBAC engine deterministic and secure — role comes from the DB only (never Clerk), unconfigured roles fall back to built-in defaults, and enforcement is deny-by-default.

**Architecture:** Clerk = identity only. `User.role` (DB) is authoritative. Permission resolution: `role_permissions_<role>` VendorSetting row if **present** (used exactly, even `{}` = deny all) else `DEFAULT_ROLE_PERMISSIONS[role]`, merged with per-user `OrganizationMember.permissions`. `canAccess`/`canAccessSub` are admin-bypass + deny-by-default.

**Tech Stack:** Fastify 4, TypeScript (ESM, `.js` import extensions), Prisma 7, Redis, Vitest, Next.js 15 (frontend mirror).

**Reference:** `docs/prd-roles-and-permissions.md` (the governing PRD).

## Global Constraints

- API is ESM-only — use `.js` extensions in imports even for `.ts` source.
- TypeScript strict — no `any`, no implicit returns.
- All Prisma queries scoped by `organizationId`.
- Permission keys must come **only** from the canonical catalog in PRD §5. No `manage_*` / `add_edit_*` legacy keys.
- `admin` and `superAdmin` bypass all permission checks.
- Fallback decision keys off **row presence** (`row === null`), never on whether the parsed object is empty.
- Run `pnpm --filter @WBMSG/api type-check` and `pnpm --filter @WBMSG/api test` before considering any API task done; `pnpm --filter @WBMSG/web type-check` for frontend tasks.
- **Task ordering dependency:** Task 3 (deny-by-default) MUST ship together with Task 2 (default fallback). Deploying Task 3 without Task 2 would lock out every org that has no `role_permissions_*` rows.

---

### Task 1: Remove Clerk-role dependency from the auth engine (D11)

Clerk JWT must prove identity only. Strip `org_role` reading and the on-request auto-promote.

**Files:**
- Modify: `apps/api/src/lib/clerk.ts`
- Modify: `apps/api/src/plugins/auth.ts:24-32, 89-104`

**Interfaces:**
- Produces: `verifyClerkToken(authHeader) -> Promise<{ userId: string }>` (identity only).

- [ ] **Step 1: Revert `verifyClerkToken` to identity-only**

In `apps/api/src/lib/clerk.ts`, change the signature and return:

```typescript
import { verifyToken } from "@clerk/backend";

export async function verifyClerkToken(authHeader: string | undefined): Promise<{ userId: string }> {
  if (!authHeader) throw new Error("Missing Authorization header");
  if (!authHeader.startsWith("Bearer ")) throw new Error("Invalid Authorization header format");

  const token = authHeader.slice(7);
  if (!token) throw new Error("Empty token");

  const payload = await verifyToken(token, {
    secretKey: process.env["CLERK_SECRET_KEY"] ?? "",
  });

  return { userId: payload.sub };
}
```

- [ ] **Step 2: Stop reading `orgRole` in auth.ts**

In `apps/api/src/plugins/auth.ts`, change the destructure (around line 24-27) from:

```typescript
    let userId: string;
    let orgRole: string | null;
    try {
      ({ userId, orgRole } = await verifyClerkToken(request.headers.authorization));
    } catch {
```

to:

```typescript
    let userId: string;
    try {
      ({ userId } = await verifyClerkToken(request.headers.authorization));
    } catch {
```

- [ ] **Step 3: Remove the JWT auto-sync block**

In `apps/api/src/plugins/auth.ts`, delete the auto-sync block (around line 89-96):

```typescript
    // Auto-sync: if Clerk JWT says org:admin but DB has a non-admin role, promote now.
    // Fixes users whose DB record existed before the webhook ran (default role = "agent").
    let effectiveRole = user.role;
    if (orgRole === "org:admin" && !["admin", "superAdmin"].includes(user.role)) {
      effectiveRole = "admin";
      void fastify.prisma.user.updateMany({ where: { id: userId }, data: { role: "admin" } })
        .catch((err: unknown) => fastify.log.warn({ err }, "Failed to auto-sync admin role from Clerk JWT"));
    }
```

Then replace the two later uses of `effectiveRole` with `user.role`:

```typescript
    await redis.setex(
      cacheKey,
      AUTH_CACHE_TTL,
      JSON.stringify({ role: user.role, organizationId: user.organizationId, permissions })
    );

    request.auth = { userId, organizationId: user.organizationId, role: user.role, permissions };
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: zero errors (note `permissions` resolution still references the old block below it — that's replaced in Task 2; if type-check fails only because `permissions` is now defined after this edit, proceed to Task 2 in the same branch before running tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/clerk.ts apps/api/src/plugins/auth.ts
git commit -m "fix(auth): remove Clerk JWT role dependency — role is DB-only (D11)"
```

---

### Task 2: Presence-based default-role fallback in resolution (D2/D3)

When an org has no `role_permissions_<role>` row, fall back to built-in defaults. When the row exists, use it exactly (even `{}`).

**Files:**
- Modify: `apps/api/src/lib/default-role-permissions.ts`
- Modify: `apps/api/src/plugins/auth.ts:73-87`

**Interfaces:**
- Consumes: `DEFAULT_ROLE_PERMISSIONS` (existing).
- Produces: `defaultsForRole(role: string) -> Record<string, string>`.

- [ ] **Step 1: Add `defaultsForRole` helper**

In `apps/api/src/lib/default-role-permissions.ts`, after the `RoleKey` type, add:

```typescript
/**
 * Built-in baseline permissions for a role. Used only when an org has NO
 * `role_permissions_<role>` VendorSetting row. Returns {} for roles with no
 * baseline (e.g. superAdmin — which bypasses all checks anyway).
 */
export function defaultsForRole(role: string): Record<string, string> {
  return DEFAULT_ROLE_PERMISSIONS[role as RoleKey] ?? {};
}
```

- [ ] **Step 2: Use presence-based fallback in auth.ts**

In `apps/api/src/plugins/auth.ts`, add the import at the top with the other lib imports:

```typescript
import { defaultsForRole } from "../lib/default-role-permissions.js";
```

Then replace the role-defaults resolution block (currently around line 73-87):

```typescript
    const roleSettingRow = await fastify.prisma.vendorSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: user.organizationId,
          key: `role_permissions_${user.role}`,
        },
      },
      select: { value: true },
    });
    let roleDefaults: Record<string, string> = {};
    if (roleSettingRow?.value) {
      try { roleDefaults = JSON.parse(roleSettingRow.value) as Record<string, string>; } catch { /* corrupted row — treat as empty */ }
    }
    const memberPermissions = (member?.permissions ?? {}) as Record<string, string>;
    const permissions = { ...roleDefaults, ...memberPermissions };
```

with:

```typescript
    const roleSettingRow = await fastify.prisma.vendorSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: user.organizationId,
          key: `role_permissions_${user.role}`,
        },
      },
      select: { value: true },
    });
    // Row PRESENT → use exactly what's stored (even {} = deny all).
    // Row ABSENT → fall back to built-in role defaults.
    let roleBaseline: Record<string, string>;
    if (roleSettingRow === null) {
      roleBaseline = defaultsForRole(user.role);
    } else {
      try {
        roleBaseline = JSON.parse(roleSettingRow.value ?? "{}") as Record<string, string>;
      } catch {
        roleBaseline = {}; // row exists but corrupted — intentional write, treat as deny-all
      }
    }
    const memberPermissions = (member?.permissions ?? {}) as Record<string, string>;
    const permissions = { ...roleBaseline, ...memberPermissions };
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/default-role-permissions.ts apps/api/src/plugins/auth.ts
git commit -m "fix(auth): fall back to default role permissions when no config row (D2/D3)"
```

---

### Task 3: Deny-by-default enforcement (D1) + deprecate legacy helpers

Remove the "empty permissions = open access" branch. Safe now because Task 2 guarantees a non-admin role always resolves to a real baseline.

**Files:**
- Modify: `apps/api/src/lib/permissions.ts`
- Create: `apps/api/src/lib/permissions.test.ts`

**Interfaces:**
- Produces: `canAccess(role, perms, key)`, `canAccessSub(role, perms, parent, sub)` — admin bypass, else deny-by-default.

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/lib/permissions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { canAccess, canAccessSub } from "./permissions.js";

describe("canAccess", () => {
  it("admin and superAdmin bypass all checks", () => {
    expect(canAccess("admin", {}, "contacts_access")).toBe(true);
    expect(canAccess("superAdmin", {}, "anything")).toBe(true);
  });

  it("non-admin with empty permissions is denied (deny-by-default)", () => {
    expect(canAccess("agent", {}, "contacts_access")).toBe(false);
  });

  it("non-admin allowed only when key === allow", () => {
    expect(canAccess("agent", { contacts_access: "allow" }, "contacts_access")).toBe(true);
    expect(canAccess("agent", { contacts_access: "deny" }, "contacts_access")).toBe(false);
    expect(canAccess("agent", { other: "allow" }, "contacts_access")).toBe(false);
  });
});

describe("canAccessSub", () => {
  it("admin bypasses", () => {
    expect(canAccessSub("admin", {}, "contacts_access", "contacts_export")).toBe(true);
  });

  it("denies when parent not allowed", () => {
    expect(canAccessSub("agent", { "contacts_access@contacts_export": "allow" }, "contacts_access", "contacts_export")).toBe(false);
  });

  it("allows only when parent AND sub are allow", () => {
    const perms = { contacts_access: "allow", "contacts_access@contacts_export": "allow" };
    expect(canAccessSub("agent", perms, "contacts_access", "contacts_export")).toBe(true);
  });

  it("denies when sub missing even if parent allowed", () => {
    expect(canAccessSub("agent", { contacts_access: "allow" }, "contacts_access", "contacts_export")).toBe(false);
  });

  it("non-admin with empty permissions is denied", () => {
    expect(canAccessSub("agent", {}, "contacts_access", "contacts_export")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @WBMSG/api test -- permissions.test`
Expected: FAIL — "non-admin with empty permissions is denied" currently returns `true` (the bug).

- [ ] **Step 3: Remove the empty-open branch**

In `apps/api/src/lib/permissions.ts`, replace `canAccess`:

```typescript
// admin/superAdmin bypass all checks. Everyone else is deny-by-default: the
// parent key must be explicitly "allow". The auth layer guarantees every
// non-admin role resolves to its DEFAULT_ROLE_PERMISSIONS baseline (or an
// explicit stored config), so an unconfigured org no longer grants blanket access.
export function canAccess(
  role: string,
  permissions: Record<string, string>,
  key: string
): boolean {
  if (role === "admin" || role === "superAdmin") return true;
  return permissions[key] === "allow";
}
```

and replace `canAccessSub`:

```typescript
// Parent must be "allow" AND the explicit sub-permission must be "allow".
// admin/superAdmin bypass. Deny-by-default for everyone else.
export function canAccessSub(
  role: string,
  permissions: Record<string, string>,
  parentKey: string,
  subKey: string
): boolean {
  if (role === "admin" || role === "superAdmin") return true;
  if (permissions[parentKey] !== "allow") return false;
  return permissions[`${parentKey}@${subKey}`] === "allow";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @WBMSG/api test -- permissions.test`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full API test suite (guard against regressions)**

Run: `pnpm --filter @WBMSG/api test`
Expected: PASS. Existing route tests use `role: "admin"` (bypass), so they remain green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/permissions.ts apps/api/src/lib/permissions.test.ts
git commit -m "fix(auth): deny-by-default in canAccess/canAccessSub (D1) + tests"
```

---

### Task 4: `GET /roles/permissions` returns defaults when row absent (D4)

So the Roles page grid shows real defaults for unconfigured roles instead of an empty grid.

**Files:**
- Modify: `apps/api/src/routes/roles.ts:19-38`

**Interfaces:**
- Consumes: `defaultsForRole` (Task 2).

- [ ] **Step 1: Use presence-based defaults in the GET handler**

In `apps/api/src/routes/roles.ts`, add the import near the top:

```typescript
import { defaultsForRole } from "../lib/default-role-permissions.js";
```

Then in the `GET /roles/permissions` handler, replace the `data` mapping:

```typescript
    const data = Object.fromEntries(
      VALID_ROLES.map((r) => {
        const row = settings.find((s) => s.key === settingKey(r));
        let permissions: Record<string, string>;
        if (!row) {
          permissions = defaultsForRole(r); // no row → show built-in defaults
        } else {
          try {
            permissions = JSON.parse(row.value ?? "{}") as Record<string, string>;
          } catch {
            permissions = {}; // corrupted stored row
          }
        }
        return [r, permissions];
      })
    ) as Record<RoleKey, Record<string, string>>;
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/roles.ts
git commit -m "fix(roles): GET returns default baseline for unconfigured roles (D4)"
```

---

### Task 5: Upsert `OrganizationMember` for per-user overrides (D5)

`PUT /users/:id/permissions` currently 404s because the member row never exists. Upsert it.

**Files:**
- Modify: `apps/api/src/routes/users.ts:162-180`

- [ ] **Step 1: Replace find+update with upsert**

In `apps/api/src/routes/users.ts`, replace the `PUT /users/:id/permissions` handler body:

```typescript
  fastify.put<{ Params: { id: string }; Body: { permissions: Record<string, string> } }>(
    "/users/:id/permissions",
    async (request, reply) => {
      const { organizationId, role } = request.auth;
      if (role !== "admin" && role !== "superAdmin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can update permissions" } });
      }

      // The target user must belong to this org.
      const target = await fastify.prisma.user.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true, role: true },
      });
      if (!target) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Team member not found" } });
      }

      const data = await fastify.prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId: request.params.id } },
        create: {
          organizationId,
          userId: request.params.id,
          role: target.role,
          permissions: request.body.permissions,
        },
        update: { permissions: request.body.permissions },
      });

      await invalidateAuthCache(request.params.id);
      return reply.send({ data });
    }
  );
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: zero errors (the `organizationId_userId` compound unique exists on `OrganizationMember`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/users.ts
git commit -m "fix(users): upsert OrganizationMember so per-user overrides work (D5)"
```

---

### Task 6: Webhook role from invitation, never Clerk role (onboarding)

Drop the `org:admin → admin` Clerk mapping; default to `agent` when no invitation.

**Files:**
- Modify: `apps/api/src/routes/clerk-webhook.ts:114-115`

- [ ] **Step 1: Replace the Clerk-role mapping with a plain default**

In `apps/api/src/routes/clerk-webhook.ts`, inside the `organizationMembership.created` handler, replace:

```typescript
        const dbRole =
          role === "org:admin" ? "admin" : "agent";
```

with:

```typescript
        // Role comes from our invitation flow, never from Clerk's org role.
        // `agent` is only a safety-net default for a membership with no invitation.
        void role; // Clerk org role intentionally ignored
        const dbRole = "agent";
```

The existing `create`/`update` already use `role: invitation ? invitation.role : dbRole`, so no further change is needed there.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/clerk-webhook.ts
git commit -m "fix(webhook): assign role from invitation, default agent — ignore Clerk role"
```

---

### Task 7: Remove stale-key checks in chatbots.ts (D7) + drop dead helpers

`hasSubPermission("manage_bot_replies", …)` uses keys outside the catalog and always passes. The outer `canAccessSub(automation_access, automation_bot_flows)` already enforces.

**Files:**
- Modify: `apps/api/src/routes/chatbots.ts:3, 41-43, 68-70`
- Modify: `apps/api/src/lib/permissions.ts` (remove now-unused `hasPermission`, `hasSubPermission`)

- [ ] **Step 1: Remove the dead inner checks and the import**

In `apps/api/src/routes/chatbots.ts`, change the import (line 3) from:

```typescript
import { canAccessSub, hasSubPermission } from "../lib/permissions.js";
```

to:

```typescript
import { canAccessSub } from "../lib/permissions.js";
```

Delete the PATCH inner check (lines ~41-43):

```typescript
      if (!hasSubPermission(permissions, "manage_bot_replies", "add_edit_bot_replies")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "add_edit_bot_replies permission required" } });
      }
```

Delete the DELETE inner check (lines ~68-70):

```typescript
    if (!hasSubPermission(permissions, "manage_bot_replies", "delete_bot_replies")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "delete_bot_replies permission required" } });
    }
```

- [ ] **Step 2: Verify no remaining callers of the legacy helpers**

Run: `pnpm --filter @WBMSG/api exec grep -rn "hasSubPermission\|hasPermission" src/ || true`
Expected: no matches outside `permissions.ts` itself. (If any remain, migrate them to `canAccess`/`canAccessSub` before continuing.)

- [ ] **Step 3: Remove the dead helpers from permissions.ts**

In `apps/api/src/lib/permissions.ts`, delete `hasPermission` and `hasSubPermission`:

```typescript
// GAP-S58: parent permissions require explicit "allow"; absent = deny
export function hasPermission(permissions: Record<string, string>, key: string): boolean {
  return permissions[key] === "allow";
}

// GAP-S58: sub-permissions (format: "parent@sub") default to allow; explicit "deny" blocks
export function hasSubPermission(permissions: Record<string, string>, parentKey: string, subKey: string): boolean {
  const subValue = permissions[`${parentKey}@${subKey}`];
  return subValue !== "deny";
}
```

Leave `maskPhone`, `maskEmail`, `shouldHideField` in place (masking is deferred — D8).

- [ ] **Step 4: Type-check + test**

Run: `pnpm --filter @WBMSG/api type-check && pnpm --filter @WBMSG/api test`
Expected: zero type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbots.ts apps/api/src/lib/permissions.ts
git commit -m "refactor(auth): drop stale chatbots keys and unused legacy permission helpers (D6/D7)"
```

---

### Task 8: Align frontend helpers to deny-by-default

Mirror the backend: remove the empty-open branch in `can.ts`. Safe because the backend now always returns a populated permission set for non-admins.

**Files:**
- Modify: `apps/web/lib/can.ts`

- [ ] **Step 1: Remove empty-open from `canAccess` and `canAccessSub`**

In `apps/web/lib/can.ts`, replace `canAccess`:

```typescript
/** Mirrors apps/api/src/lib/permissions.ts — keep in sync. */
export function canAccess(user: CurrentUser | null | undefined, key: string): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "superAdmin") return true;
  return (user.permissions ?? {})[key] === "allow";
}
```

and replace `canAccessSub`:

```typescript
export function canAccessSub(
  user: CurrentUser | null | undefined,
  parentKey: string,
  subKey: string
): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "superAdmin") return true;
  const perms = user.permissions ?? {};
  if (perms[parentKey] !== "allow") return false;
  return perms[`${parentKey}@${subKey}`] === "allow";
}
```

Leave `hasSubPermission`, `isAdmin`, `isManagerOrAbove` as-is (still referenced by UI).

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @WBMSG/web type-check`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/can.ts
git commit -m "fix(web): deny-by-default in can.ts to mirror backend engine"
```

---

### Task 9: One-time data fix — ensure every org has an admin

Promote each org's creator (oldest active user) to `admin` where the org currently has no `admin`/`superAdmin`. Repairs orgs (like `registeredAt: null`) whose creator was stuck as `agent` before this change.

**Files:**
- Create: `apps/api/scripts/fix-missing-org-admins.mjs`

- [ ] **Step 1: Write the script**

Create `apps/api/scripts/fix-missing-org-admins.mjs` (follows the existing `backfill-role-permissions.mjs` pattern):

```javascript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
let fixed = 0;

for (const org of orgs) {
  const hasAdmin = await prisma.user.findFirst({
    where: { organizationId: org.id, isActive: true, role: { in: ['admin', 'superAdmin'] } },
    select: { id: true },
  });
  if (hasAdmin) continue;

  // Promote the oldest active user as the org creator/owner.
  const creator = await prisma.user.findFirst({
    where: { organizationId: org.id, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!creator) {
    console.log(`- ${org.id} (${org.name}) — no active users, skipped`);
    continue;
  }

  await prisma.user.update({ where: { id: creator.id }, data: { role: 'admin' } });
  fixed++;
  console.log(`✓ ${org.id} (${org.name}) — promoted ${creator.email} to admin`);
}

await prisma.$disconnect();
console.log(`\nDone. Promoted ${fixed} org creator(s).`);
console.log('Note: auth cache TTL is 60s — affected users may need up to 1 minute, or re-login.');
```

- [ ] **Step 2: Dry-run review**

Read the script once more and confirm it only **promotes** (never demotes) and only acts on orgs with **no** admin. Do not run automatically — running against production is a manual operator step (`node apps/api/scripts/fix-missing-org-admins.mjs` with `DATABASE_URL` set).

- [ ] **Step 3: Commit**

```bash
git add apps/api/scripts/fix-missing-org-admins.mjs
git commit -m "chore(scripts): one-off fix to ensure every org has an admin"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full type-check + tests across touched packages**

Run:
```bash
pnpm --filter @WBMSG/api type-check
pnpm --filter @WBMSG/api test
pnpm --filter @WBMSG/web type-check
```
Expected: all green.

- [ ] **Step 2: Manual verification matrix**

Confirm against PRD §12 acceptance criteria:
- Org with **no** `role_permissions_agent` row → an `agent` is limited to the agent **defaults** (not everything, not nothing).
- Org with explicitly saved `role_permissions_agent = {}` → that `agent` is denied every guarded action.
- `admin` retains full access regardless of stored config.
- `PUT /users/:id/permissions` succeeds for a user with no prior member row, and `/users/me` reflects the override.
- Roles page grid shows populated defaults for unconfigured roles.

- [ ] **Step 3: Run the one-off data fix in production** (operator step)

```bash
DATABASE_URL=... node apps/api/scripts/fix-missing-org-admins.mjs
```

---

## Notes on what is intentionally NOT in scope

- **Masking (D8):** `shouldHideField` and `hide_phone_number@hide_contact_fields` enforcement are deferred. `shouldHideField` is left in place but unused; do not wire it up here.
- **`verifyToken` authorizedParties (D10):** optional hardening, deferred.
- **Webhook seeding of defaults:** not needed — read-time fallback (Task 2) covers existing and new orgs.
