# Role Permissions — Seed on Registration & Auth Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed default role permissions for every new org at registration, backfill existing orgs, and merge role defaults with per-user overrides in the auth plugin so permissions are actually enforced.

**Architecture:** A shared `default-role-permissions.ts` constant is the single source of truth. `register.ts` uses it to `createMany` VendorSetting rows on new-org creation. The auth plugin loads the role's VendorSetting row on cache miss and merges it with per-user `OrganizationMember.permissions` (user overrides win). `roles.ts` invalidates user auth caches when role defaults change. A backfill script covers existing orgs.

**Tech Stack:** Fastify 4 (ESM, `.js` imports), Prisma (`vendorSetting.createMany`, `vendorSetting.findUnique`), ioredis (`redis.del`), Vitest (mocks via `vi.mock`).

---

## Files

| Action | Path |
|---|---|
| Create | `apps/api/src/lib/default-role-permissions.ts` |
| Create | `apps/api/src/routes/register.test.ts` |
| Modify | `apps/api/src/routes/register.ts` |
| Create | `apps/api/scripts/backfill-role-permissions.mjs` |
| Modify | `apps/api/src/plugins/auth.test.ts` |
| Modify | `apps/api/src/plugins/auth.ts` |
| Modify | `apps/api/src/routes/roles.test.ts` |
| Modify | `apps/api/src/routes/roles.ts` |

---

## Task 1: Create default-role-permissions constant

**Files:**
- Create: `apps/api/src/lib/default-role-permissions.ts`

- [ ] **Step 1: Create `apps/api/src/lib/default-role-permissions.ts`**

```ts
export type RoleKey = "admin" | "manager" | "agent" | "viewer";

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Record<string, string>> = {
  admin: {
    contacts_access: "allow",
    "contacts_access@contacts_export": "allow",
    "contacts_access@contacts_add": "allow",
    "contacts_access@contacts_delete": "allow",
    "contacts_access@contacts_bulk_tag": "allow",
    "contacts_access@contacts_import": "allow",
    "contacts_access@contacts_manage_custom_fields": "allow",
    hide_phone_number: "allow",
    "hide_phone_number@hide_contact_fields": "allow",
    inbox_access: "allow",
    "inbox_access@inbox_all_conversations": "allow",
    "inbox_access@inbox_unassigned": "allow",
    "inbox_access@assigned_chats_only": "allow",
    campaigns_access: "allow",
    "campaigns_access@campaigns_create": "allow",
    "campaigns_access@campaigns_export_report": "allow",
    "campaigns_access@campaigns_custom_reports": "allow",
    "campaigns_access@campaigns_manage_segments": "allow",
    templates_access: "allow",
    "templates_access@templates_ai_buttons": "allow",
    "templates_access@templates_create": "allow",
    "templates_access@templates_edit": "allow",
    "templates_access@templates_delete": "allow",
    settings_access: "allow",
    "settings_access@settings_agents": "allow",
    "settings_access@settings_whatsapp": "allow",
    "settings_access@settings_api_key": "allow",
    "settings_access@settings_billing": "allow",
    "settings_access@settings_tags": "allow",
    analytics_access: "allow",
    "analytics_access@analytics_export": "allow",
    "analytics_access@analytics_agent_performance": "allow",
    automation_access: "allow",
    "automation_access@automation_export_report": "allow",
    "automation_access@automation_welcome_message": "allow",
    "automation_access@automation_bot_flows": "allow",
    "automation_access@automation_bot_replies": "allow",
  },

  manager: {
    contacts_access: "allow",
    "contacts_access@contacts_export": "allow",
    "contacts_access@contacts_add": "allow",
    "contacts_access@contacts_bulk_tag": "allow",
    "contacts_access@contacts_import": "allow",
    inbox_access: "allow",
    "inbox_access@inbox_all_conversations": "allow",
    "inbox_access@inbox_unassigned": "allow",
    campaigns_access: "allow",
    "campaigns_access@campaigns_create": "allow",
    "campaigns_access@campaigns_export_report": "allow",
    "campaigns_access@campaigns_manage_segments": "allow",
    templates_access: "allow",
    "templates_access@templates_create": "allow",
    "templates_access@templates_edit": "allow",
    settings_access: "allow",
    "settings_access@settings_agents": "allow",
    "settings_access@settings_tags": "allow",
    analytics_access: "allow",
    "analytics_access@analytics_export": "allow",
    "analytics_access@analytics_agent_performance": "allow",
    automation_access: "allow",
    "automation_access@automation_export_report": "allow",
    "automation_access@automation_welcome_message": "allow",
    "automation_access@automation_bot_replies": "allow",
  },

  agent: {
    contacts_access: "allow",
    "contacts_access@contacts_add": "allow",
    inbox_access: "allow",
    "inbox_access@inbox_unassigned": "allow",
    "inbox_access@assigned_chats_only": "allow",
    templates_access: "allow",
  },

  viewer: {
    contacts_access: "allow",
    inbox_access: "allow",
    "inbox_access@inbox_all_conversations": "allow",
    campaigns_access: "allow",
    templates_access: "allow",
    analytics_access: "allow",
    automation_access: "allow",
  },
};
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/default-role-permissions.ts
git commit -m "feat(api): add default role permissions constant"
```

