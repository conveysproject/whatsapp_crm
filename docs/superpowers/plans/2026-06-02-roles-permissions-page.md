# Roles & Permissions Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/settings/roles` page where admins can configure what each role can do — per-role permission templates stored org-wide, matching Interakt's role-based permissions UX.

**Architecture:** Role permission defaults are stored as `VendorSetting` rows keyed `role_permissions_<roleName>` (JSON-stringified `Record<string,string>`). A new `GET/PUT /v1/roles/permissions` API reads and writes these. The existing `OrganizationMember.permissions` Json field (per-user overrides) is unchanged — the new page targets role-level defaults only. No schema changes.

**Tech Stack:** Fastify 4 (ESM, `.js` imports), Prisma (`vendorSetting.upsert`), Next.js 15 App Router (client component), React Query (`useQuery`/`useMutation`), Tailwind CSS, TypeScript strict.

---

## Role Mapping

TrustCRM has 5 roles in the `Role` Prisma enum (no schema change). Interakt has 6 — our closest mapping:

| TrustCRM role  | Display label | Interakt equivalent |
|----------------|---------------|---------------------|
| `superAdmin`   | Super Admin   | Super Admin         |
| `admin`        | Owner / Admin | Owner + Admin       |
| `manager`      | Manager       | Sales Lead          |
| `agent`        | Agent         | Sales Agent         |
| `viewer`       | Viewer        | Teammate            |

---

## Files

| Action   | Path |
|----------|------|
| Modify   | `apps/web/components/permissions-grid.tsx` |
| Create   | `apps/api/src/routes/roles.ts` |
| Create   | `apps/api/src/routes/roles.test.ts` |
| Modify   | `apps/api/src/routes/index.ts` |
| Create   | `apps/web/app/(dashboard)/settings/roles/page.tsx` |
| Modify   | `apps/web/app/(dashboard)/settings/page.tsx` |

---

## Task 1: Expand PERMISSION_GROUPS in permissions-grid.tsx

**Files:**
- Modify: `apps/web/components/permissions-grid.tsx`

The existing 9 groups are too coarse. Replace them with 8 Interakt-aligned categories, each with granular sub-permissions. The component API (`permissions`, `onChange`) does not change.

- [ ] **Step 1: Replace PERMISSION_GROUPS**

Open `apps/web/components/permissions-grid.tsx` and replace the entire `PERMISSION_GROUPS` array (lines 4–50):

```ts
export const PERMISSION_GROUPS = [
  {
    key: "contacts_access",
    label: "Contact Hub",
    description: "Access to the contacts section",
    subPermissions: [
      { key: "contacts_export", label: "Export Contacts" },
      { key: "contacts_add", label: "Add Contacts" },
      { key: "contacts_delete", label: "Delete Contacts" },
      { key: "contacts_bulk_tag", label: "Bulk tag Contacts" },
      { key: "contacts_import", label: "Import Contacts" },
      { key: "contacts_manage_custom_fields", label: "Manage custom fields" },
    ],
  },
  {
    key: "hide_phone_number",
    label: "Contact Data Privacy",
    description: "Phone numbers and field data visibility",
    subPermissions: [
      { key: "hide_contact_fields", label: "Hide all contact field data" },
    ],
  },
  {
    key: "inbox_access",
    label: "Inbox",
    description: "Access to the shared inbox",
    subPermissions: [
      { key: "inbox_all_conversations", label: "Access All section" },
      { key: "inbox_unassigned", label: "Access Unassigned section" },
      { key: "assigned_chats_only", label: "See only assigned chats" },
    ],
  },
  {
    key: "campaigns_access",
    label: "Campaigns",
    description: "Create, schedule, and run campaigns",
    subPermissions: [
      { key: "campaigns_create", label: "Create new campaigns" },
      { key: "campaigns_export_report", label: "Export Campaign Reports" },
      { key: "campaigns_custom_reports", label: "View Custom Campaign Reports" },
      { key: "campaigns_manage_segments", label: "Create / update Segments" },
    ],
  },
  {
    key: "templates_access",
    label: "Templates",
    description: "WhatsApp message templates",
    subPermissions: [
      { key: "templates_ai_buttons", label: "AI-suggested smart buttons" },
      { key: "templates_create", label: "Create templates" },
      { key: "templates_edit", label: "Edit templates" },
      { key: "templates_delete", label: "Delete templates" },
    ],
  },
  {
    key: "settings_access",
    label: "Settings",
    description: "Access to configuration sections",
    subPermissions: [
      { key: "settings_agents", label: "Agent settings" },
      { key: "settings_api_key", label: "API Key access" },
      { key: "settings_whatsapp", label: "WhatsApp Business Setup" },
      { key: "settings_billing", label: "Invoice & Billing" },
      { key: "settings_tags", label: "Manage Tags" },
    ],
  },
  {
    key: "analytics_access",
    label: "Chat Analytics",
    description: "Dashboards and reporting",
    subPermissions: [
      { key: "analytics_export", label: "Export Analytics data" },
      { key: "analytics_agent_performance", label: "View Agent Performance" },
    ],
  },
  {
    key: "automation_access",
    label: "Automation",
    description: "Bot flows and automation rules",
    subPermissions: [
      { key: "automation_export_report", label: "Export Workflow Reports" },
      { key: "automation_welcome_message", label: "Welcome Message settings" },
      { key: "automation_bot_flows", label: "Create / edit bot flows" },
      { key: "automation_bot_replies", label: "Create / edit bot replies" },
    ],
  },
] as const satisfies Array<{
  key: string;
  label: string;
  description: string;
  subPermissions: Array<{ key: string; label: string }>;
}>;
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors. If the `as const satisfies` syntax causes issues with the `Props` interface, replace the array type annotation with just `as const` and adjust `PERMISSION_GROUPS` usage accordingly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/permissions-grid.tsx
git commit -m "feat(settings): expand permission groups to match Interakt categories"
```

