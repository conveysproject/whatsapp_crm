# PRD: WhatsApp Admin role

Status: draft, awaiting owner sign-off (2026-10-17)
Plan: `docs/superpowers/plans/2026-10-17-whatsapp-admin-role.md`

## 1. Problem

A client wants to invite a user who can sign in to WBMSG and manage only their WhatsApp Business Account (WABA). Today there are five fixed roles (`superAdmin`, `admin`, `manager`, `agent`, `viewer`, `apps/api/prisma/schema.prisma:16`). Only `admin` has `settings_access@settings_whatsapp` (`apps/api/src/lib/default-role-permissions.ts`), and `admin` can do everything. Role permissions can be edited only per role (`apps/web/app/(dashboard)/settings/roles/page.tsx`). Per-user overrides exist in the backend (`OrganizationMember.permissions`, `apps/api/src/plugins/auth.ts:71-72`) but there is no screen for them.

The code scan also found three existing security gaps that this role would inherit or widen:

| # | Gap | Evidence |
|---|---|---|
| G1 | `PUT /vendor-settings` checks only `settings_access`. Role permissions are stored as VendorSetting rows `role_permissions_<role>`, so any user with `settings_access` (e.g. a manager) can rewrite their own role's permissions. That is a privilege escalation. | `vendor-settings.ts:93`, `auth.ts:54`, `PLATFORM_CONTROLLED_PREFIXES` only covers `plan_feature_`/`plan_limit_` (`vendor-settings.ts:15`) |
| G2 | Most `/whatsapp-account/*` endpoints check only `settings_access`. Managers can call `/connect`, change the PIN, display name or business profile, sync, register numbers, and so on. Only 4 routes check `settings_whatsapp`. | `whatsapp-account.ts:49-54` (preHandler), sub-checks only at `:198, :233, :678, :857`. `vendor-settings/marketing-messages/enable` (`vendor-settings.ts:140`) has the same issue. |
| G3 | `GET /vendor-settings` returns every org setting to anyone with `settings_access`. | `vendor-settings.ts:74-86` |

## 2. Decisions (owner, 2026-10-16/17)

- Role name: **WhatsApp Admin**, key `whatsappAdmin`.
- Scope: full WABA control, **including disconnect**. **No templates.**
- **Fixed** role: permissions are not editable on the Roles page and ignore stored or per-user overrides.
- Fix G2: only Admin and WhatsApp Admin can use the WhatsApp account endpoints.
- G3: WhatsApp Admin reads only WABA-related setting keys and cannot save org settings.

## 3. Goals / non-goals

Goals
- An admin can invite a user as WhatsApp Admin, or change an existing member to it.
- A WhatsApp Admin can use Settings → WhatsApp Account only: connect (embedded signup and manual), register a number, PIN, display name, business profile, webhooks, sync, marketing messages, and disconnect.
- Every other module is denied by the API (deny-by-default) and hidden in the web UI.
- Close G1 and G2 for all roles.

Non-goals
- A UI for per-user permission overrides.
- Template management for this role.
- Mobile app access for this role (blocked with a message).
- Changing who can invite or promote to *other* roles (see §9, open item O1).

## 4. Role definition

```ts
whatsappAdmin: {
  settings_access: "allow",
  "settings_access@settings_whatsapp": "allow",
}
```

Resolution (`auth.ts`): for `whatsappAdmin`, the effective permissions are always the built-in defaults above. Any `role_permissions_whatsappAdmin` row and any `OrganizationMember.permissions` are ignored. This makes the role fixed and keeps future grid edits from widening it.

Visibility: `whatsappAdmin` is not in the org-wide list in `visibility.ts:18`, `conversation-access.ts:9` or `contacts.ts:90`, so it falls into "own records only". It has no `contacts_access` or `inbox_access` anyway.

## 5. Architecture fit (layers changed)

**DB**
- Hand-authored migration `ALTER TYPE "Role" ADD VALUE 'whatsappAdmin';` (the local DB is drifted, so `prisma migrate dev` fails).
- The change is additive and needs no backfill: orgs without a stored row fall back to defaults (`auth.ts:54-72`).