---

## Task 2: Seed defaults at org registration (TDD)

**Files:**
- Create: `apps/api/src/routes/register.test.ts`
- Modify: `apps/api/src/routes/register.ts`

- [ ] **Step 1: Create `apps/api/src/routes/register.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerRouter } from "./register.js";

const mockVerifyClerkToken = vi.fn();
vi.mock("../lib/clerk.js", () => ({ verifyClerkToken: mockVerifyClerkToken }));

const mockPrisma = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  organization: { create: vi.fn(), update: vi.fn() },
  vendorSetting: { createMany: vi.fn() },
};

async function buildApp() {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  await app.register(registerRouter);
  return app;
}

describe("POST /register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyClerkToken.mockResolvedValue({ userId: "user-new" });
    mockPrisma.organization.create.mockResolvedValue({ id: "org-new" });
    mockPrisma.user.create.mockResolvedValue({});
    mockPrisma.vendorSetting.createMany.mockResolvedValue({ count: 4 });
  });

  it("seeds default role permissions for new org", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null); // new user
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/register",
      headers: { authorization: "Bearer test-token" },
      payload: { companyName: "ACME", industry: "Tech", revenue: "1M" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.vendorSetting.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ organizationId: "org-new", key: "role_permissions_admin" }),
        expect.objectContaining({ organizationId: "org-new", key: "role_permissions_manager" }),
        expect.objectContaining({ organizationId: "org-new", key: "role_permissions_agent" }),
        expect.objectContaining({ organizationId: "org-new", key: "role_permissions_viewer" }),
      ]),
      skipDuplicates: true,
    });
    expect(mockPrisma.vendorSetting.createMany).toHaveBeenCalledTimes(1);
  });

  it("does not seed role permissions on existing-org update", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ organizationId: "org-existing", role: "admin" });
    mockPrisma.organization.update.mockResolvedValue({});
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/register",
      headers: { authorization: "Bearer test-token" },
      payload: { companyName: "ACME Updated", industry: "Tech", revenue: "2M" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.vendorSetting.createMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- register.test
```

Expected: FAIL — `createMany` not called (not implemented yet).

- [ ] **Step 3: Modify `apps/api/src/routes/register.ts`**

Add the import after the existing import at the top of the file:

```ts
import { DEFAULT_ROLE_PERMISSIONS } from "../lib/default-role-permissions.js";
```

Then, inside the `else` block (new org creation path), immediately after `organizationId = org.id;` and before the closing `}` of the else block, insert:

```ts
        await fastify.prisma.vendorSetting.createMany({
          data: (Object.entries(DEFAULT_ROLE_PERMISSIONS) as [string, Record<string, string>][]).map(
            ([role, perms]) => ({
              organizationId,
              key: `role_permissions_${role}`,
              value: JSON.stringify(perms),
            })
          ),
          skipDuplicates: true,
        });
```

The full `else` block after the change (for reference):