---

## Task 2: Create roles API route

**Files:**
- Create: `apps/api/src/routes/roles.ts`

Two endpoints: `GET /roles/permissions` returns all role permission maps; `PUT /roles/:role/permissions` upserts one role's map. Storage uses `VendorSetting` rows keyed `role_permissions_<roleName>`.

- [ ] **Step 1: Write the failing test first** (see Task 3 — write test before implementation)

Skip ahead to Task 3 Step 1, then return here.

- [ ] **Step 2: Create `apps/api/src/routes/roles.ts`**

```ts
import type { FastifyPluginAsync } from "fastify";

const VALID_ROLES = ["superAdmin", "admin", "manager", "agent", "viewer"] as const;
type RoleKey = (typeof VALID_ROLES)[number];

function settingKey(role: string): string {
  return `role_permissions_${role}`;
}

export const rolesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/roles/permissions", async (request, reply) => {
    const { organizationId, role } = request.auth;
    if (role !== "admin" && role !== "superAdmin") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can view role permissions" } });
    }

    const settings = await fastify.prisma.vendorSetting.findMany({
      where: {
        organizationId,
        key: { in: VALID_ROLES.map(settingKey) },
      },
      select: { key: true, value: true },
    });

    const data = Object.fromEntries(
      VALID_ROLES.map((r) => {
        const row = settings.find((s) => s.key === settingKey(r));
        const permissions: Record<string, string> = row ? (JSON.parse(row.value) as Record<string, string>) : {};
        return [r, permissions];
      })
    ) as Record<RoleKey, Record<string, string>>;

    return reply.send({ data });
  });

  fastify.put<{
    Params: { role: string };
    Body: { permissions: Record<string, string> };
  }>(
    "/roles/:role/permissions",
    {
      schema: {
        params: {
          type: "object",
          properties: { role: { type: "string" } },
          required: ["role"],
        },
        body: {
          type: "object",
          properties: { permissions: { type: "object", additionalProperties: { type: "string" } } },
          required: ["permissions"],
        },
      },
    },
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

      return reply.send({ data: { role: request.params.role, permissions: request.body.permissions } });
    }
  );
};
```

- [ ] **Step 3: Run the tests** (after Task 3 is written)

```bash
pnpm --filter @WBMSG/api test -- roles.test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/roles.ts
git commit -m "feat(api): add GET/PUT /v1/roles/permissions endpoints"
```

---

## Task 3: Write tests for roles route

**Files:**
- Create: `apps/api/src/routes/roles.test.ts`

Pattern: mock `fastify.prisma` via `vi.mock`, build the app with `Fastify({ logger: false })`, inject requests.

