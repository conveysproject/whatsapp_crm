# PRD: Parent / child organizations

Update 2026-10-20: the global flag PARENT_ORGS_ENABLED was removed; the per-organization capability (isParent) is the only gate.

Status: APPROVED by the owner (2026-10-19). Next step: implementation plan.
Evidence base: scan of `origin/main` (fe595ba2), read-only. Items marked **Unverified** were not read.

## 1. Problem

Our clients (agencies, resellers) serve their own customers on WhatsApp. They want to:

1. Invite those customers onto WBMSG so each customer has its own organization.
2. Monitor all of those customers' messaging from one place.
3. Send messages for them through our API with a single parent credential.
4. Open a customer's account as an admin when they need to help.

Today there is no link between organizations. `Organization` has no parent field
(`apps/api/prisma/schema.prisma:36-85`), `orgType` is stored but no logic reads it, and the
Plivo-compatible API PRD lists reseller/BSP flows as out of scope (`docs/prd-plivo-compatible-api.md:7`).

## 2. Decisions made by the owner (2026-10-19)

| # | Decision |
|---|----------|
| D1 | Parent = our client's org. Child = a normal, separate org that logs in on its own. Children never use the parent's dashboard. |
| D2 | Parent invites a client by email; the client registers and is linked to the parent. |
| D3 | The child's invited WhatsApp Admin configures the child's WABA. The parent does not configure it. |
| D4 | The parent's backend sends for children via the API using the parent's credentials. Each call identifies the child by the child's WABA ID or phone number. |
| D5 | Replies from end customers stay in the child's own inbox. They are not forwarded to the parent. |
| D6 | The parent gets a new monitoring dashboard across all children. |
| D7 | The parent can impersonate a child as admin. |
| D8 | Billing stays as it is today. |
| D9 | Either side can end the link (parent removes child, or child leaves). |
| D10 | The invitee becomes `admin` of the new child org (already includes WABA settings) and can add `whatsappAdmin` users later. |
| D11 | The child identifier on API calls must be hardened (see section 6.1). |
| D12 | The parent can read everything in a child org, including message content, like a super admin. |
| D13 | The child sees that it is linked and sees a log of the parent's impersonation sessions. |
| D14 | No limit on the number of children per parent. |
| D15 | Only the parent's `admin` role can impersonate a child. |

## 3. Goals and non-goals

Goals: a one-level parent→child link; a parent dashboard; parent-key sending on behalf of a child;
parent impersonation of a child; either side can unlink.

Non-goals: multi-level hierarchy (a child cannot itself be a parent); billing changes or consolidated
billing; forwarding child replies to the parent; a parent configuring a child's WABA; mobile app support
(web only, mobile shows "use the website" like the WhatsApp Admin role); reseller/BSP features beyond this.

Anti-goals (failure even if it "works"): any query that lets a parent see an org that is not its linked
child; a child seeing parent data; impersonation without an audit row; a unlinked parent keeping access.

## 4. Architecture fit (evidence)

| Area | Today | Change |
|------|-------|--------|
| Invites | `POST /v1/invitations/:token/accept` always joins the inviter's org and needs a signed-in user whose email matches (`routes/invitations.ts:15-40`). Existing members get `ALREADY_MEMBER`. | New, separate client-invite flow that creates a new org. The invitee must be a new account. |
| API send | Org comes from the API key row (`routes/public-api/auth.ts:47`); send uses that org's phone number and WABA token (`routes/public-api/messages.ts:88`); worker re-reads them (`workers/public-api-send.worker.ts:49`). | If the call names a child, resolve it among the key org's children and send as the child. |
| Inbound | Org found by `phoneNumberId` (`routes/webhooks.ts:144`); forwarded to the key's `inboundUrl` (`lib/public-api/callbacks.ts:152-168`). `phoneNumberId` is **not unique** (`schema.prisma:41`). | No behavior change (D5). Add a uniqueness guard (see Risks). |
| Dashboard | `routes/analytics.ts:41` and `lib/dashboard-queries.ts` take `organizationId` per call; no shared guard. | New parent endpoints that take a resolved list of child org IDs from one helper. |
| Impersonation | Super admin only (`routes/admin.ts:14-20`); `ImpersonationLog` row first, Redis token `impersonate:<token>` TTL 900s, read-only by default, edit needs a 10-500 char reason (`admin.ts:245-372`); `plugins/auth.ts:94-137` checks the bearer belongs to `issuedBy` and the target is inside the org. Blocked prefixes in `impersonation-guard.ts`. | Allow a parent admin to start a session against a linked child only. Same log, token, TTL, read-only default. **Unverified:** full guard classification (`impersonation-guard.ts:44-240`). |
| Roles | Fixed `whatsappAdmin` role: WABA settings only (`lib/default-role-permissions.ts:108-117`); grantable by admin/superAdmin (`lib/role-grants.ts:6`). | Reused for the child's invited user (D3). |

