# Parent / child organizations: runtime reference

Design: `docs/prd-parent-child-orgs.md`. Plan: `docs/superpowers/plans/2026-10-19-parent-child-orgs.md`.
Everything here is behind `PARENT_ORGS_ENABLED` (off by default; only the exact string `true` turns it on).

## Model

- `organizations.parent_organization_id` links a child org to one parent org. One level only.
- `organizations.is_parent` is set by a super admin (`PATCH /v1/admin/organizations/:orgId/parent-capability`). Only such an org can invite clients or act as a parent. An org that has a parent can never be a parent.
- `lib/parent-orgs.ts` is the only place that decides "is X a current child of Y" (`getChildOrgIds`, `isChildOf`, `canBeParent`, `linkChild`, `unlinkChild`). Every parent route, the parent-key send path, the workers and impersonation re-check it on every request, so unlinking cuts access at once.
- Tables added: `client_invitations`, `parent_audit_events` (links, unlinks, impersonation start/elevate, content reads). Columns added: `impersonation_logs.actor_organization_id`, `api_message_meta.parent_organization_id`.

## Who may do what

| Action | Who | Where |
|---|---|---|
| Make an org a parent | Super admin (the toggle on the org page shows only while the flag is on: `parentFeatureEnabled` in `GET /v1/admin/organizations/:id`) | `PATCH /v1/admin/organizations/:orgId/parent-capability` |
| Invite a client, list, revoke | Parent `admin` role only (it holds `parent_access`; the key cannot be granted to any other role) | `/v1/client-invitations` |
| Accept an invite as a new person (creates the account, the child org with the invitee as `admin`, and the link) | Holder of the emailed token; no account may exist yet for the invited email | `POST /v1/auth/client-invitations/:token/accept` (public) |
| Accept an invite with an existing account that has no workspace yet | Signed-in invitee whose email matches | `POST /v1/client-invitations/:token/accept` |
| Dashboard, per-child stats, message list (audited) | Parent `admin` | `/v1/parent/children`, `/parent/dashboard`, `/parent/children/:id/stats`, `/parent/children/:id/messages` |
| Remove a child | Parent `admin` | `DELETE /v1/parent/children/:id` |
| Leave the parent | Child `admin` | `POST /v1/organization/leave-parent` |
| See who the parent is, the parent's sessions and the parent's message reads | Child `admin` | `GET /v1/organization/parent-link` |
| Open a child as admin (read-only; elevate needs a 10-500 char reason; end) | Parent `admin` only | `POST /v1/parent/children/:id/impersonate`, `.../elevate`, `DELETE .../impersonate` |
| Send for a child with the parent's API key | API key that holds scope `send_for_children`, created/rotated/edited only by a parent `admin` | public API `POST .../Message/` with the child's number as `src` (optional `waba_id`) |

## Sending for a child (PRD 6.1)

- The key needs scope `send_for_children`. Without it the call behaves exactly as before (`SRC_MISMATCH` for a wrong `src`).
- The child is resolved among the key owner's current children by number (and optionally WABA ID). Unknown, unlinked and someone else's child all return the same 403 `FORBIDDEN_CHILD`. A child that is not connected returns 400 `WHATSAPP_NOT_CONNECTED`; the parent's own number is never used instead.
- The message is stored in the child org (billed to the child). `api_message_meta` records the key id, the child org and the parent org. API usage stays attributed to the key owner.
- Status callbacks go to the parent key's callback URL. Inbound replies stay in the child's own inbox and its own inbound URL.
- The send worker re-checks the key (not revoked, scope present), the flag, the parent capability, the link and the child's API block at send time.
- Rate limit: `PUBLIC_API_CHILD_RATE_LIMIT` destinations per minute per key and child (default 120).
- Not supported in v1: naming a child by WABA ID alone (`src` is still required); a parent polling `GET /Message` for child messages (callbacks only).

## Security audit (every new or changed route)

All routes: org id comes from `request.auth` or from a child id that was first checked with `isChildOf`; never from a body or query for scoping. Flag off returns 404.

Parent powers are admin-only (D15): every parent guard requires the `admin` role as well as `parent_access`, and `PUT /v1/roles/:role/permissions` rejects any `parent_*` key for roles below admin (400 `PERMISSION_NOT_GRANTABLE`).