**API**
- `default-role-permissions.ts`: add the `RoleKey` and its defaults. `register.ts:152` then seeds the row for new orgs automatically. The row is harmless because it is ignored for this role.
- `plugins/auth.ts`: fixed-role resolution (§4).
- `types/fastify.d.ts:4`: extend the role union.
- `invitations.ts:17` and `users.ts:44`: add the role to the JSON-schema enum. Only `admin`/`superAdmin` may invite a WhatsApp Admin or assign the role. Today `settings_agents` (which managers also have) is enough to invite or assign roles, so this new rule matters.
- `roles.ts`: not in `VALID_ROLES`/`editableRolesFor`, so `GET` doesn't list it and `PUT` rejects it.
- `whatsapp-account.ts` (G2): change the router preHandler to `canAccessSub(..., "settings_access", "settings_whatsapp")`. This covers every route, including `/connect` and `/verification-upload`. The 4 per-route checks stay as-is (redundant but harmless).
- `vendor-settings.ts`:
  - G1: add `role_permissions_` to the protected prefixes on both GET (stripped) and PUT (rejected, 400 `FORBIDDEN_KEY`), for every role. Role permissions are managed only through `/roles`. Nothing in the web or mobile code writes `role_permissions_*` through vendor-settings (grep verified).
  - G3: for `whatsappAdmin`, `GET /vendor-settings` returns only the WABA key allowlist (the keys of the page's `VendorSettings` type, `whatsapp-account/page.tsx:21-55`). `PUT /vendor-settings` and `PUT /vendor-settings/sound-notification` return 403.
  - G2: `marketing-messages/enable` and `/status` require `settings_whatsapp`.

**Web**
- `settings/members/page.tsx:48-61` and `(onboarding)/invite-team/page.tsx:68`: add a "WhatsApp Admin" option, shown only when the current user is admin or superAdmin.
- `dashboard/page.tsx`: if `role === "whatsappAdmin"`, `redirect("/settings/whatsapp-account")` on the server, so no dashboard data is requested.
- `components/layout/RoleRouteGuard.tsx` (in the dashboard layout): a WhatsApp Admin on any path other than `/settings/whatsapp-account` is sent there (`lib/role-home.ts`).
- `Sidebar.tsx`: a WhatsApp Admin sees a single "WhatsApp Account" entry.
- *Changed during build:* the plan was to filter Settings-index tiles by permission. Several settings pages have no client-side gate (teams, branding, labels, routing, …), so per-tile keys would have been guesses. The route guard covers the WhatsApp Admin fully. Filtering tiles for managers is left as a follow-up.
- Role labels and unions: `dashboard/page.tsx:12`, `roles/page.tsx:8` (label map only, not editable).

**Mobile**
- `lib/session-gate.ts`: add a `Role` member and a new gate `{ kind: "web_only" }` for `whatsappAdmin`. The gate screen shows "This role is managed on the WBMSG website." Push registration is skipped as for super admins.

`apps/conveys`: no role references found (grep), so no change.

## 6. API contract and compatibility

- New enum value accepted by `POST /invitations` and `PATCH /users/:id/role`.
- **Behavior change (intended):** managers or custom-configured roles without `settings_whatsapp` now get 403 on all `/whatsapp-account/*` and marketing-messages routes. The web page already hides itself without `settings_whatsapp` (`whatsapp-account/page.tsx:265`), so no supported UI flow breaks. Onboarding `/connect` (`connect-waba/callback/page.tsx:41`) is used by the org creator (admin, who bypasses checks).
- **Behavior change (intended):** writing `role_permissions_*` through `/vendor-settings` returns 400.

## 7. Security

- Org scoping: no new queries. Touched routes already filter by `request.auth.organizationId`. This is re-verified for every touched route in Phase 5.
- RBAC: deny-by-default is preserved. The new role grants only two keys and cannot be widened.
- Escalation: G1 is closed for all roles. Only admins can create a WhatsApp Admin.
- Secrets: the WhatsApp Admin's settings allowlist excludes API keys, AI keys and other non-WABA settings.
- Audit: role changes and invitations follow existing logging (no new log type).

## 8. Rollout / rollback

1. Deploy the API with the migration. The enum add is forward-only in Postgres. Rollback = redeploy the previous code; the unused enum value stays, which is harmless as long as no users hold it.
2. Deploy web, then ship mobile in the next build. Older mobile builds would let a WhatsApp Admin in, but every data call gets 403. This is acceptable and noted as a risk.
3. No prod data script is needed.
4. If migrate-on-deploy fails, apply the DDL out-of-band and run `prisma migrate resolve --applied <name>` (see memory).

## 9. Acceptance criteria / tests

- API unit/route tests:
  - Defaults for `whatsappAdmin`; auth ignores stored and per-member overrides for it.
  - `/whatsapp-account/*` returns 403 for manager and 200 for `whatsappAdmin`, including `/connect` and disconnect.
  - `/vendor-settings`: GET filtered for `whatsappAdmin`; PUT returns 403 for `whatsappAdmin`; PUT `role_permissions_*` returns 400 for manager and admin; GET strips `role_permissions_*`.
  - `/templates`, `/contacts`, `/conversations`, `/campaigns`, `/billing`, `/api-credentials` return 403 for `whatsappAdmin`.
  - Invite/assign `whatsappAdmin` returns 403 for manager and 201/200 for admin.
  - `/roles/permissions` doesn't list it; `PUT /roles/whatsappAdmin/permissions` returns 400.
- Web: Settings index tile filtering; Sidebar hides Dashboard; dashboard redirect.
- Mobile: `session-gate.test.ts` returns `web_only` for `whatsappAdmin`.
- Manual: invite a user as WhatsApp Admin, sign in, land on WhatsApp Account, connect, disconnect, and confirm no other menu items.

## 10. Risks / open questions

- **O1 (owner):** Managers can currently invite or promote users to **admin** (`invitations.ts:26`, `users.ts` role PATCH both gate on `settings_agents`). This is a separate escalation path. Recommended follow-up: a user may only grant roles in `editableRolesFor(actor)`. **Not in this task unless the owner says so.**
- Header/global components may call APIs the role can't use, which causes harmless 403s in the console. These are checked during manual QA and hidden if visible.
- Older mobile builds (see §8).
