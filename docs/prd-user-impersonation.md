# PRD: Super-admin impersonation of a specific user

Status: IMPLEMENTED on branch `feat/user-impersonation` (not yet merged or released). See "Operational checklist before release" below.

## Problem (evidence)

"Login As" on the platform admin Organizations page does not work.

- The API issues a 15-minute Redis token (`apps/api/src/routes/admin.ts:221-265`) and the auth plugin accepts it via the `X-Impersonate-Token` header (`apps/api/src/plugins/auth.ts:14-23`).
- The web app stores the token in `sessionStorage` and redirects to `/dashboard` (`apps/web/app/admin/(protected)/organizations/page.tsx:85-86`). Only `ImpersonationBanner` reads it back.
- Nothing sends the header. A search of `apps/` finds `x-impersonate-token` only in `auth.ts`, and git history has no earlier version that sent it. The dashboard therefore keeps using the admin's own Clerk token.
- About 124 web files build their own `getToken()` + `fetch` call (`apps/web/lib/client-fetch.ts` is one wrapper, `apps/web/lib/api.ts` another). 6 files use server-side `auth()`. Server code cannot read `sessionStorage`.
- Today's token is org-scoped and sets `role: "superAdmin"` with empty permissions (`auth.ts:21`). It cannot represent a specific user.

## Requirements (decided with the user)