## 5. Data model (hand-authored SQL migration; local DB is drifted)

- `organizations.parent_organization_id` UUID NULL, FK to `organizations(id)` ON DELETE SET NULL, index.
  Rule enforced in code: parent must itself have no parent (one level).
- New table `client_invitations`: `id`, `parent_organization_id`, `email`, `token` unique, `status`
  (pending/accepted/revoked/expired), `expires_at`, `created_by`, `created_at`, `accepted_org_id`.
  Separate from `invitations` because accepting creates an org.
- `parent_link_events` (audit): `organization_id`, `parent_organization_id`, `action`
  (linked/unlinked_by_parent/unlinked_by_child), `actor_id`, `at`.
- Impersonation: reuse `impersonation_logs`; `actor_id` today means "superAdmin who initiated"
  (`schema.prisma:1501`). Add `actor_organization_id` (NULL for super admin) so parent sessions are distinguishable.
- Rollback: drop the new column and tables; no existing columns change.

## 6. API contract

- `POST /v1/client-invitations` (parent admin): create invite by email. `GET`, `DELETE` to list/revoke.
- `POST /v1/client-invitations/:token/accept` (public + signed in): creates the child org, links it to the
  parent, makes the invitee a user of the child org. **Open Q1: which role.**
- `GET /v1/parent/children`, `GET /v1/parent/dashboard`, `GET /v1/parent/children/:id/stats`:
  parent only; all queries scoped to the parent's current children.
- `DELETE /v1/parent/children/:id` (parent) and `POST /v1/organization/leave-parent` (child admin): unlink.
- `POST /v1/parent/children/:id/impersonate`: parent admin only; returns the same kind of token as today.
- Public API send: optional child identifier on the existing send call. Recommended default: the existing
  `src` field already carries the sender number and must match the org's number
  (`messages.ts:89-94`); with a parent key, `src` is resolved among the parent's children. Optional
  `waba_id` for the WABA-ID form (D4). Unknown or unlinked child → 403, never a fallback to the parent's own number.
- Backward compatible: a call without a child identifier behaves exactly as today. Behind env flag
  `PARENT_ORGS_ENABLED` (off by default, same pattern as the Plivo API flag).

### 6.1 Hardened child identification (owner asked for more security; this is my design, to confirm)

1. The key needs an explicit scope `send_for_children`. Existing keys do not have it, so they can never act for another org.
2. The child is named by the child's WABA ID or phone number. The server resolves it only among the key org's current children (`parent_organization_id = key.organizationId`), checked on every request.
3. Unknown, unlinked and "belongs to someone else" all return the same 403, so a parent cannot probe which numbers exist on the platform.
4. If both a WABA ID and a number are sent, they must resolve to the same child, otherwise 403.
5. The send uses only the child's own stored number and WABA token. A caller-supplied sender that does not match is rejected, never substituted.
6. Every on-behalf send is audited with key id, parent org, child org, destination and time.
7. Rate limits apply per key and per child.
8. The child sees the parent's sends in its own message history, marked as sent by the parent's API key.
9. Unlinking, revoking the key or removing the scope stops sends at once. Optional later: IP allow-list per key.

