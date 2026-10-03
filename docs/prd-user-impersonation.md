# PRD: Super-admin impersonation of a specific user

Status: DRAFT v2 (risk-reduced design chosen by the user), awaiting final sign-off. No code has been written for this.

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
3. **Read-only enforcement.** In the auth plugin impersonation branch, set `request.auth.impersonation = { adminId, mode: "readonly" | "edit" }`. A single `preHandler` rejects every non-GET/HEAD request with 403 `IMPERSONATION_READ_ONLY` unless mode is `edit`, and rejects block-listed routes with 403 `IMPERSONATION_BLOCKED` even in edit mode. The block list is an explicit route allow/deny table in one file, with a test that fails if a new route is not classified.
3a. **Elevation.** `POST /admin/impersonation/elevate` takes `{ token, reason }` (reason required, 10-500 chars), sets mode `edit` in the Redis payload without extending its TTL, and writes the reason to the audit log.
3b. **Stealth.** Skip the `lastSignInAt` stamp and any presence/availability update in the impersonation branch. Suppress read-receipt, mark-as-read, assignment and status side effects when `request.auth.impersonation` is set. Audit every request that passes in edit mode (actor = admin, subject = target user).
3c. **Admin alert.** When an edit session starts, notify the other super admins (platform-side only, never the tenant).
4. **Web credential injection.** The browser calls the API directly on a different origin (about 114 call sites), so an httpOnly cookie on the web domain would never reach the API. Chosen design: the token lives in `sessionStorage` (per tab, cleared on exit or tab close) and one `ImpersonationProvider` adds `X-Impersonate-Token` only to requests whose URL starts with the API base. The `/api/v1` proxy forwards the header. See the implementation plan for the trade-off analysis. Residual risk: script injection (XSS) in the tab could read the token. Mitigated by 15-minute TTL, read-only default, revocation, per-tab scope, and the audit trail.
5. **UI.** Org Details page gets a user list with "Login As" per user. The list view's "Login As" opens the same picker. The existing `ImpersonationBanner` is shown only to the admin, with an Exit button that revokes the token and clears the cookie.
6. **Schema.** Add `target_user_id` (nullable) to `impersonation_logs`. Hand-authored migration SQL (local DB is drifted, `prisma migrate dev` fails). Apply on prod via migration deploy. Rollback is dropping the column.

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
