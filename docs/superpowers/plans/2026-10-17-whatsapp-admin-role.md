# Plan: WhatsApp Admin role

Spec: `docs/prd-whatsapp-admin-role.md`. Branch: `feat/whatsapp-admin-role`. TDD: write the failing test first in every task.

**Ordering constraints**
- Task 1 (enum + migration) comes before everything else, since the Prisma client must know the value.
- Tasks 2 and 3 ship together: the role must never exist without fixed resolution.
- Tasks 4 and 5 (G2/G1/G3) must be merged before the role is offered in any UI (Task 7).

## Task 1: Enum + migration
- `apps/api/prisma/schema.prisma`: add `whatsappAdmin` to `enum Role`.
- New `apps/api/prisma/migrations/20261017000000_whatsapp_admin_role/migration.sql`: `ALTER TYPE "Role" ADD VALUE 'whatsappAdmin';`
- `pnpm --filter api prisma generate`.
- `apps/api/src/types/fastify.d.ts:4`: extend the union.

## Task 2: Defaults
- Test (`permissions.test.ts`): `DEFAULT_ROLE_PERMISSIONS.whatsappAdmin` equals exactly `{ settings_access, settings_access@settings_whatsapp }`, and `canAccess(..., "templates_access")` is false.
- `default-role-permissions.ts`: add the `RoleKey` and its entry.

## Task 3: Fixed resolution in auth
- Test (`plugins/auth.test.ts`): a whatsappAdmin user with a stored `role_permissions_whatsappAdmin` row granting `inbox_access` and a member override granting `contacts_access` resolves to defaults only.
- `plugins/auth.ts:47-72`: if `user.role === "whatsappAdmin"`, `permissions = defaultsForRole("whatsappAdmin")` (skip the row and member override).

## Task 4: G2, WABA routes require `settings_whatsapp`
- Tests (`whatsapp-account.test.ts`): manager (default perms) gets 403 on `GET /whatsapp-account/health-status`, `POST /connect` and `PUT /business-profile`; whatsappAdmin passes the gate on the same routes plus `/disconnect-account`.
- `whatsapp-account.ts:49-54`: preHandler uses `canAccessSub(role, permissions, "settings_access", "settings_whatsapp")`.
- Tests and fix for `vendor-settings.ts` `marketing-messages/enable` and `/status`: require `settings_whatsapp`.

## Task 5: G1 + G3, vendor-settings
- Tests (`vendor-settings.test.ts`):
  - PUT with key `role_permissions_manager` returns 400 `FORBIDDEN_KEY` (manager and admin).
  - GET never includes `role_permissions_*`.
  - whatsappAdmin GET returns only allowlisted keys.
  - whatsappAdmin PUT `/vendor-settings` and PUT `/sound-notification` return 403.
- `vendor-settings.ts`: add `"role_permissions_"` to `PLATFORM_CONTROLLED_PREFIXES` (rename the comment to "platform/RBAC-controlled"). Add a `WABA_SETTING_KEYS` allowlist (keys from `whatsapp-account/page.tsx:21-55`) and use it for the whatsappAdmin GET. Add a role check on both PUTs.

## Task 6: Invite / assign rules
- Tests (`invitations.test.ts`, users role test): manager inviting `whatsappAdmin` gets 403; admin gets success. Same for `PATCH /users/:id/role`.
- `invitations.ts:17` and `users.ts:44`: add the enum value, plus `if (body.role === "whatsappAdmin" && role !== "admin" && role !== "superAdmin") → 403`.
- `roles.ts`: no change; add a test that `PUT /roles/whatsappAdmin/permissions` returns 400.
- **O1 (approved 2026-10-17, "no higher than own")**: new `lib/role-grants.ts` → `grantableRoles(actor)`: admin/superAdmin → admin, manager, agent, viewer, whatsappAdmin; everyone else → manager, agent, viewer. Invite and role-PATCH reject roles outside the set (403). A non-admin also cannot change the role of a user who is currently admin/superAdmin/whatsappAdmin (403). Tests: manager invites admin returns 403; admin invites admin succeeds; manager demotes an admin returns 403.

## Task 7: Web
- `settings/members/page.tsx`: label "WhatsApp Admin"; add to `ROLES` and the invite dropdown only when the current user is admin or superAdmin.
- `(onboarding)/invite-team/page.tsx:68`: add the option (the creator is admin).
- `dashboard/page.tsx`: widen the role type; `redirect("/settings/whatsapp-account")` for whatsappAdmin.
- `components/layout/Sidebar.tsx`: hide items without `perm` for whatsappAdmin.
- `settings/page.tsx`: add a `perm`/`sub` to each tile and filter with `canAccess`/`canAccessSub` from `@/lib/can`. Read each tile's target page's `PermissionGate` to copy its exact key; no guessing.
- `roles/page.tsx:8,23`: type + label only (not editable).
- Tests: a vitest/cypress component test for tile filtering and Sidebar.

## Task 8: Mobile
- Test (`session-gate.test.ts`): whatsappAdmin returns `{ kind: "web_only" }`.
- `lib/session-gate.ts`: Role union + gate. Handle `web_only` wherever `super_admin` is handled (grep `super_admin` in `apps/mobile/app`) with the message "This role is managed on the WBMSG website."

## Task 9: Verify
- `/check`, `/test-api`, `/test-web`, mobile tests. Known flaky: segments/conversations and Redis noise.
- Security audit of every touched route (org scoping + RBAC) written into the final report.
- Manual QA per spec §9. Merge locally (option 1). Update memory.

## Follow-up (owner, 2026-10-17)
- Managers may **never** deactivate an Admin: `DELETE /users/:id` now loads the target (org-scoped) and returns 403 unless the target's role is in `grantableRoles(actor)`. Admins can still deactivate Admins and WhatsApp Admins; nobody in an org can deactivate a superAdmin.
- Pending manager-issued admin invitations: owner confirmed there are none, so no action.
- Team moves (owner "fix", 2026-10-17): `PATCH /users/:id/team`, `POST/PATCH/DELETE /teams` refuse (403) when they would add, evict, re-rank or un-team a member whose role the caller can't grant. A manager may still edit a team that contains an admin if the admin is unchanged.
- Settings index tiles are filtered by the permission each page's API enforces (`apps/web/lib/settings-tiles.ts`). Pages whose APIs have no permission check (conversation labels, webhook actions, media library, routing) stay visible to anyone with Settings access. That is pre-existing API behavior and is not changed here.