- [ ] **Step 1: Create `apps/api/src/routes/roles.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { rolesRouter } from "./roles.js";

const mockPrisma = {
  vendorSetting: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const mockAuth = {
  userId: "u-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {},
};

async function buildApp(authOverride?: Partial<typeof mockAuth>) {
  const app = Fastify({ logger: false });
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    (request as unknown as { auth: typeof mockAuth }).auth = { ...mockAuth, ...authOverride };
  });
  app.decorate("prisma", mockPrisma);
  await app.register(rolesRouter);
  return app;
}

describe("GET /roles/permissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-admin", async () => {
    const app = await buildApp({ role: "agent" });
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(403);
  });

  it("returns empty objects for roles with no stored settings", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, Record<string, string>> }>();
    expect(body.data.admin).toEqual({});
    expect(body.data.agent).toEqual({});
    expect(body.data.viewer).toEqual({});
    expect(body.data.manager).toEqual({});
    expect(body.data.superAdmin).toEqual({});
  });

  it("returns stored permissions for each role", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.findMany.mockResolvedValue([
      { key: "role_permissions_admin", value: JSON.stringify({ contacts_access: "allow" }) },
      { key: "role_permissions_agent", value: JSON.stringify({ inbox_access: "allow" }) },
    ]);

    const res = await app.inject({ method: "GET", url: "/roles/permissions" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, Record<string, string>> }>();
    expect(body.data.admin).toEqual({ contacts_access: "allow" });
    expect(body.data.agent).toEqual({ inbox_access: "allow" });
    expect(body.data.viewer).toEqual({});
  });
});

describe("PUT /roles/:role/permissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-admin", async () => {
    const app = await buildApp({ role: "agent" });

    const res = await app.inject({
      method: "PUT",
      url: "/roles/agent/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for invalid role name", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "PUT",
      url: "/roles/hacker/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(res.statusCode).toBe(400);
  });

  it("upserts permissions and returns them", async () => {
    const app = await buildApp();
    mockPrisma.vendorSetting.upsert.mockResolvedValue({
      key: "role_permissions_agent",
      value: JSON.stringify({ inbox_access: "allow" }),
    });

    const res = await app.inject({
      method: "PUT",
      url: "/roles/agent/permissions",
      payload: { permissions: { inbox_access: "allow" } },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { role: string; permissions: Record<string, string> } }>();
    expect(body.data.role).toBe("agent");
    expect(body.data.permissions).toEqual({ inbox_access: "allow" });

    expect(mockPrisma.vendorSetting.upsert).toHaveBeenCalledWith({
      where: { organizationId_key: { organizationId: "org-1", key: "role_permissions_agent" } },
      create: { organizationId: "org-1", key: "role_permissions_agent", value: JSON.stringify({ inbox_access: "allow" }) },
      update: { value: JSON.stringify({ inbox_access: "allow" }) },
    });
  });

  it("allows superAdmin to update permissions", async () => {
    const app = await buildApp({ role: "superAdmin" });
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});

    const res = await app.inject({
      method: "PUT",
      url: "/roles/manager/permissions",
      payload: { permissions: { campaigns_access: "allow" } },
    });

    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (roles.ts not registered yet)**

```bash
pnpm --filter @WBMSG/api test -- roles.test
```

Expected: tests fail with import errors or 404s (roles.ts doesn't exist yet if you're doing strict TDD, or tests pass if you created routes.ts first — either order is fine here).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/roles.test.ts
git commit -m "test(api): add roles permissions route tests"
```

---

## Task 4: Register the roles router

**Files:**
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Add import and registration to `apps/api/src/routes/index.ts`**

Add the import after the existing imports (e.g., after line 45, before the `export const routes` line):

```ts
import { rolesRouter } from "./roles.js";
```

Add the registration inside the `routes` function, after the existing registrations (e.g., after line 91, before the closing `}`):

```ts
  await fastify.register(rolesRouter, { prefix: "/v1" });
```

- [ ] **Step 2: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: roles tests pass; no regressions in other test files. Known pre-existing failure: `analytics.test.ts` — ignore it.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/index.ts
git commit -m "feat(api): register roles permissions router"
```

---

## Task 5: Create the Roles settings page

**Files:**
- Create: `apps/web/app/(dashboard)/settings/roles/page.tsx`

Client component. Renders role tabs (one per TrustCRM `Role` enum value), loads all role permissions from `GET /api/v1/roles/permissions`, lets admin toggle permissions per role with `PermissionsGrid`, and saves with `PUT /api/v1/roles/:role/permissions`.

- [ ] **Step 1: Create `apps/web/app/(dashboard)/settings/roles/page.tsx`**

```tsx
"use client";
import { JSX, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PermissionsGrid } from "@/components/permissions-grid";

type RoleKey = "superAdmin" | "admin" | "manager" | "agent" | "viewer";

const ROLES: RoleKey[] = ["superAdmin", "admin", "manager", "agent", "viewer"];

const ROLE_LABELS: Record<RoleKey, string> = {
  superAdmin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  agent: "Agent",
  viewer: "Viewer",
};

