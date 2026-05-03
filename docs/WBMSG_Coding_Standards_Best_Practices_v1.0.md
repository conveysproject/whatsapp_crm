# WBMSG
# Coding Standards &amp; Best Practices
Conventions for TypeScript, React, Node.js, SQL — SWEBOK-aligned
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
VP Engineering / Tech Leads
## 1. Purpose &amp; Audience
This document defines the coding conventions, patterns, and quality bars that apply to every line of code in the WBMSG monorepo. It exists to make code readable by any engineer, reduce review friction, and prevent classes of defects mechanically. It is enforced via lint rules, code owners, and PR review. Conformance reference: SWEBOK Guide v3 §3 (Software Construction) and §4 (Software Testing).
## 2. General Principles
1. Read more than you write. Optimise for the next reader, not the next writer.
1. Make wrong code look wrong. If a misuse is possible, make it impossible at the type level.
1. Prefer boring solutions. New patterns require an ADR.
1. Smallest correct change. Refactors live in their own PRs, never bundled with feature changes.
1. Delete code aggressively. Dead code is worse than no code.
1. Write tests first when defining new behaviour; write tests last when fixing a bug (regression test).
## 3. Repository Layout (Monorepo)
- Tooling: pnpm workspaces + Turborepo for the monorepo; Nx considered and rejected (see ADR-007).
- Top-level: apps/ (web, admin), services/ (api, inbox, campaigns…), packages/ (shared libs), infra/ (Terraform).
- Shared types in packages/types; consumed via TypeScript path aliases.
- No service depends on another service's source — services communicate via published OpenAPI clients only.
## 4. TypeScript Conventions
### 4.1 Compiler &amp; Lint
- TypeScript 5.5+; strict: true, noUncheckedIndexedAccess: true, noImplicitOverride: true.
- ESLint with @typescript-eslint, eslint-plugin-import, eslint-plugin-react, eslint-plugin-jsx-a11y.
- Prettier (printWidth 100, single quotes, trailing comma); enforced by Husky pre-commit hook.
- No JS files in app code; only .ts / .tsx. Build artefacts are .js.
### 4.2 Naming

| Element | Convention | Example |
| --- | --- | --- |
| Variables, functions | camelCase | fetchInbox, isAdmin |
| Types, interfaces, classes | PascalCase | MessagePayload, InboxClient |
| Type-parameters | Single capital letter or PascalCase | T, K, TMessage |
| Constants (module-level) | UPPER_SNAKE | MAX_PAGE_SIZE |
| Files | kebab-case for modules; PascalCase for React components | inbox-service.ts; ConversationList.tsx |
| React props | Suffix Props on the type | type ConversationListProps |
| Boolean variables | Prefix is/has/can/should | isLoading, hasError |
| Async functions | Verb prefix; no 'Async' suffix | fetchUser not fetchUserAsync |

