# Role Permissions — Seed on Registration & Auth Merge

**Date:** 2026-06-07

## Goal

1. Seed default role permissions for every new org at registration time.
2. Backfill existing orgs that have no role permissions yet.
3. Merge role-level defaults with per-user overrides in the auth plugin so permissions are actually enforced at the API layer.

---

## Background

Role permissions are stored as `VendorSetting` rows keyed `role_permissions_<role>` (JSON-stringified `Record<string,string>`). The GET/PUT `/v1/roles/permissions` API already exists. However:

- The `register.ts` route does not seed defaults when a new org is created.
- The auth plugin loads only `OrganizationMember.permissions` (per-user overrides) — role defaults are never merged in, so the settings UI is cosmetic only.
- `canAccess()` treats an empty permissions object as "allow all" (backwards compat), meaning non-admin users have no restrictions unless individual overrides are set.

---

## Architecture

Five focused changes — no schema changes, no breaking API changes.

### 1. `apps/api/src/lib/default-role-permissions.ts` (new)

Exports `DEFAULT_ROLE_PERMISSIONS`: a typed `Record<RoleKey, Record<string, string>>` with defaults for `admin`, `manager`, `agent`, `viewer`. Lifted from `seed-role-permissions.mjs`. Single source of truth going forward — the existing script can import from it or stay as-is (it's a one-shot tool).

`superAdmin` is not included — platform-level, managed separately.

### 2. `apps/api/src/routes/register.ts` (modify)

After the org + user creation block (new-org path only), bulk-insert defaults:

```ts
await fastify.prisma.vendorSetting.createMany({
  data: Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, perms]) => ({
    organizationId,
    key: `role_permissions_${role}`,
    value: JSON.stringify(perms),
  })),
  skipDuplicates: true,
});
```

`skipDuplicates: true` makes this safe on any accidental double-call. Does not run on the existing-org update path.

### 3. `apps/api/scripts/backfill-role-permissions.mjs` (new)

Standalone script using `PrismaClient` (same pattern as existing scripts in `apps/api/scripts/`).

Algorithm:
1. Fetch all distinct `organizationId` values from the `Organization` table.
2. Fetch all `organizationId` values that already have any `role_permissions_*` row in `VendorSetting`.
3. Subtract to get orgs needing backfill.
4. For each, bulk-insert defaults via `createMany` with `skipDuplicates: true`.
5. Print a summary line per org processed.

Idempotent — safe to run multiple times.

### 4. `apps/api/src/plugins/auth.ts` (modify — core change)

On cache miss, after loading `user` and `member`, load the role's defaults:

```ts
const roleSettingRow = await fastify.prisma.vendorSetting.findUnique({
  where: { organizationId_key: { organizationId: user.organizationId, key: `role_permissions_${user.role}` } },
  select: { value: true },
});
const roleDefaults: Record<string, string> = roleSettingRow
  ? (JSON.parse(roleSettingRow.value) as Record<string, string>)
  : {};

const memberPermissions = (member?.permissions ?? {}) as Record<string, string>;
const permissions = { ...roleDefaults, ...memberPermissions }; // user overrides win
```

Cache stores the merged result — shape unchanged (`{ role, organizationId, permissions }`).

**Merge semantics:**
- Role defaults are the base layer.
- Per-user `OrganizationMember.permissions` overrides win on conflict.
- If both are empty → merged is empty → `canAccess()` returns true (backwards compat preserved for orgs with no permissions seeded).
- If role defaults are populated and member is empty → role defaults are enforced. This is the correct post-seed behaviour.

### 5. `apps/api/src/routes/roles.ts` (modify)

On `PUT /roles/:role/permissions`, after saving, invalidate auth caches for all users in the org with that role:

```ts
const affected = await fastify.prisma.user.findMany({
  where: { organizationId, role: request.params.role as Role },
  select: { id: true },
});
if (affected.length > 0) {
  await redis.del(...affected.map((u) => `auth:user:${u.id}`));
}
```

Same `auth:user:<id>` key pattern as `invalidateAuthCache()` in `users.ts`.

---

## Cache Invalidation Summary

| Trigger | Cache keys invalidated |
|---|---|
| Per-user permissions updated (`PUT /users/:id/permissions`) | `auth:user:<userId>` — already implemented |
| User role changed (`PATCH /users/:id/role`) | `auth:user:<userId>` — already implemented |
| Role defaults updated (`PUT /roles/:role/permissions`) | `auth:user:<id>` for all users in org with that role — **new** |

The existing 60s TTL on auth cache entries is a safety net for any missed invalidations.

---

## Default Permissions

| Role | Highlights |
|---|---|
| `admin` | Full access to all groups and sub-permissions |
| `manager` | Broad access — no delete contacts, no billing, no API key |
| `agent` | Contacts add, inbox unassigned/assigned-only, templates |
| `viewer` | Read-only contacts, inbox all, campaigns, templates, analytics, automation |

---

## Files

| Action | Path |
|---|---|
| Create | `apps/api/src/lib/default-role-permissions.ts` |
| Modify | `apps/api/src/routes/register.ts` |
| Create | `apps/api/scripts/backfill-role-permissions.mjs` |
| Modify | `apps/api/src/plugins/auth.ts` |
| Modify | `apps/api/src/routes/roles.ts` |

No schema changes. No frontend changes.

---

## Out of Scope

- `superAdmin` role defaults (platform-managed, not per-org)
- Frontend UI changes (Roles page already exists from prior sprint)
- Changing `canAccess()` semantics — the existing logic handles the merged result correctly
