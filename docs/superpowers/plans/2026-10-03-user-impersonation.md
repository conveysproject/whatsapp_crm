# User impersonation: implementation plan

Spec: `docs/prd-user-impersonation.md` (v2). Status: awaiting user approval. No code written.

## Findings that resolve the PRD unknowns

1. **Socket.IO** (`apps/api/src/plugins/socketio.ts:26-39`): no authentication at all. Clients call `join-org` / `join-user` with any id. Impersonation needs no socket change: the web app already knows the org and user ids. Separate, pre-existing issue: anyone who knows an org id can subscribe to its room. Not in scope here, but it should be filed.
2. **Web call sites:** about 114 files read `NEXT_PUBLIC_API_URL` and call the API directly from the browser with a Clerk token (`getToken()` in about 124 files, 30 via `clientFetch`, about 98 with a raw `Authorization` header). Changing each one is too invasive. The existing proxy `apps/web/app/api/v1/[...path]/route.ts` is used by only a few callers. Server-side `auth()` is used only by API route handlers, `lib/api.ts` and the admin layout.
   **Decision:** one browser-side `fetch` interceptor, mounted once in the dashboard layout. It adds `X-Impersonate-Token` (read from `sessionStorage`) to requests whose URL starts with the API base. Since the API checks the impersonation header before the Authorization header (`auth.ts:14`), the existing Clerk header is harmlessly ignored. `sessionStorage` is per tab, so only the tab you opened as the user is impersonating. The proxy route also forwards the header.
3. **CORS** (`apps/api/src/index.ts:51-53`): `@fastify/cors` with defaults reflects requested headers, so the custom header needs no config change.
4. **Side effects to suppress** (`apps/api/src/routes/conversations.ts`): mark-as-read resets `unreadCount` (line 278-291), status change (193), assignment (229), typing indicator (298). Many are POST routes, so "block all non-GET" is correct for read-only mode, but a few POST routes are read-like (for example `/conversations/:id/summarize`). A route classification table is needed.
5. **Route volume:** 99 route files. The classification must be enforced by a test, not by review.

## Ordering constraint

Task 3 (read-only enforcement) must ship **before or with** Task 2 (user-level impersonation). The existing org-level token currently grants `superAdmin` with empty permissions. Do not release user-level impersonation without the read-only guard.

## Tasks (TDD, small)

**Task 1: Migration.** Add nullable `target_user_id` and `mode` text (default `readonly`) and `elevation_reason` text to `impersonation_logs`. Hand-authored SQL in `apps/api/prisma/migrations/`, update `schema.prisma`. After any out-of-band application on prod, run `prisma migrate resolve --applied <name>`. Rollback: drop the three columns.

**Task 2: Issue endpoint.** Replace the org-level token with `POST /admin/organizations/:orgId/users/:userId/impersonate`. Tests first: 403 non-superAdmin, 404 user not in that org, 404 inactive or deleted user, 403 target is a superAdmin, 429 over the per-hour limit, 200 stores `{ organizationId, targetUserId, issuedBy, mode: "readonly" }` with 900 s TTL and writes `ImpersonationLog` and `writeAdminAudit`.

**Task 3: Auth plugin + read-only guard.**
- In the impersonation branch, load the target user and resolve role, team and permissions via the existing logic. Set `request.auth.impersonation = { adminId, mode }`.
- Skip the `lastSignInAt` stamp.
- New `impersonation-guard.ts` preHandler. Non-GET/HEAD is 403 `IMPERSONATION_READ_ONLY` unless mode is `edit` or the route is in a `READ_LIKE_POST` list. Block-listed routes are 403 `IMPERSONATION_BLOCKED` even in edit mode: campaigns and bulk sends, billing and plans, users/roles/permissions, all DELETE, WhatsApp and API credentials.
- Test that enumerates every registered route and fails if a non-GET route is in neither the allow list nor the block list.

**Task 4: Side-effect suppression.** When `request.auth.impersonation` is set, mark-as-read, typing, assignment and status become no-ops, or are blocked in read-only mode. Tests per route. Verify that presence and availability are not updated.

**Task 5: Elevation + exit.** `POST /admin/impersonation/elevate` takes `{ reason }` (10-500 chars) with the token. It sets mode `edit` without extending the TTL, writes the reason to the log and audit, and notifies other super admins on the platform side. Keep and update the existing `DELETE .../impersonate` revoke endpoint.

**Task 6: Web interceptor and UI.**
- `ImpersonationProvider` in the dashboard layout patches `window.fetch` for API-base URLs.
- The `/api/v1` proxy forwards `X-Impersonate-Token`.
- Admin Organization Details gets a user list with "Login As"; the Organizations list "Login As" opens the same picker.
- Update `ImpersonationBanner` to show the user, the mode, an "Enable edit (reason)" button and Exit (revoke token, clear storage, return to `/admin/organizations`).
- Update the web tests.

**Task 7: Verify.** Run `/check`, `/test-api`, `/test-web`. Known flaky: 2 API failures (segments/conversations) and Redis-rejection noise. Security audit: every touched route for super-admin gating and org scoping. Manual test on a staging or real org: read-only blocks a send, elevate then a single reply works, bulk send is blocked, target's `lastSignInAt` and unread counts are unchanged, exit revokes the token (401 afterwards).

**Release blocker (not code):** add the Terms of Service clause about platform support access.

## Decisions (made)

1. Web approach: **fetch interceptor + sessionStorage**. Chosen as the most secure option that actually works: an httpOnly cookie cannot reach the cross-origin API, and migrating ~114 call sites is high-risk. Compensating controls: 15-minute TTL, read-only default, revocation, per-tab, API-origin only, full audit.
2. Org-level "Login As" is **replaced** by the user picker.
3. Rate limit stays at **10 tokens/hour/admin**. It caps damage if a super-admin account is compromised and stops bulk walking through many tenants. Each token is a 15-minute session, so 10 per hour is ample for support work.