### 4.3 Types
- Prefer type over interface for composition; use interface only for class implements / module augmentation.
- No any. Use unknown if input is truly unknown; narrow before use.
- Discriminated unions for state machines (status: 'idle' | 'loading' | 'success' | 'error').
- Brand types for IDs (type UserId = string &amp; { __brand: 'UserId' }).
- Avoid enum; use union of string literals (more tree-shakable, fewer surprises).
- Result types for fallible operations: type Result&lt;T, E&gt; = { ok: true; value: T } | { ok: false; error: E }.
### 4.4 Imports &amp; Exports
- Named exports preferred; default export only for React components or Next.js page conventions that require it.
- No circular imports — enforced by eslint-plugin-import.
- Sort imports: builtins, externals, packages/, relative; one blank line between groups.
- Path aliases for cross-package imports; relative paths inside the same package only.
### 4.5 Error Handling
- Throw Error subclasses, never strings. Provide a code field on custom errors.
- Boundary catches: catch at the API handler / job consumer / React error-boundary; do not catch in deep functions just to log-and-rethrow.
- Never silently swallow errors. Log structured with severity, context, and correlation ID.
- Use Result types for expected failure modes (validation, business-rule violation).
## 5. React &amp; Next.js
- Functional components only; hooks only.
- One component per file, name matches file.
- Component file order: imports → types → component → subcomponents → hooks → helpers → styles.
- useState for local UI; React Query for server state; Zustand for global UI state; no Redux.
- Server components by default in Next.js App Router; mark client only when needed.
- Avoid useEffect for derived state — compute during render or use useMemo.
- Avoid prop-drilling &gt; 2 levels; use composition or context.
- Forms: react-hook-form + zod resolver; never useState for form state.
- Keys: stable IDs, never array index for lists that mutate.
- Suspense boundaries at meaningful UX seams; loading skeletons match final layout.
### 5.1 Performance
- Memoize only after measuring; React DevTools Profiler is the source of truth.
- Code-split at route + heavy-component level (next/dynamic).
- Image: always next/image with width/height.
- Bundle budget enforced in CI: per-route ≤ 200 KB gzipped.
## 6. Node.js Service Conventions
- Node 22 LTS; ESM modules only.
- HTTP framework: Hono on edge, Fastify on long-lived; no Express.
- Validation at boundary: zod schemas for every external input (HTTP, queue, env).
- Configuration: env-var validation at startup; service refuses to boot on bad config.
- Graceful shutdown: SIGTERM → drain in-flight + close DB pool within 30 s.
- Health endpoints: /health (liveness, no deps) and /ready (readiness, checks DB+queue).
- Logging: pino, JSON, with trace-id from OpenTelemetry context.
- OpenTelemetry instrumentation on all outbound calls (HTTP, DB, queue, AI).
## 7. Database Access (PostgreSQL via Drizzle ORM)
- All queries via Drizzle. Raw SQL allowed only for read-replica analytics, behind a tagged helper.
- Tenant isolation: every query MUST include organization_id; helper enforces this and lints reject queries without it.
- Migrations in /db/migrations/; each migration named YYYYMMDDHHmm__short_description.sql.
- Forward-compatible migrations only (additive); two-phase deploys for column rename / removal.
- Indexes: name idx_&lt;table&gt;_&lt;columns&gt;; create CONCURRENTLY in production.
- Foreign keys ON DELETE RESTRICT by default; CASCADE only with PR comment justifying.
- JSONB used sparingly; if querying paths, build an expression index.
- No SELECT * in application code — list columns to avoid surprise on schema change.
- Connection pool: max = (cpu_count * 2) + 1 per process; pgbouncer in transaction mode in front of PG.
## 8. SQL Style
- Keywords UPPERCASE; identifiers snake_case.
- One column per line for SELECT and ON conflict targets.
- Indent JOINs at the same level as FROM; ON on the next line indented.
- EXPLAIN ANALYZE on any query that touches a table &gt; 100K rows; require execution plan in PR.
- No NOT IN with subqueries (NULL semantics); use NOT EXISTS or LEFT JOIN ... IS NULL.
## 9. API Design
- REST conventions: nouns, plural collections, kebab-case URL segments.
- JSON only; UTF-8; RFC 7807 problem-details for errors.
- Versioning: /v1/...; major-version bump for breaking changes; deprecation with 6-month notice.
- Idempotency: POST endpoints that create resources accept Idempotency-Key header.
- Pagination: cursor-based with next/prev tokens; never offset-based for large collections.
- Filtering: ?filter[field]=value; sorting: ?sort=field,-other_field.
- Response shape: { data: T, meta?: object, links?: object } at the top level; never bare arrays.
- OpenAPI spec generated from code (zod-to-openapi); spec drift fails CI.
## 10. Testing
### 10.1 Pyramid
- Unit tests: Vitest; co-located *.test.ts; ≥ 75% line coverage on backend, ≥ 60% on frontend.
- Integration tests: Vitest + a real Postgres + a fake Meta API; one test file per service boundary.
- End-to-end: Playwright; one happy-path per critical user journey; runs against staging.
- Contract tests: Pact between services that share a published API.
### 10.2 Style
- AAA pattern: Arrange — Act — Assert; one logical assertion per test.
- describe = subject under test; it = behaviour; never 'should X' — write 'X' (active voice).
- Test data via factories (e.g., @faker-js/faker + repository factory pattern); no hardcoded fixtures.
- Avoid sleeps; use waitFor with explicit conditions.
- No mocking the database in integration tests (per Risk Register lesson — see ADR-006).
### 10.3 Coverage Gates
- PR fails if coverage drops more than 0.5 pp on any package.
- New file with 0 coverage fails (file-level gate).
- Critical paths (auth, billing, tenant boundary) MUST be ≥ 95% covered.
## 11. Security Patterns
- All input validated at boundary with zod; never trust client.
- All output encoded — React handles HTML; SQL handled by parameterised queries.
- AuthN at edge (Clerk middleware); AuthZ in handler (RBAC helper); never custom-roll.
- Tenant boundary: every DB query verified by lint rule + integration test.
- Secrets only via process.env; loaded from AWS Secrets Manager at runtime; never in code.
- Crypto via @aws-sdk/crypto and node:crypto; no hand-rolled crypto.
- No JWT manual signing; rely on Clerk-issued tokens.
## 12. Logging &amp; Observability
- Structured logs (JSON); never console.log in production code.
- Required fields: timestamp, severity, service, traceId, organizationId, message.
- Sensitive fields auto-redacted by pino-redact (configured list).
- Tracing: OpenTelemetry SDK; spans for HTTP, DB, queue, external API.
- Metrics: counters for events; histograms for latencies; named with service.action.unit pattern.
## 13. Comments &amp; Docstrings
- Default to no comment. Names are the comment.
- Add a comment when a reader would otherwise ask 'why?': non-obvious decisions, performance hacks, workarounds.
- Public APIs (exported functions, components, types) get a JSDoc with one-sentence summary, params, returns.
- TODO comments include owner and ticket: // TODO(rohan, INC-123): handle empty list.
- Never reference issues or PRs in code comments; reference the concept (commit history is authoritative).
## 14. Code Review
- PR description: what + why; screenshots/recordings for UI; risk assessment for high-risk.
- Reviewer focus: correctness, security, observability, tests, naming, simplicity.
- Comment style: nit:, suggestion:, blocking:, question: — explicit so author knows weight.
- Reviewer must run the change locally for non-trivial UI work.
- Approval ≠ rubber stamp; if unsure, ask before approving.
- Author addresses every comment; resolved by author after addressing.
## 15. Git &amp; Branching
- Trunk-based development on main.
- Branch name: &lt;type&gt;/&lt;ticket&gt;-&lt;short-desc&gt;; types: feat, fix, chore, refactor, docs, test, perf.
- Conventional commits in commit messages (Renovate / Release-it parse them).
- Squash on merge by default; merge-commit only for long-lived release branches (rare).
- Rebase, never merge, when updating a PR branch from main.
- No force-push to main; force-push allowed only on personal feature branches.
## 16. Tooling Configuration Files (Source of Truth)
- /.eslintrc.cjs, /.prettierrc, /tsconfig.base.json — root-level, all packages extend.
- /.github/CODEOWNERS — every directory owned by ≥ 1 team.
- /.github/workflows/ — CI pipeline; required checks listed in branch protection.
- /turbo.json — task graph and remote cache.
- /.vscode/settings.json — editor settings checked-in for consistency.
## 17. Anti-Patterns (Forbidden)
- any type or @ts-ignore without an attached comment + ticket.
- Catch-and-swallow without rethrow or alert.
- Direct DB access from a service that doesn't own the table.
- console.log in committed code.
- Mutable shared state across requests.
- Time-dependent tests (use a clock abstraction).
- Snapshot testing for non-trivial UI (brittle and uninformative).
- Generated docs that nobody reads — link to source instead.
## 18. Onboarding Checklist for New Engineers
- Day 1: clone monorepo, run pnpm install, run pnpm dev for web app.
- Day 2: run unit tests; run a single integration test; tour CI pipeline.
- Week 1: ship a single-line PR (typo fix or comment update) end-to-end.
- Week 2: pair-program on a small ticket; follow review process.
- Week 4: own a small ticket end-to-end including release notes.
## 19. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | Tech Leads + VPE | Baseline at end of Sprint 0 |

End of Coding Standards &amp; Best Practices | WBMSG v1.0 | April 2026 | SWEBOK