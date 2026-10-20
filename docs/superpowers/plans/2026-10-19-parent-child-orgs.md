# Parent / Child Organizations Implementation Plan

Update 2026-10-20: the global flag PARENT_ORGS_ENABLED was removed; the per-organization capability (isParent) is the only gate.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client (parent org) invites its customers as child orgs, monitors them on a new dashboard, sends for them through the API with one parent key, and can open a child as admin.

**Architecture:** One nullable self-reference on `organizations`. A single helper module (`lib/parent-orgs.ts`) is the only place that decides "is X a current child of Y". Every parent route, the parent-key send path and parent impersonation call it on every request, so unlinking cuts access at once. Child orgs stay ordinary orgs: their own inbox, users, WABA and billing are untouched.

**Tech Stack:** Fastify + Prisma + Redis + BullMQ (apps/api), Next.js (apps/web), Vitest. Hand-authored SQL migrations (local DB is drifted, `prisma migrate dev` fails).

**Spec:** `docs/prd-parent-child-orgs.md` (approved 2026-10-19). Decisions D1-D15 and section 6.1 apply.

## Global Constraints

- Feature flag env var `PARENT_ORGS_ENABLED`, off by default. Flag off means no behavior change anywhere.
- One level only: a parent must have `parent_organization_id IS NULL`, and a child can never become a parent.
- New permission key `parent_access`, granted to `admin` only (D15). Not to manager, agent, viewer or `whatsappAdmin`.
- New API key scope string `send_for_children`. Existing keys (`scopes: ["whatsapp"]`) never get it implicitly.
- Unknown, unlinked and "someone else's" child all return the same 403 body (no enumeration).
- Impersonation: token TTL 900s, starts `readonly`, edit needs a reason of 10-500 chars, `ImpersonationLog` row written before the token exists, every request audited.
- Parent never receives a child's `wabaAccessToken` in any response.
- Billing unchanged: a parent-sent message is stored in the child org and billed to the child (D8).
- Secrets rule (`CLAUDE.md`): no literal credentials in code, tests or scripts. Tests use fakes such as `"test-secret"`. Prod scripts read `process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"]`, dry-run by default.
- Every new/changed API route needs `organizationId` scoping and an RBAC check, plus a cross-tenant negative test.
- No "Plivo" in customer-facing text. Do not add Clerk anything (removed).

## Review Focus