## 7. Parent dashboard (existing metrics only)

Per child and in total: messages sent / delivered / read / failed / received, trend over time, failure rate,
last activity, WABA connection state, and quality rating if the system already stores it. Click-through
to one child's detail, and an "Open as admin" button (impersonation). **Open Q3: message content visibility.**
Web only. Per D12 the parent may read message content for its children, not only counts. Every content
read by a parent is audit-logged with parent user, child org and time, and is covered by D13 so the child can see it.

## 8. Security

- One helper `getChildOrgIds(parentOrgId)`; every parent endpoint calls it; no raw `organizationId` from the body or query.
- New permission `parent_access`; default admin only. Manager/agent/viewer/whatsappAdmin: no access.
- Parent reads of child content (D12) are limited to current children, require `parent_access`, are rate limited and are written to the audit log; children are told in the UI and in the invite email that the parent has this access.
- A child never sees parent data, parent API keys, or other children.
- Parent API key may act only for orgs where `parent_organization_id = key.organizationId` at call time (checked per request, so unlinking revokes at once).
- Impersonation: parent admin only, target must be a current child, read-only by default, edit needs a reason, every request audited (existing `auditOrRefuse`), TTL 900s, parent session ends if link is removed.
- Invite tokens: single use, expiry, email must match on accept, rate limited like `invitations.ts`.
- Secrets: no WABA tokens returned to the parent; parent never sees a child's `wabaAccessToken`.
- Audit: link, unlink, invite, impersonation all logged.

## 9. Billing

Unchanged (D8). A message sent by a parent key for a child is sent from the child's org, so it is counted
and billed against the child as any child message is today. **To confirm in sign-off.**

## 10. Rollout

1. Merge behind `PARENT_ORGS_ENABLED=false`; migration applies on deploy (`migrate deploy`).
2. Prod dry-run script (read-only, run via `railway run`) to list duplicate `phone_number_id` values before adding any uniqueness constraint.
3. Enable for one pilot client; watch audit and error logs.
4. Rollback: flag off; if needed drop new column/tables.

## 11. Acceptance criteria

- Parent invites an email; the invitee registers and appears under the parent; link is logged.
- Parent dashboard shows only its own children; a second parent cannot see them (test).
- Parent key send with a child's number/WABA ID sends from the child's number; with a non-child → 403.
- After unlink (either side), the parent's dashboard, API send and impersonation for that child all fail immediately.
- Child replies appear in the child's inbox and are not delivered to the parent.
- Parent impersonation writes an `impersonation_logs` row identifying the parent org and user.
- Flag off: no behavior change anywhere (existing tests pass).

## 12. Test plan

Vitest in `apps/api`: org-scoping tests for every parent route (cross-tenant negatives), RBAC matrix per role,
public-API send with child resolution, unlink invalidation, impersonation start/guard, invite accept
(email mismatch, expired, existing member). Web tests for the dashboard and invite pages. Run `/check`,
`/test-api`, `/test-web`; known flaky tests are listed in the product workflow skill.

## 13. Risks

- `phone_number_id` is not unique: with many children a duplicate would route replies to the wrong org.
  Mitigation: dry-run for existing duplicates, then a partial unique index.
- Dashboard queries have no shared guard (`dashboard-queries.ts`): reuse only through the new helper.
- Impersonation guard rules are long and not fully read: needs a focused review before enabling for parents.
- Scan was read from `origin/main` for auth/invites; other files were identical between the stale branch and main.

## 14. Open questions

All six questions from the first draft are answered (D10 to D15). Remaining for sign-off:

1. Confirm the hardened child identification in section 6.1.
2. Confirm billing: a parent-sent message is billed to the child org (D8 consequence).
3. D12 gives the parent full read access. Confirm the invite email and the child's "Linked to <parent>" page
   both state this plainly, and that a child may unlink at any time (D9). Privacy and data-protection
   terms for end customers' messages are a legal matter outside this PRD; flag to whoever owns the terms of service.