```ts
      } else {
        // First-time: create org + user
        const org = await fastify.prisma.organization.create({
          data: {
            name: companyName,
            website: companyWebsite,
            location: companyLocation,
            industry,
            subCategory,
            revenue,
            registeredAt: new Date(),
            settings: {
              website: companyWebsite,
              location: companyLocation,
              industry,
              subCategory,
              revenue,
              registeredAt: new Date().toISOString(),
            },
          },
        });
        organizationId = org.id;

        // GAP-S02: if vendor activation is required, start inactive until superAdmin approves
        const requireActivation = process.env["REQUIRE_VENDOR_ACTIVATION"] === "true";
        await fastify.prisma.user.create({
          data: {
            id: userId,
            organizationId,
            email,
            fullName,
            role: "admin",
            isActive: !requireActivation,
          },
        });

        await fastify.prisma.vendorSetting.createMany({
          data: (Object.entries(DEFAULT_ROLE_PERMISSIONS) as [string, Record<string, string>][]).map(
            ([role, perms]) => ({
              organizationId,
              key: `role_permissions_${role}`,
              value: JSON.stringify(perms),
            })
          ),
          skipDuplicates: true,
        });
      }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test -- register.test
```

Expected: all 2 tests pass.

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/register.ts apps/api/src/routes/register.test.ts
git commit -m "feat(api): seed default role permissions on org registration"
```

---

## Task 3: Create backfill script

**Files:**
- Create: `apps/api/scripts/backfill-role-permissions.mjs`

This is a standalone script — no automated test. Run it once against the DB to verify it works.

- [ ] **Step 1: Create `apps/api/scripts/backfill-role-permissions.mjs`**

```js
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Default permissions — kept inline so the script is self-contained
const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    contacts_access: 'allow',
    'contacts_access@contacts_export': 'allow',
    'contacts_access@contacts_add': 'allow',
    'contacts_access@contacts_delete': 'allow',
    'contacts_access@contacts_bulk_tag': 'allow',
    'contacts_access@contacts_import': 'allow',
    'contacts_access@contacts_manage_custom_fields': 'allow',
    hide_phone_number: 'allow',
    'hide_phone_number@hide_contact_fields': 'allow',
    inbox_access: 'allow',
    'inbox_access@inbox_all_conversations': 'allow',
    'inbox_access@inbox_unassigned': 'allow',
    'inbox_access@assigned_chats_only': 'allow',
    campaigns_access: 'allow',
    'campaigns_access@campaigns_create': 'allow',
    'campaigns_access@campaigns_export_report': 'allow',
    'campaigns_access@campaigns_custom_reports': 'allow',
    'campaigns_access@campaigns_manage_segments': 'allow',
    templates_access: 'allow',
    'templates_access@templates_ai_buttons': 'allow',
    'templates_access@templates_create': 'allow',
    'templates_access@templates_edit': 'allow',
    'templates_access@templates_delete': 'allow',
    settings_access: 'allow',
    'settings_access@settings_agents': 'allow',
    'settings_access@settings_whatsapp': 'allow',
    'settings_access@settings_api_key': 'allow',
    'settings_access@settings_billing': 'allow',
    'settings_access@settings_tags': 'allow',
    analytics_access: 'allow',
    'analytics_access@analytics_export': 'allow',
    'analytics_access@analytics_agent_performance': 'allow',
    automation_access: 'allow',
    'automation_access@automation_export_report': 'allow',
    'automation_access@automation_welcome_message': 'allow',
    'automation_access@automation_bot_flows': 'allow',
    'automation_access@automation_bot_replies': 'allow',
  },
  manager: {
    contacts_access: 'allow',
    'contacts_access@contacts_export': 'allow',
    'contacts_access@contacts_add': 'allow',
    'contacts_access@contacts_bulk_tag': 'allow',
    'contacts_access@contacts_import': 'allow',
    inbox_access: 'allow',
    'inbox_access@inbox_all_conversations': 'allow',
    'inbox_access@inbox_unassigned': 'allow',
    campaigns_access: 'allow',
    'campaigns_access@campaigns_create': 'allow',
    'campaigns_access@campaigns_export_report': 'allow',
    'campaigns_access@campaigns_manage_segments': 'allow',
    templates_access: 'allow',
    'templates_access@templates_create': 'allow',
    'templates_access@templates_edit': 'allow',
    settings_access: 'allow',
    'settings_access@settings_agents': 'allow',
    'settings_access@settings_tags': 'allow',
    analytics_access: 'allow',
    'analytics_access@analytics_export': 'allow',
    'analytics_access@analytics_agent_performance': 'allow',
    automation_access: 'allow',
    'automation_access@automation_export_report': 'allow',
    'automation_access@automation_welcome_message': 'allow',
    'automation_access@automation_bot_replies': 'allow',
  },
  agent: {
    contacts_access: 'allow',
    'contacts_access@contacts_add': 'allow',
    inbox_access: 'allow',
    'inbox_access@inbox_unassigned': 'allow',
    'inbox_access@assigned_chats_only': 'allow',
    templates_access: 'allow',
  },
  viewer: {
    contacts_access: 'allow',
    inbox_access: 'allow',
    'inbox_access@inbox_all_conversations': 'allow',
    campaigns_access: 'allow',
    templates_access: 'allow',
    analytics_access: 'allow',
    automation_access: 'allow',
  },
};