1. The super admin picks an organization, then a specific user in it, and sees the product as that user (that user's role, permissions, team, assigned chats).
2. Access mode: **read-only by default.** Writes are rejected by the API. The admin can elevate a session to **edit mode** by giving a reason (stored in the audit log). Elevation lasts only for the current session (max 15 min).
3. Even in edit mode, a **block list** is never allowed while impersonating: campaigns and bulk sends, billing/plan changes, user/role/permission changes, any delete, WhatsApp and API credential changes. A single conversation reply is allowed and is tagged internally as sent by the admin.
4. Stealth: **hidden from the tenant, kept in platform audit.** No sign-in stamp, no presence change, no notification or email. Also no read receipts, no "mark as read", no change to conversation assignment or status. Platform logs still record who impersonated whom.
5. Exit ends the session cleanly with no tenant-visible trace.

## Goals / non-goals

Goals: user-level impersonation that works end to end; one central place that attaches the credential; exit that leaves no tenant-visible trace.
Non-goals: hiding anything from platform audit logs; changing normal sign-in; org-level impersonation as a separate mode (the user picker replaces it).

## Proposed design

1. **API token.** `POST /admin/organizations/:orgId/users/:userId/impersonate`. Verifies the user belongs to `:orgId` and is active and not deleted. Redis payload: `{ organizationId, targetUserId, issuedBy }`, TTL 900 s. Same 10/hour per-actor rate limit.
2. **Auth plugin.** On `X-Impersonate-Token`, load the target user (role, team, permissions, via the same resolution as the normal path) and set `request.auth` to that user, plus an `impersonatedBy: <adminId>` field on the auth context. Reuse the existing cache/permission logic. Do not duplicate it.
3. **Read-only enforcement.** In the auth plugin impersonation branch, set `request.auth.impersonation = { adminId, mode: "readonly" | "edit" }`. A single `preHandler` rejects every non-GET/HEAD request with 403 `IMPERSONATION_READ_ONLY` unless mode is `edit`, and rejects block-listed routes with 403 `IMPERSONATION_BLOCKED` even in edit mode. Exception: mark-as-read (`POST /conversations/:id/read`) and typing (`/typing`) return 204 as no-ops in read-only mode (and write/emit nothing in edit mode), so the inbox does not error. The block list is an explicit route allow/deny table in one file, with a test that fails if a new route is not classified.
3a. **Elevation.** `POST /admin/impersonation/elevate` takes `{ token, reason }` (reason required, 10-500 chars), sets mode `edit` in the Redis payload without extending its TTL, and writes the reason to the audit log.
3b. **Stealth.** Skip the `lastSignInAt` stamp and any presence/availability update in the impersonation branch. Suppress read-receipt, mark-as-read, assignment and status side effects when `request.auth.impersonation` is set. Audit every request that passes in edit mode (actor = admin, subject = target user).
3c. **Admin alert.** When an edit session starts, notify the other super admins (platform-side only, never the tenant).
4. **Web credential injection (cookie + sessionStorage + imp_meta).** Server-rendered pages cannot read `sessionStorage`, so the session is held in three places. (a) `sessionStorage` (per tab): the token and session record, read by the `ImpersonationProvider` fetch interceptor, which adds `X-Impersonate-Token` to browser calls to the API base and the same-origin `/api/v1` proxy. (b) `imp_token`, an httpOnly SameSite=Strict cookie (maxAge <= 900 s) set by `POST /api/impersonation`: server components and the `/api/v1` proxy add the header from it via `serverApiHeaders`. (c) `imp_meta`, a second httpOnly cookie with the non-secret session record (org, user, mode, expiry), updated on elevate. The cookie is the cross-tab source of truth: on mount, focus and visibility change an impersonated tab calls `GET /api/impersonation` and reconciles its `sessionStorage` and banner. Normal users (no cookie) run none of this. A forged cookie is not a bypass because the API validates the token. The API additionally requires the caller's own Clerk bearer to belong to the admin who issued the token (`issuedBy`), so a leaked token is useless on its own. A stale or revoked cookie sends the layout to `GET /api/impersonation/end`, which clears both cookies and returns to `/admin/organizations`. Residual risk: XSS in the tab can read the token; mitigated by the 15-minute TTL, read-only default, revocation, the issuer-bearer check and the audit trail.
5. **UI.** Org Details page gets a user list with "Login As" per user. The list view's "Login As" opens the same picker. The existing `ImpersonationBanner` is shown only to the admin, with an Exit button that revokes the token and clears the cookie.
6. **Schema.** Add `target_user_id` (nullable) to `impersonation_logs`. Hand-authored migration SQL (local DB is drifted, `prisma migrate dev` fails). Apply on prod via migration deploy. Rollback is dropping the column.

## Blocked while impersonating (any mode), and audit

- Whole families (any method): campaigns, billing, users, roles, teams, invitations, super-admins, admin, whatsapp-account, webhook-endpoints, webhook-actions, vendor-settings, organizations, onboarding, notifications, register. GETs of admin, super-admins, vendor-settings and webhook-actions are blocked too (secrets).
- Every DELETE.
- Individual routes: templates send-to-contact, contacts import start, flow PATCH and test, chatbot PATCH and activate, conversation assign and status, messages gaps requeue, auto-replies create and update, automation settings ooo/welcome/delayed.
- Contacts POST/PATCH stay edit-mode routes but do not fire flow triggers or assignment rules while impersonating.
- Unclassified routes are denied by default; a test fails when a route is not classified.
- Audit is fail-closed: in edit mode each passing write first inserts an admin audit row (route pattern only, never bodies); if the insert fails the request gets 503 `AUDIT_UNAVAILABLE`. Issuing a token creates the `ImpersonationLog` row first; elevation refuses (404) when no open log row matches.
- Demo tokens (`isDemo`) are exempt from the impersonation checks but can never reach `/v1/admin/*`.

## Security

- Gate: `requireSuperAdmin` on issue and revoke. Org scoping: target user must have `organizationId` equal to the route org id.
- Token is high-entropy, short-lived, revocable, and never logged.
- Read-only default means a mistaken click cannot reach customers. Edit mode needs a recorded reason and is limited by the block list. Remaining risk: a single reply sent in edit mode appears to come from the target user. Mitigation: it is tagged internally and attributed to the admin in platform audit.
- Super admins must not be impersonable, and impersonation must not be chained.
- Legal/privacy risk: covert access to tenant data may conflict with the product's terms and with data-protection laws. Required before release: add a Terms of Service clause that platform support may access accounts to provide service, which is what makes the hidden access defensible. This is a product/legal task and is a release blocker.

## Open questions / unknowns

1. How does the socket (Socket.IO) layer authenticate? I did not find the handshake in `apps/api/src`. It needs the same token or live inbox updates will show the admin's identity.
2. Do the 124 call sites share a common path I can change in one place? Needs classification before estimating.
3. Do outbound-message or "read by" features write the acting user's id in a way that exposes the admin? Needs a scan of message send routes.
4. Are Clerk webhooks (`clerk-webhook.ts:190-202`) triggered by impersonation? They should not be, since no Clerk session is created. Verify.
5. Does the 10/hour rate limit still make sense now that every user pick issues a token?

## Acceptance criteria

- From the admin Organizations page, pick an org, pick a user, land on `/dashboard` seeing exactly that user's data and permissions.
- A new session is read-only: every non-GET request returns 403 until the admin elevates with a reason.
- After elevation, a single reply works as that user, and block-listed actions (bulk send, billing, roles, deletes, credentials) still return 403.
- Read receipts, mark-as-read, assignment and status are unchanged by a session.
- The target user's `lastSignInAt`, availability, and notifications are unchanged after a session.
- Exit returns to admin and the token is revoked in Redis; further requests with it return 401.
- Every session and every write appears in platform audit and `impersonation_logs`.
- API tests cover issue (wrong org, inactive user, non-superAdmin, rate limit), auth-plugin impersonation branch, and no `lastSignInAt` stamp.

## Rollout / rollback

Ship behind the existing super-admin gate only. Rollback: revert the commit and drop the nullable column. No tenant data is modified by the migration.

## Operational checklist before release

- Confirm `IS_DEMO_MODE` is unset on the production API (the demo token yields an org-scoped superAdmin; it is blocked from `/v1/admin/*` but must not exist on prod).
- Add the Terms of Service clause that platform support may access accounts to provide service (release blocker, legal/product).
- Migration `20261003000000_impersonation_user_target` must be applied via the normal `prisma migrate deploy`. Only if it was applied by hand, run `prisma migrate resolve --applied 20261003000000_impersonation_user_target`.
- Run the manual test script in `.superpowers/sdd/2026-10-03-user-impersonation/task-6-report.md` against a non-production environment.
- Confirm the elevation email transport is configured (otherwise a warning is logged and other super admins are not emailed).

---

# Addendum (2026-10-03): support visibility (secrets readable, audited)

Status: IMPLEMENTED on main (see commit log). Replaces the earlier "View organization" proposal, which was dropped: logging in as an admin user already shows everything an admin sees.

## Problem (evidence)

- Settings pages load `GET /v1/vendor-settings` and `GET /v1/webhook-actions` (`settings/whatsapp-account/page.tsx:177`, `vendor-settings/page.tsx:15`, `webhook-actions/page.tsx:26`). These were in `BLOCKED_GET_PREFIXES`, so support saw blank/default state ("Not connected", "No phone number") and a red toast "This action is not allowed while impersonating a user." The blank state is misleading: it is hidden data, not missing data.
- The only on-load write on that page is the post-connect sync (`?connected=1`, line 166-171), which does not apply to a support session.
- A user session shows only what that user can see (`apps/api/src/lib/visibility.ts:23-31`), so support should log in as an admin user to see everything.

## Decisions (made with the user)

1. Super admins are the support team. No separate support role, no "View organization" mode.
2. Secrets (WhatsApp access token, webhook secrets) are **visible** to super admins in support sessions.
3. The user picker sorts admins first and shows what each role can see, so support picks the right user.

## Implementation

1. `GET /v1/vendor-settings*` and `GET /v1/webhook-actions*` are readable in impersonated sessions (removed from `BLOCKED_GET_PREFIXES`). `SECRET_READ_PREFIXES` lists them; each such read writes `adminAuditLog` action `impersonation.secret_read` (route pattern, org, admin; never values), awaited before the handler, **fail-closed** (503 `AUDIT_UNAVAILABLE`). Platform routes (`/v1/admin`, `/v1/super-admins`) stay blocked for GET.
2. Org details page: users sorted admin, manager, agent, viewer (inactive last) with a role hint (`apps/web/lib/support-users.ts`).
3. Writes remain read-only by default with the existing block list and edit-mode elevation.

## Risk

Visible secrets widen the impact of a compromised super-admin account. Mitigations: audit of every secret read, 15-minute sessions, per-hour issue limit, Clerk bearer binding. Recommended (not part of this change): enforce MFA on super-admin accounts.

## Acceptance criteria

- Settings > WhatsApp, Vendor settings, Webhook actions show real data in a support session with no error toast.
- Each secret-bearing GET writes `impersonation.secret_read` without the value; if the audit write fails the read is refused.
- Ordinary GETs and non-impersonated requests are not audited.
- The user list shows admins first with role hints.