type RolePermissionsResponse = { data: Record<RoleKey, Record<string, string>> };

async function fetchRolePermissions(): Promise<RolePermissionsResponse> {
  const res = await fetch("/api/v1/roles/permissions");
  if (!res.ok) throw new Error("Failed to load role permissions");
  return res.json() as Promise<RolePermissionsResponse>;
}

async function saveRolePermissions(
  role: RoleKey,
  permissions: Record<string, string>
): Promise<void> {
  const res = await fetch(`/api/v1/roles/${role}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
  if (!res.ok) throw new Error("Failed to save permissions");
}

export default function RolesPage(): JSX.Element {
  const [activeRole, setActiveRole] = useState<RoleKey>("admin");
  const [localPermissions, setLocalPermissions] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<RolePermissionsResponse>({
    queryKey: ["role-permissions"],
    queryFn: fetchRolePermissions,
  });

  useEffect(() => {
    if (data) {
      setLocalPermissions(data.data[activeRole] ?? {});
      setSaved(false);
    }
  }, [activeRole, data]);

  const saveMutation = useMutation({
    mutationFn: () => saveRolePermissions(activeRole, localPermissions),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage access to features for your team. Set defaults per role.
        </p>
      </div>

      {/* Role tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setActiveRole(role)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeRole === role
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {/* Permission grid */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading permissions…</div>
      ) : (
        <>
          <PermissionsGrid permissions={localPermissions} onChange={setLocalPermissions} />

          <div className="flex items-center justify-end gap-3 pt-2">
            {saved && (
              <span className="text-sm text-green-600">Saved successfully</span>
            )}
            {saveMutation.isError && (
              <span className="text-sm text-red-500">Failed to save. Try again.</span>
            )}
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending
                ? "Saving…"
                : `Save ${ROLE_LABELS[activeRole]} permissions`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/"(dashboard)"/settings/roles/page.tsx
git commit -m "feat(web): add /settings/roles page with role-based permission editor"
```

---

## Task 6: Add Roles card to Settings page

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add Roles entry to the settings grid**

In `apps/web/app/(dashboard)/settings/page.tsx`, add the Roles entry to the array at line 45. Insert it after the `Team` entry:

Find:
```ts
          { href: "/settings/team", label: "Team", desc: "Roles and permissions" },
```

Replace with:
```ts
          { href: "/settings/team", label: "Team", desc: "Per-user permission overrides" },
          { href: "/settings/roles", label: "Roles", desc: "Default permissions per role" },
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/"(dashboard)"/settings/page.tsx
git commit -m "feat(web): add Roles card to settings page"
```

---

## Self-Review

### Spec coverage

| Interakt feature | Task covering it |
|---|---|
| Role tabs (6 levels) | Task 5 — 5 TrustCRM roles displayed as tabs |
| Per-role permission toggles | Task 5 — PermissionsGrid per active tab |
| Contact Hub permissions | Task 1 — `contacts_access` + sub-permissions |
| Contact data privacy (hide phone / fields) | Task 1 — `hide_phone_number` group |
| Inbox (All / Unassigned sections) | Task 1 — `inbox_access` + `inbox_all_conversations`, `inbox_unassigned` |
| Campaigns permissions | Task 1 — `campaigns_access` + 4 sub-permissions |
| Templates permissions | Task 1 — `templates_access` + 4 sub-permissions |
| Settings permissions | Task 1 — `settings_access` + 5 sub-permissions |
| Chat Analytics permissions | Task 1 — `analytics_access` + 2 sub-permissions |
| Automation permissions | Task 1 — `automation_access` + 4 sub-permissions |
| Save per role | Task 5 — `PUT /v1/roles/:role/permissions` |
| Settings card entry | Task 6 |

**Gap note:** Interakt has 6 roles; TrustCRM has 5 (`superAdmin/admin/manager/agent/viewer`). Adding a 6th role would require a Prisma enum migration — excluded from this plan. The existing 5 cover the same range.

### Placeholder scan

No TBD, TODO, or "similar to Task N" patterns. All steps include exact code.

### Type consistency

- `PERMISSION_GROUPS` uses `as const satisfies` — type is correct and sub-keys match what `PermissionsGrid` iterates.
- `RoleKey` type in `roles.ts` and `page.tsx` both derived from `VALID_ROLES` / `ROLES` literal arrays — consistent.
- `PUT /roles/:role/permissions` body schema uses `additionalProperties: { type: "string" }` — matches `Record<string, string>`.
- `organizationId_key` compound unique key — verified against `vendor-settings.ts` line 31.