// Find all orgs
const allOrgs = await prisma.organization.findMany({ select: { id: true } });

// Find orgs that already have at least one role_permissions_* row
const existing = await prisma.vendorSetting.findMany({
  where: { key: { startsWith: 'role_permissions_' } },
  select: { organizationId: true },
  distinct: ['organizationId'],
});
const seededOrgIds = new Set(existing.map((r) => r.organizationId));

const toBackfill = allOrgs.filter((o) => !seededOrgIds.has(o.id));
console.log(
  `${allOrgs.length} total orgs — ${seededOrgIds.size} already seeded — ${toBackfill.length} need backfill`
);

for (const org of toBackfill) {
  const data = Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, perms]) => ({
    organizationId: org.id,
    key: `role_permissions_${role}`,
    value: JSON.stringify(perms),
  }));
  await prisma.vendorSetting.createMany({ data, skipDuplicates: true });
  console.log(`✓ ${org.id} — seeded ${Object.keys(DEFAULT_ROLE_PERMISSIONS).length} roles`);
}

await prisma.$disconnect();
console.log('\nDone.');
```

- [ ] **Step 2: Run against local DB to verify**

From `apps/api/` directory:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/wbmsg" node scripts/backfill-role-permissions.mjs
```

Expected output (varies by local DB state):
```
N total orgs — M already seeded — K need backfill
✓ <org-id> — seeded 4 roles    (one line per org backfilled)
Done.
```

If it prints `0 need backfill`, all orgs are already covered — that's correct.

- [ ] **Step 3: Commit**

```bash
git add apps/api/scripts/backfill-role-permissions.mjs
git commit -m "feat(api): add backfill script for role permissions"
```

---

## Task 4: Merge role defaults in auth plugin (TDD)

**Files:**
- Modify: `apps/api/src/plugins/auth.test.ts`
- Modify: `apps/api/src/plugins/auth.ts`

The existing `auth.test.ts` has three tests using a shared `beforeAll` app. Extend it with a new `describe` block that tests the permission merge behaviour. The new block uses its own Fastify instance to control mocks per-test.

- [ ] **Step 1: Extend `apps/api/src/plugins/auth.test.ts`**

Add a redis mock at the top of the file (after the existing `vi.mock` calls) and extend the prisma mock to include `vendorSetting`. Then append the new describe block at the bottom.

Replace the existing prisma mock block:

```ts
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue({ role: "admin", organizationId: "org_123" }),
    },
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue({ permissions: {} }),
    },
    loginLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $disconnect: vi.fn(),
  },
}));
```

With:

```ts
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue({ role: "admin", organizationId: "org_123" }),
    },
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue({ permissions: {} }),
    },
    vendorSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    loginLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $disconnect: vi.fn(),
  },
}));
```

Also add this redis mock immediately after the existing `vi.mock` blocks (before the `describe` block):

```ts
vi.mock("../lib/redis.js", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
  },
}));
```

Then append this new describe block at the bottom of the file (after the closing `}` of the existing describe):

