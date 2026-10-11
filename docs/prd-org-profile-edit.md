# PRD: Editable business profile + secret-leak fix on org PATCH

Status: DRAFT, awaiting owner sign-off. No code changed.

## Problem (evidence)
- `PATCH /v1/organizations/me` accepts only `name` and `settings`, `additionalProperties: false` (organizations.ts:58-70). The business profile collected at onboarding (`phone`, `website`, `location`, `industry`, `subCategory`, `facebookPageId`, `instagramAccountId`; schema.prisma:43-51) can never be corrected after registration. The Account Details page now shows it read-only.
- **Security defect (existing):** the PATCH handler returns `prisma.organization.update(...)` with no `select` (organizations.ts, end of PATCH handler), so the response contains every column, including `wabaAccessToken` and `stripeId` (schema.prisma:41, :69). The branding POST routes do the same (`return reply.send({ data })`). The GET route correctly uses `ORG_PUBLIC_SELECT`; the write routes do not. Any admin/manager calling PATCH receives the WABA access token in the browser. `organizations.test.ts` only asserts the GET select, so this is untested.
- Roles: PATCH allows `admin` and `manager` by role string (organizations.ts), not by a permission key. Branding POST is admin-only.
- Onboarding validation is thin: `industry` is a bare string (register.ts:42); there is no format check on phone or website.
- No org-level audit trail: `writeAdminAudit` writes to `adminAuditLog` and is used by platform-admin routes only (lib/audit.ts).

## Goals
1. **P0:** stop returning secrets from `PATCH /organizations/me` and the five branding POSTs: add `select: ORG_PUBLIC_SELECT`. Add tests asserting the update call's `select` and that the response has no `wabaAccessToken`/`stripeId`.
2. Let admins edit the business profile on Account Details: phone, website, location, industry, subCategory.
3. Validate input server-side.

## Non-goals
- `facebookPageId`, `instagramAccountId`, `metaBusinessId`, WABA ids: connection-managed, stay read-only.
- Org name rename UI is included only if owner agrees (API already supports it).
- Plan/billing fields, `status`, `slug`, `domain`.

## Design
- API: extend PATCH body schema with the five string fields (`type: string|null`, `maxLength` per field; website must be `http(s)://` and is normalised; phone matches `^[+0-9 ()-]{5,20}$`). Empty string stores `null`. `industry`/`subCategory` free text unless owner wants a fixed list (open question).
- Scoping: update is by `request.auth.organizationId` only (already so); no id taken from the body.
- RBAC: unchanged role gate (admin, manager) unless owner prefers admin-only (open question). During user impersonation, writes are already blocked/read-only by default (see project_user_impersonation); verify with a test.
- Web: edit mode on the Business profile card (admin/manager only), client component calling PATCH through the existing client-fetch helper, inline validation, success/error toast.
- No DB migration (columns exist).

## Rollout / rollback
Frontend + API in one deploy. No data migration. Rollback = revert commit. The secret-leak fix is backward compatible (response is a subset).

**Because the leak exposes a live token to browsers, recommend rotating risk review:** check whether any logs/analytics captured PATCH responses. Token rotation itself is the owner's call.

## Security checklist
- Org scoping: by `request.auth.organizationId` (existing).
- RBAC: server-side role check kept; UI hiding is cosmetic only.
- Response shaping: `ORG_PUBLIC_SELECT` on all org writes.
- Input: schema validation, `additionalProperties: false`, length caps, URL scheme allow-list (no `javascript:`), rendered as text (React escapes).
- Mass assignment: whitelist only; protected `settings` keys behaviour unchanged.

## Acceptance criteria
- PATCH/branding responses never contain `wabaAccessToken` or `stripeId` (test).
- Admin can edit and save profile fields; invalid phone/website returns 400 with a clear message.
- Agent role gets 403 on PATCH and sees no edit button.
- Cross-org: a request cannot affect another org (test with mismatched ids in body is rejected by schema).
- Existing org tests still pass.

## Test plan
Vitest API: select on update, 403 for agent, 400 for bad website/phone, null on empty string. Web: helper tests for validation/normalisation (shared rules), render checks for edit visibility.

## Open questions (owner)
1. Who may edit the profile: admin only, or admin + manager (current PATCH rule)?
2. Industry/sub-category: free text, or fixed list matching onboarding?
3. Include org-name rename in the UI?
4. Add an org-level change log (new table + migration), or skip for now?
5. Fix the secret leak as a separate, immediate hotfix commit ahead of the feature?
