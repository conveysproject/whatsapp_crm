# Sprint 2 — Authentication & Multi-tenancy

## Sprint Goal
Implement secure, multi-tenant authentication that powers every subsequent feature — every API call, every data access, every UI route is gated by the identity established here.

## What We're Building

- **Clerk integration** — Email/password + Google SSO via Clerk. JWT validation in Fastify with `@clerk/backend`. Web auth pages via `@clerk/nextjs`.
- **PostgreSQL multi-tenancy** — `organizations`, `users`, `invitations` tables via Prisma. Every user belongs to exactly one organization. RLS-style isolation enforced at application layer (all queries filter by `organizationId` from the JWT).
- **RBAC** — Four roles: `admin`, `manager`, `agent`, `viewer`. Role stored in `users` table, validated per-route.
- **User invitation flow** — Admin creates invitation record → unique token emailed → recipient accepts via public endpoint → user row created in `users` table.
- **API routes** — `GET/PATCH /v1/organizations/me`, `GET /v1/users`, `PATCH /v1/users/:id/role`, `DELETE /v1/users/:id`, `POST /v1/invitations`, `POST /v1/invitations/:token/accept`.
- **Web UI** — Sign-in, sign-up pages (Clerk hosted UI), dashboard shell layout, settings page (org name/plan), members page (list + invite form skeleton).

## Key Technical Decisions

- **Clerk over custom auth** — Clerk handles email verification, SSO, MFA, session management, and organization management out-of-box. Building this from scratch would cost 2+ sprints. Trade-off: vendor dependency, but auth is not a differentiator for WBMSG.
- **Prisma over raw SQL** — Type-safe queries, auto-generated client, migration tooling. The coding standards mandate Prisma for all DB access.
- **Application-layer isolation over PostgreSQL RLS** — Full RLS (row-level security) policies are the long-term goal (Sprint 4), but for Sprint 2 we enforce isolation via `where: { organizationId: request.auth.organizationId }` on every query. This is auditable and catches bugs in tests. RLS is an additional safety net, not the primary enforcement.
- **Soft-delete for users** — `isActive: false` rather than deleting the row. Preserves audit trail and foreign key integrity (messages, assignments referencing the user still resolve).
- **Invitation tokens as UUIDs** — Simple, unguessable, single-use. No JWT complexity needed for a 7-day expiry invitation link.

## Dependencies

- **External:** Clerk account with a project; `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` provisioned; local Postgres running via Docker Compose
- **Internal:** Sprint 1 complete — Fastify API skeleton, Next.js web skeleton, shared types package, Prisma initialized

## Definition of Done

- [ ] New user signs up via Clerk → creates org → invites teammate → teammate accepts → teammate can sign in and hit protected routes
- [ ] Cross-org data access is impossible: `GET /v1/organizations/me` returns only the authenticated user's org
- [ ] Removing a user (`DELETE /v1/users/:id`) sets `isActive: false`; subsequent requests with their JWT return 403
- [ ] `pnpm test` — all pass
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors
- [ ] Settings page at `/settings` shows org name and plan tier
- [ ] Members page at `/settings/members` lists all active users in the org

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Clerk organization setup complexity | Medium | Medium | Clerk's org management handles invite emails; we store the accepted user in our DB post-accept |
| RLS not enforced at DB level yet | Medium | High | All Prisma queries must include `organizationId` filter; add a lint rule or PR checklist item to catch omissions |
| Prisma migration conflicts in team | Low | Medium | One engineer owns migrations per sprint; migrations reviewed in PR before merge |