- Parent B calls parent A's child (or a random org id / number): must be 403, same body as "unknown".
- Child unlinks (or parent removes it) while a parent API send, dashboard tab or impersonation session is live: next request must fail.
- Child number changes or the child disconnects its WABA after linking: send must return `WHATSAPP_NOT_CONNECTED`, never fall back to the parent's own number.
- Parent key without `send_for_children` sends with a child's number as `src`: must behave exactly as today (`SRC_MISMATCH`).
- Status callbacks and inbound for a child message sent by the parent key: must still reach the parent's `callbackUrl` and must not trip the worker's org check or leak to another parent.
- Invitee already belongs to a workspace, wrong email, expired or reused token: each rejected with no org created.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261020000000_parent_child_orgs/migration.sql` | Columns and tables |
| `apps/api/scripts/check-duplicate-phone-number-ids.mjs` | Read-only prod check |
| `apps/api/src/lib/parent-orgs.ts` (+ `.test.ts`) | Flag, child lookup, one-level rule |
| `apps/api/src/lib/default-role-permissions.ts` | `parent_access` for admin |
| `apps/api/src/routes/client-invitations.ts` | Invite create/list/revoke/accept |
| `apps/api/src/routes/parent.ts` | Children list, dashboard, per-child stats and messages, unlink, impersonate |
| `apps/api/src/lib/parent-dashboard-queries.ts` | Stats over a list of child org ids |
| `apps/api/src/routes/organizations.ts` (or new `routes/org-link.ts`) | Child side: link info, leave, parent-session log |
| `apps/api/src/routes/public-api/auth.ts`, `messages.ts`, `lib/public-api/child-send.ts` | Parent-key child resolution |
| `apps/api/src/workers/public-api-callbacks.worker.ts`, `lib/public-api/callbacks.ts` | Accept parent key for child messages |
| `apps/api/src/plugins/auth.ts`, `plugins/impersonation-guard.ts` | Parent-issued impersonation tokens |
| `apps/web/app/(dashboard)/parent/**`, invite and settings UI | Web screens |

---

### Task 1: Branch, migration and prod duplicate check

**Files:**
- Create: `apps/api/prisma/migrations/20261020000000_parent_child_orgs/migration.sql`, `apps/api/scripts/check-duplicate-phone-number-ids.mjs`
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces (Prisma): `Organization.parentOrganizationId String?`, `Organization.isParent Boolean @default(false)`, `ClientInvitation`, `ParentAuditEvent`, `ImpersonationLog.actorOrganizationId String?`, `ApiMessageMeta.parentOrganizationId String?`.

- [ ] **Step 1:** From `origin/main` create a worktree and branch `feat/parent-child-orgs` (use superpowers:using-git-worktrees). The main checkout has uncommitted mobile work, so do not touch it.
- [ ] **Step 2:** Write the migration SQL by hand:
  - `organizations`: `parent_organization_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL`, `is_parent BOOLEAN NOT NULL DEFAULT false`, index on `parent_organization_id`, `CHECK (parent_organization_id IS NULL OR parent_organization_id <> id)`.
  - `client_invitations(id, parent_organization_id, email, token UNIQUE, status DEFAULT 'pending', expires_at, created_by, accepted_org_id NULL, created_at)`.
  - `parent_audit_events(id, parent_organization_id, child_organization_id NULL, actor_user_id NULL, action, metadata JSONB, created_at)`, indexes on both org ids and `created_at`.
  - `impersonation_logs.actor_organization_id TEXT NULL`; `api_message_metas` (check the real `@@map` name) `parent_organization_id TEXT NULL`.
  - Do NOT add a unique index on `phone_number_id` in this migration (see Step 4).
- [ ] **Step 3:** Mirror every change in `schema.prisma` (same `@map` names). Run `pnpm --filter api exec prisma validate` and `prisma generate`. Expected: valid, client generated.
- [ ] **Step 4:** Write `check-duplicate-phone-number-ids.mjs`: read-only `SELECT phone_number_id, count(*) ... HAVING count(*) > 1`, connection from `process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"]`, throws if neither is set, prints counts only (no tokens). Ask the owner to run it with `railway run --service Postgres node apps/api/scripts/check-duplicate-phone-number-ids.mjs`. A uniqueness index is a later, separate migration after the result is known.
- [ ] **Step 5:** `pnpm --filter api type-check` passes. Commit with explicit paths.

### Task 2: Core helper `lib/parent-orgs.ts`

**Files:** Create `apps/api/src/lib/parent-orgs.ts`, `apps/api/src/lib/parent-orgs.test.ts`. Modify `apps/api/src/lib/default-role-permissions.ts`.

**Interfaces (Produces):**
```ts
export function parentOrgsEnabled(): boolean;                       // process.env["PARENT_ORGS_ENABLED"] === "true"
export async function getChildOrgIds(prisma: PrismaClient, parentOrgId: string): Promise<string[]>;
export async function isChildOf(prisma: PrismaClient, parentOrgId: string, childOrgId: string): Promise<boolean>;
export async function getParentOf(prisma: PrismaClient, childOrgId: string): Promise<{ id: string; name: string } | null>;
export async function canBeParent(prisma: PrismaClient, orgId: string): Promise<boolean>; // isParent && parentOrganizationId === null
export async function linkChild(prisma: PrismaClient, parentOrgId: string, childOrgId: string, actorUserId: string | null): Promise<void>;
export async function unlinkChild(prisma: PrismaClient, childOrgId: string, by: "parent" | "child", actorUserId: string): Promise<void>;
```

- [ ] **Step 1: Write failing tests** (mock prisma): `getChildOrgIds` filters `where: { parentOrganizationId }`; `isChildOf` is false for an unrelated org and for itself; `linkChild` throws when the parent has a parent, when the child already has a parent, when the child has children, or when parent is not `isParent`; `unlinkChild` clears the column and writes a `parent_audit_events` row with `unlinked_by_parent` or `unlinked_by_child`; `parentOrgsEnabled()` is false unless the env is exactly `"true"`.
- [ ] **Step 2:** Run `pnpm --filter api exec vitest run src/lib/parent-orgs.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement. `linkChild` and `unlinkChild` run in one `prisma.$transaction`; `linkChild` writes a `linked` audit row.
- [ ] **Step 4:** In `default-role-permissions.ts` add `parent_access: "allow"` to `admin` only. Add a test in `permissions.test.ts` asserting manager, agent, viewer and whatsappAdmin do not have it.
- [ ] **Step 5:** Run both test files. Expected: PASS. Commit.

### Task 3: Super admin switch for "this org is a parent"

The PRD does not say who may become a parent. **My call, needs owner sign-off:** only a super admin turns it on, per org.

**Files:** Modify `apps/api/src/routes/admin.ts` (or the admin org-update route found there), its test file.

**Interfaces:** Produces `PATCH /v1/admin/organizations/:orgId/parent-capability` body `{ enabled: boolean }`, super admin only (`requireSuperAdmin`), writes `writeAdminAudit` action `org.parent_capability`.

- [ ] **Step 1: Failing tests:** super admin enabling returns 200 and sets `isParent`; admin of an org gets 403; disabling a parent that still has children returns 409 `HAS_CHILDREN`; flag off returns 404.
- [ ] **Step 2:** Run to confirm FAIL. **Step 3:** Implement. **Step 4:** Run, PASS. Commit.

### Task 4: Client invitations (create, list, revoke, accept)

**Files:** Create `apps/api/src/routes/client-invitations.ts` + test; modify `routes/index.ts` (register with prefix `/v1`); modify `apps/api/src/routes/register.ts` only to extract its org-and-admin-user creation into an exported helper `createOrganizationWithAdmin(tx, input)` (read `register.ts:20-140` first; keep its behavior and tests unchanged).

**Interfaces:**
- `POST /v1/client-invitations` body `{ email }`: needs `parent_access` and `canBeParent(orgId)`; rate limit like `invitations.ts` (30/hour per org); token via `crypto.randomUUID()`, expiry 7 days; sends email with the existing invitation email builder, text states that the parent will have full read access to the new account (D12).
- `GET /v1/client-invitations`, `DELETE /v1/client-invitations/:id` (revoke). Org from `request.auth.organizationId`, never from the body.
- `GET /v1/client-invitations/:token` (public): returns `{ parentName, email }` for the accept page.
- `POST /v1/client-invitations/:token/accept` (public config, signed-in via `verifyBearer`), body `{ fullName, organizationName, mobileNumber? }`: 401 if not signed in, 400 on invalid/expired/used token, 403 `EMAIL_MISMATCH` if the signed-in account email differs, 409 `ALREADY_MEMBER` if the user exists. On success, in one transaction: create the child org + user with role `admin` (D10), `linkChild`, mark invite `accepted` with `accepted_org_id`.

- [ ] **Step 1: Failing tests** for each status code above, plus: parent without `parent_access` gets 403; org that is not a parent gets 403; duplicate pending invite for the same email returns 409; accept leaves no org behind on any failure; flag off returns 404.
- [ ] **Step 2:** Run to FAIL. **Step 3:** Extract the helper in `register.ts`; run the existing register tests (PASS) before continuing. **Step 4:** Implement routes. **Step 5:** Run new and register tests, PASS. Commit.

### Task 5: Parent dashboard and per-child data

**Files:** Create `apps/api/src/lib/parent-dashboard-queries.ts` + test, `apps/api/src/routes/parent.ts` + test; register in `routes/index.ts`.

**Interfaces:**
```ts
export async function getChildrenOverview(prisma, parentOrgId: string, range: { from: Date; to: Date }): Promise<ChildOverview[]>;
// ChildOverview: { orgId, name, sent, delivered, read, failed, received, failureRate, lastActivityAt, wabaConnected, qualityRating: string | null }
export async function getChildStats(prisma, parentOrgId: string, childOrgId: string, range): Promise<ChildStats>; // throws ChildNotFoundError when !isChildOf
```
Routes (all need `parent_access`, flag, and call `getChildOrgIds`/`isChildOf`): `GET /v1/parent/children`, `GET /v1/parent/dashboard?from&to`, `GET /v1/parent/children/:childId/stats`, `GET /v1/parent/children/:childId/messages?cursor&limit` (includes message body, writes a `content_read` row to `parent_audit_events` with actor user, child org, count; rate limited). `ChildNotFoundError` maps to the shared 403.

- [ ] **Step 1: Failing tests:** every SQL/Prisma call receives only ids from `getChildOrgIds` (assert the exact array); a second parent's id for `:childId` returns 403 with the same body as a nonexistent id; response never contains `wabaAccessToken`; a manager gets 403; an unlinked child disappears from the next call; the content read writes exactly one audit row.
- [ ] **Step 2:** Run to FAIL. **Step 3:** Implement using existing definitions of sent/delivered/read/failed from `lib/dashboard-queries.ts` (reuse its counting rules, do not redefine them). **Step 4:** Run, PASS. Commit.

### Task 6: Parent-key sending for a child (security-critical)

**Files:** Create `apps/api/src/lib/public-api/child-send.ts` + test. Modify `routes/public-api/auth.ts`, `routes/public-api/messages.ts`, `workers/public-api-send.worker.ts`, `workers/public-api-callbacks.worker.ts`, `lib/public-api/callbacks.ts`, their tests. Modify the API credential creation route (`routes/api-credentials.ts`) so a parent admin can create a key with the extra scope.

**Interfaces:**
```ts
export class ChildForbiddenError extends Error {}                    // mapped to apiError(reply, 403, "FORBIDDEN_CHILD")
export async function resolveSendTarget(
  prisma, key: { id: string; organizationId: string; scopes: string[] },
  input: { src: string; wabaId?: string },
): Promise<{ organizationId: string; viaParentOrgId: string | null }>;
```
Rules for `resolveSendTarget` (PRD 6.1):
1. If the key org's own connected number equals `src` and no `wabaId`: return the key org, `viaParentOrgId: null` (today's behavior, unchanged).
2. Otherwise require scope `send_for_children`, `parentOrgsEnabled()`, and `canBeParent(key.organizationId)`; else throw `ChildForbiddenError`.
3. Look up children of the key org only (`getChildOrgIds`) whose `current_phone_number_number` vendor setting equals `src` (digits only). If `wabaId` is given, it must equal that child's `whatsappBusinessAccountId`, and if only `wabaId` is given it must resolve to exactly one child. Zero or multiple matches throw `ChildForbiddenError`.
4. The child must be `status = "active"` with `phoneNumberId` and `wabaAccessToken`, else `WHATSAPP_NOT_CONNECTED` (not 403, and never fall back to the parent number).

In `messages.ts`: call `resolveSendTarget` right after `parseSendBody`; use the returned `organizationId` for everything downstream (org lookup, templates, contact upsert, message rows, queue payload); store `ApiMessageMeta.apiKeyId = key id`, `organizationId = child`, `parentOrganizationId = parent`. Keep API-usage attribution on the key's owner org (my call: usage tracking is the parent's API traffic, not billing).

- [ ] **Step 1: Failing tests for `resolveSendTarget`:** own number returns own org; child number without scope throws; child number with scope returns child; number of another parent's child throws; unknown number throws; both forbidden cases produce an identical response body; `wabaId` mismatch throws; `wabaId`-only resolves; two children sharing a number throws; unlinked child throws on the next call; flag off behaves as today.
- [ ] **Step 2: Failing route tests in `messages.test.ts`:** parent key plus child `src` sends with the child's phone number id and token and writes `parentOrganizationId`; contacts and template lookup use the child org; the parent's own token is never used; message appears in the child org.
- [ ] **Step 3:** Run to FAIL. **Step 4:** Implement `child-send.ts` and the `messages.ts` change. **Step 5:** In the callbacks worker, replace the `key.organizationId === job organizationId` check with "equal, or `isChildOf(key.organizationId, job organizationId)`"; add a test that a child message's status callback is delivered to the parent key's `callbackUrl` and one for an unrelated org is dropped. **Step 6:** Run all `public-api` tests, PASS. Commit.
- [ ] **Step 7:** Security review of this task on the most capable model before moving on (auth + tenancy).

### Task 7: Parent impersonation of a child (security-critical)

**Files:** Modify `apps/api/src/plugins/auth.ts` (impersonation branch, around lines 94-137), `plugins/impersonation-guard.ts`, `routes/parent.ts`, `routes/admin.ts` (elevate route), tests for each. Read all of `impersonation-guard.ts:44-240` and `plugins/auth.ts` first; they were not fully read in the PRD scan.

**Interfaces:**
- `POST /v1/parent/children/:childId/impersonate` body `{ userId?: string }`: `parent_access`, `isChildOf`, rate limit 10/hour per actor (reuse the Redis counter pattern in `admin.ts`). Target defaults to the child's oldest active `admin`; if `userId` is given it must belong to the child and not be a superAdmin. Order: `ImpersonationLog` first (with `actorId`, `actorOrganizationId` = parent org, `mode: "readonly"`), then Redis `impersonate:<token>` TTL 900s with `{ organizationId: child, targetUserId, issuedBy, issuedSid, issuedByOrgId: parent, mode: "readonly" }`, then a `parent_audit_events` row `impersonate_started`.
- In `auth.ts`: a token with `issuedByOrgId` is validated against the bearer's session type for normal users (not the `typ === "admin"` super-admin check), requires the bearer's own org to equal `issuedByOrgId`, requires `isChildOf(issuedByOrgId, payload.organizationId)` on every request, and still rejects superAdmin targets. Tokens without `issuedByOrgId` keep exactly today's super admin rules.
- Parent sessions stay read-only unless elevated: extend the elevate route so a parent session can be elevated by its issuer with a reason of 10-500 chars (log updated first, TTL preserved). Keep the guard's blocked prefixes (`/v1/invitations`, `/v1/organizations`, `/v1/admin`, `/v1/api-credentials`, `/v1/users`) blocked for parent sessions, and add `/v1/parent` and `/v1/client-invitations` to it.

- [ ] **Step 1: Failing tests:** non-admin parent user 403; non-child 403 (same body as unknown); superAdmin target 403; log row exists before the token; leaked token with a different bearer 401; token stops working after `unlinkChild` (401); token cannot call `/v1/parent/*`, `/v1/api-credentials` or `/v1/users`; read-only session cannot write; elevation needs a reason; existing super admin impersonation tests unchanged and green.
- [ ] **Step 2:** Run to FAIL. **Step 3:** Implement. **Step 4:** Run `auth.test.ts`, `impersonation-guard` tests and the admin tests, PASS. Commit.
- [ ] **Step 5:** Security review on the most capable model.

### Task 8: Child-side visibility and leaving

**Files:** Create `apps/api/src/routes/org-link.ts` + test; register it.

**Interfaces:** `GET /v1/organization/parent-link` returns `{ parent: { name } | null, sessions: [{ startedAt, endedAt, mode, actorName }] }` (admin of the child only, org from `request.auth`); `POST /v1/organization/leave-parent` (child admin only) calls `unlinkChild(..., "child", userId)`.

- [ ] **Step 1: Failing tests:** non-admin 403; org without a parent returns `parent: null`; sessions come only from `impersonation_logs` where `organization_id` is the caller's org and `actor_organization_id` is not null; leaving clears the link and the parent's next dashboard or send call fails; org B cannot read org A's sessions.
- [ ] **Step 2-4:** FAIL, implement, PASS. Commit.

### Task 9: Web screens

**Files:** Create under `apps/web/app/(dashboard)/parent/` (overview table, child detail with stats and message list, invite client dialog, pending invites); modify the settings/WhatsApp-account area for the child banner "Linked to <parent>" with the access statement and a "Leave" button plus the parent-session log; modify nav and `lib/settings-tiles.ts` so the Parent entry shows only for users with `parent_access` in a parent org; add the public accept page at `apps/web/app/` next to the existing invite accept page (find it by searching for `/invitations/` in `apps/web`). Mobile: show the "use the website" gate like the WhatsApp Admin role (`web_only`).

- [ ] **Step 1:** Write component tests (Vitest) for: nav hidden without permission; overview renders per-child rows and an "Open as admin" button that calls the impersonate route; accept page shows the full-read-access sentence; child banner shows parent name and session list; leave button asks for confirmation. Show only features that exist in the system, mark new items "New" (project rule).
- [ ] **Step 2-4:** FAIL, implement, PASS. Run `pnpm --filter web type-check` and lint. Commit.

### Task 10: Verify, audit, document, roll out

- [ ] **Step 1:** Root `pnpm lint` and `pnpm type-check`; `/test-api` and `/test-web`. Expected: green apart from the known flaky tests (2 API failures in segments/conversations, Redis noise). Report anything else as real.
- [ ] **Step 2:** Security audit table in the PR: for every new route, the `organizationId` scoping and the permission check, with the cross-tenant test that proves it.
- [ ] **Step 3:** Docs: add the parent-child runtime reference to `docs/auth-and-permissions.md`; add the env var to `.env.example` as a name only.
- [ ] **Step 4:** Release: deploy with `PARENT_ORGS_ENABLED` unset; owner runs the duplicate check script; super admin enables the pilot org; set the flag; watch `parent_audit_events` and API errors. Rollback: unset the flag.
- [ ] **Step 5:** Save a project memory entry. Finish the branch by merging locally (user's rule).

---

## Self-review

- **PRD coverage:** D1-D3 Tasks 4 and 8; D4/D11 Task 6; D5 unchanged (no task touches inbound routing; Task 6 only widens the callback worker check); D6 Task 5; D7/D15 Task 7; D8 Global Constraints and Task 6 note; D9 Tasks 2 and 8; D10 Task 4; D12 Task 5 messages route and Task 7; D13 Tasks 8 and 9; D14 no limit (nothing added); section 8 audit in Tasks 2, 5, 7; rollout Task 10.
- **Gap found while planning (not in the PRD):** nothing says who may become a parent. Task 3 adds a super admin switch. Needs the owner's yes.
- **Other calls I made:** parent API-usage attribution stays with the key owner; `parent_audit_events` is one table for links, content reads and impersonation starts; per-send audit is the `parent_organization_id` column on `ApiMessageMeta` instead of a separate row per send.
- **Not read before planning (executors must read first):** `register.ts` org-creation internals, the full `impersonation-guard.ts`, the web invite accept page location, the `ApiMessageMeta` table name.
- **Order constraints:** Task 1 before everything; Task 2 before 4-8; Tasks 6 and 7 each end with a most-capable-model security review; Task 9 after the APIs it calls; do not add a `phone_number_id` unique index until the owner has run the duplicate check.
