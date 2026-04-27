# Sprint 1 — Project Bootstrapping

## Sprint Goal
Establish the foundational engineering environment so all four pods can begin delivering features in Sprint 2, and complete the 3 remaining infrastructure gaps.

## What We're Building

Already completed:
- Turborepo monorepo (`apps/api`, `apps/web`, `apps/mobile`, `packages/shared`)
- GitHub Actions CI (lint, type-check, build, unit tests)
- Docker Compose dev environment (Postgres 16, Redis 7, Meilisearch)
- Fastify API skeleton with `/health` endpoint + Vitest test
- Next.js 15 + Tailwind web skeleton
- Expo 51 mobile skeleton
- Shared branded types (`OrganizationId`, `UserId`)
- All project documentation in `docs/`

Remaining (gap-fill this sprint):
- AWS staging infrastructure via Terraform (VPC, ECS Fargate, RDS Aurora PG16, ElastiCache Redis 7, S3, ECR, ALB)
- Sentry error tracking wired into API and web app
- Datadog agent added to Docker Compose (opt-in via profile)
- GitHub Actions deploy pipeline — builds and deploys API to ECS on push to `main`

## Key Technical Decisions

- **Terraform flat layout over modules** — Using `infra/terraform/staging/` as a single flat directory rather than reusable modules. Reason: staging is the only environment in this sprint; modules add complexity before patterns are proven. Modules will be introduced when we add production (Sprint 23).
- **GitHub Actions OIDC over long-lived AWS keys** — OIDC eliminates rotating secrets in CI. Requires one-time IAM role setup with trust policy for the GitHub repo.
- **Datadog agent behind a Docker Compose profile** — Prevents the agent (which requires an API key) from blocking engineers who don't have one. Run with `docker compose --profile observability up`.
- **Sentry plugin skips init when `SENTRY_DSN` is unset** — Safe for local dev with no credentials.

## Dependencies

- **External:** AWS account with quota for ECS, RDS, ElastiCache in `ap-south-1`; Sentry project created and DSN available; Datadog account and API key; GitHub Secrets configured (`AWS_STAGING_DEPLOY_ROLE_ARN`)
- **Internal:** Sprint 1 completed work (monorepo, CI, Docker Compose)

## Definition of Done

- [ ] Any engineer can clone repo, run `pnpm install` + `docker compose up -d`, and hit `GET /health` within 30 minutes
- [ ] `pnpm type-check` passes across all packages
- [ ] `pnpm test` passes all unit tests
- [ ] `terraform validate` succeeds in `infra/terraform/staging/`
- [ ] Staging environment is reachable at the ALB DNS name, serving `GET /health → 200`
- [ ] Deploy workflow triggers automatically on push to `main`

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AWS quota limits for RDS/ElastiCache in ap-south-1 | Medium | High | Request quota increase in parallel; use `db.t3.medium` / `cache.t3.micro` (minimal instances) |
| OIDC IAM role misconfiguration blocks deploy | Low | Medium | Test deploy manually with temporary AWS keys first; document OIDC setup steps |
| Sentry DSN not available at sprint start | Low | Low | Plugin is no-op without DSN; engineers can develop without it |