```ts
describe("auth plugin — permission merge", () => {
  async function buildMergeApp() {
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    const app = Fastify({ logger: false });
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/probe", async (req) => ({
      permissions: req.auth.permissions,
    }));
    await app.ready();
    return app;
  }

  it("uses empty permissions when no role defaults and no member permissions", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null);

    const app = await buildMergeApp();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ permissions: Record<string, string> }>().permissions).toEqual({});
    await app.close();
  });

  it("uses role defaults when member has no individual overrides", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce({
      value: JSON.stringify({ inbox_access: "allow", contacts_access: "allow" }),
    } as never);

    const app = await buildMergeApp();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(res.json<{ permissions: Record<string, string> }>().permissions).toEqual({
      inbox_access: "allow",
      contacts_access: "allow",
    });
    await app.close();
  });

  it("per-user override wins over role default on conflict", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "agent", organizationId: "org-1" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce({
      permissions: { contacts_access: "deny" },
    } as never);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce({
      value: JSON.stringify({ inbox_access: "allow", contacts_access: "allow" }),
    } as never);

    const app = await buildMergeApp();
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    const { permissions } = res.json<{ permissions: Record<string, string> }>();
    expect(permissions["contacts_access"]).toBe("deny");  // override wins
    expect(permissions["inbox_access"]).toBe("allow");    // role default preserved
    await app.close();
  });

  it("queries vendorSetting with correct org and role key", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ role: "manager", organizationId: "org-42" } as never);
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.vendorSetting.findUnique).mockResolvedValueOnce(null);

    const app = await buildMergeApp();
    await app.inject({
      method: "GET",
      url: "/probe",
      headers: { authorization: "Bearer tok" },
    });

    expect(vi.mocked(prisma.vendorSetting.findUnique)).toHaveBeenCalledWith({
      where: {
        organizationId_key: { organizationId: "org-42", key: "role_permissions_manager" },
      },
      select: { value: true },
    });
    await app.close();
  });
});
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test -- auth.test
```

Expected: the 4 new "permission merge" tests FAIL (vendorSetting not loaded yet); the existing 3 tests still pass.

- [ ] **Step 3: Modify `apps/api/src/plugins/auth.ts`**

Replace the section starting with `const member = await fastify.prisma.organizationMember...` through to `request.auth = ...` (currently lines 55–67). The new block:

```ts
    const member = await fastify.prisma.organizationMember.findFirst({
      where: { userId, organizationId: user.organizationId },
      select: { permissions: true },
    });

    const roleSettingRow = await fastify.prisma.vendorSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: user.organizationId,
          key: `role_permissions_${user.role}`,
        },
      },
      select: { value: true },
    });
    const roleDefaults: Record<string, string> = roleSettingRow?.value
      ? (JSON.parse(roleSettingRow.value) as Record<string, string>)
      : {};
    const memberPermissions = (member?.permissions ?? {}) as Record<string, string>;
    const permissions = { ...roleDefaults, ...memberPermissions };

    await redis.setex(
      cacheKey,
      AUTH_CACHE_TTL,
      JSON.stringify({ role: user.role, organizationId: user.organizationId, permissions })
    );

    request.auth = { userId, organizationId: user.organizationId, role: user.role, permissions };
```

- [ ] **Step 4: Run all auth tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test -- auth.test
```

Expected: all 7 tests pass (3 existing + 4 new).

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/plugins/auth.ts apps/api/src/plugins/auth.test.ts
git commit -m "feat(api): merge role defaults with per-user permissions in auth plugin"
```

---

## Task 5: Invalidate auth caches when role defaults change (TDD)

**Files:**
- Modify: `apps/api/src/routes/roles.test.ts`
- Modify: `apps/api/src/routes/roles.ts`

- [ ] **Step 1: Extend `apps/api/src/routes/roles.test.ts`**

Add a redis mock and extend `mockPrisma` to include `user.findMany`. The redis mock goes at the top of the file alongside the existing `vi.mock` calls. The `mockPrisma` object gets a `user` property added.

Add the redis mock (after the existing `vi.mock("../lib/prisma.js", ...)` block):

```ts
const mockRedis = { del: vi.fn() };
vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));
```

Extend the existing `mockPrisma` const (add `user` to it):

```ts
const mockPrisma = {
  vendorSetting: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
};
```

Add `mockRedis.del.mockResolvedValue(1)` and `mockPrisma.user.findMany.mockResolvedValue([])` to the existing `beforeEach` blocks inside the `PUT /roles/:role/permissions` describe. Find the `beforeEach(() => vi.clearAllMocks())` inside that describe and replace it with:

```ts
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockRedis.del.mockResolvedValue(1);
  });
```

Then add this test inside the `describe("PUT /roles/:role/permissions", ...)` block:

```ts
  it("invalidates auth caches for users with the affected role", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u-10" }, { id: "u-11" }]);

    const res = await app.inject({
      method: "PUT",
      url: "/roles/agent/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", role: "agent" },
      select: { id: true },
    });
    expect(mockRedis.del).toHaveBeenCalledWith("auth:user:u-10", "auth:user:u-11");
  });

  it("skips redis.del when no users have the role", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);

    await app.inject({
      method: "PUT",
      url: "/roles/agent/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(mockRedis.del).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test -- roles.test
```

Expected: the 2 new invalidation tests FAIL; existing tests still pass.

- [ ] **Step 3: Modify `apps/api/src/routes/roles.ts`**

Add two imports at the top of the file:

```ts
import type { Role } from "@prisma/client";
import { redis } from "../lib/redis.js";
```

In the PUT handler, after the `vendorSetting.upsert` call and before `return reply.send(...)`, insert:

```ts
      const affected = await fastify.prisma.user.findMany({
        where: { organizationId, role: request.params.role as Role },
        select: { id: true },
      });
      if (affected.length > 0) {
        await redis.del(...affected.map((u) => `auth:user:${u.id}`));
      }
```

The full PUT handler after the change:

```ts
    async (request, reply) => {
      const { organizationId, role: authRole } = request.auth;
      if (authRole !== "admin" && authRole !== "superAdmin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can update role permissions" } });
      }

      if (!(VALID_ROLES as readonly string[]).includes(request.params.role)) {
        return reply.status(400).send({ error: { code: "INVALID_ROLE", message: `Role must be one of: ${VALID_ROLES.join(", ")}` } });
      }

      const key = settingKey(request.params.role);
      const value = JSON.stringify(request.body.permissions);

      await fastify.prisma.vendorSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        create: { organizationId, key, value },
        update: { value },
      });

      const affected = await fastify.prisma.user.findMany({
        where: { organizationId, role: request.params.role as Role },
        select: { id: true },
      });
      if (affected.length > 0) {
        await redis.del(...affected.map((u) => `auth:user:${u.id}`));
      }

      return reply.send({ data: { role: request.params.role, permissions: request.body.permissions } });
    }
```

- [ ] **Step 4: Run all roles tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test -- roles.test
```

Expected: all tests pass (existing + 2 new).

- [ ] **Step 5: Run full API test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass. Known pre-existing failure: `analytics.test.ts` (ECONNRESET) — ignore it.

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/roles.ts apps/api/src/routes/roles.test.ts
git commit -m "feat(api): invalidate user auth caches when role permissions change"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| `default-role-permissions.ts` single source of truth | Task 1 |
| Seed on new org registration, not update path | Task 2 |
| `skipDuplicates: true` on createMany | Task 2 |
| Backfill script for existing orgs | Task 3 |
| Load role defaults from VendorSetting on auth cache miss | Task 4 |
| Merge: role defaults base, per-user overrides win | Task 4 |
| Cache stores merged result (shape unchanged) | Task 4 |
| Invalidate user caches on role defaults PUT | Task 5 |
| Skip redis.del when no affected users | Task 5 |

All spec requirements covered.

### Placeholder scan

No TBD, TODO, "similar to", or "add appropriate" patterns. All steps include exact code.

### Type consistency

- `DEFAULT_ROLE_PERMISSIONS` typed as `Record<RoleKey, Record<string, string>>` in Task 1; used as `Object.entries(DEFAULT_ROLE_PERMISSIONS) as [string, Record<string, string>][]` in Task 2 (cast needed because `Object.entries` loses key literal types — safe here).
- `roleDefaults: Record<string, string>` and `memberPermissions: Record<string, string>` — both consistent with the existing `permissions` type in `AuthContext`.
- `request.params.role as Role` — safe because VALID_ROLES validation runs before the user.findMany call.
- `redis.del(...affected.map(...))` — ioredis `del` accepts `...string[]`; guarded by `affected.length > 0`.