| Route | Scoping | RBAC | Cross-tenant negative test |
|---|---|---|---|
| `PATCH /admin/organizations/:orgId/parent-capability` | by `:orgId`, super admin only; row-locked | `requireSuperAdmin` | admin gets 403; non-super-admin with flag off gets 404 |
| `POST/GET/DELETE /client-invitations` | caller's org only | admin role + `parent_access` + `canBeParent` | another org's invite id looks like an unknown id; a manager with `parent_access` granted gets 403 |
| `GET /client-invitations/:token` (public) | token only; same body for unknown/used/revoked/expired | public | identical bodies asserted; returns only `parentName`, `email` and `accountExists` (visible only to the token holder) |
| `POST /auth/client-invitations/:token/accept` (public, new person) | creates a new account and org; the parent comes from the invitation, never the body | per-IP credential limiter (20 per 10 min); token pending, unexpired and parent still a parent, else the padded generic `INVALID_INVITATION`; `WEAK_PASSWORD`; `ACCOUNT_EXISTS` if the email already has an account | account (email verified by the token), org, admin user, link and claim in one transaction; claim requires `pending` and `expiresAt > now` (count checked); then a session |
| `POST /client-invitations/:token/accept` (signed in) | creates a new org; cannot join an existing one | signed in, email must match, not already a member | org, user, link and claim in one transaction; claim requires `pending` and `expiresAt > now` |
| `GET /parent/children`, `/dashboard`, `/children/:id/stats` | ids only from `getChildOrgIds` / `isChildOf` | flag + admin role + `parent_access` + `canBeParent` | other parent's child, unknown and self ids give one identical 403 |
| `GET /parent/children/:id/messages` | child org + parent check in the query; cursor resolved inside the child | same; refused while `request.auth.impersonation` is set; 60/min; writes `content_read` audit row | foreign cursor rejected with 400 and no audit row; a super admin impersonating the parent admin gets 403 |
| `DELETE /parent/children/:id` | `isChildOf` first | admin + parent guard | identical 403 for non-children |
| `POST /parent/children/:id/impersonate` (+ elevate, end) | child must be a current child; target must belong to the child and not be a super admin | admin only (generic 403 otherwise); 10 starts per hour per actor (atomic INCR+EXPIRE counter, fails closed) | non-child, manager with `parent_access`, super admin all refused with no writes |
| Impersonation token validation (`plugins/auth.ts`) | bearer must be the issuer's own normal session; issuer org, role, flag, parent capability and link re-checked on every request | n/a | any failure returns the same 401; unlink, demotion and flag-off invalidate the token |
| Impersonation guard | parent sessions cannot reach `/v1/parent`, `/v1/client-invitations`, `/v1/organization/*` link routes, API credentials, webhook actions, invitations, or any blocked write | n/a | guard tests per prefix and mode |
| `GET /organization/parent-link`, `POST /organization/leave-parent` | caller's org only; sessions filtered by `actor_organization_id IS NOT NULL`; `contentReads` are the last 50 `content_read` rows whose `child_organization_id` is the caller's org | child admin | other orgs' rows never returned; token, IP, user agent, reason text, read cursor and message ids never returned (a read is `{ at, actorName, count }`) |
| `GET /organizations/me` (added `isParent`, `hasParent`) | caller's org | unchanged | parent id is never returned |
| Public API send with `send_for_children` | key owner's children only; checked per request and in the worker | scope + flag + parent capability | generic 403 for any non-child; child's API block also applies |
| `/api-credentials` create / rotate / PATCH of a scoped key | caller's org | admin role + `parent_access` as well as `settings_api_key` | a manager with `settings_api_key`, with or without `parent_access`, gets 403 |
| `PUT /roles/:role/permissions` | caller's org | admin / super admin, roles below their own | `parent_*` keys rejected for manager, agent and viewer |

## Rollout

1. Deploy with `PARENT_ORGS_ENABLED` unset (migration `20261020000000_parent_child_orgs` is additive).
2. Owner runs the read-only duplicate check before any uniqueness work: `railway run --service Postgres node apps/api/scripts/check-duplicate-phone-number-ids.mjs`.
3. Before enabling, exercise both accept flows once (new person with a password, and an existing account that signs in) against a scratch Postgres (both accept transactions nest `linkChild` as a savepoint; this was verified by reading Prisma 7.8, not by running it).
4. Super admin turns on the parent capability for one pilot org; set `PARENT_ORGS_ENABLED=true`; watch `parent_audit_events`, `impersonation_logs` and API errors.
5. Rollback: unset the flag. All parent routes 404, parent-issued tokens stop validating, parent keys stop sending for children. Data stays; dropping the new column and tables is a separate step.
