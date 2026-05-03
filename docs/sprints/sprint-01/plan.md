# Sprint 1 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-1.md`
> Tasks 1–6 cover Sprint 1 gap-fill.

## Pre-conditions
- Docker Compose running: `docker compose up -d`
- AWS account accessible with permissions to create VPC, ECS, RDS, ElastiCache, S3, ECR
- GitHub Secrets: `AWS_STAGING_DEPLOY_ROLE_ARN` set (or ready to be set after IAM role creation)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 1 | Terraform — VPC + Networking | `infra/terraform/staging/main.tf`, `variables.tf` |
| 2 | Terraform — Compute (ECR + ECS) | `infra/terraform/staging/compute.tf` |
| 3 | Terraform — Data + Storage + Outputs | `infra/terraform/staging/data.tf`, `storage.tf`, `outputs.tf` |
| 4 | Sentry — API plugin | `apps/api/src/plugins/sentry.ts` |
| 5 | Sentry — Web + Datadog Docker | `apps/web/sentry.*.config.ts`, `docker-compose.yml` |
| 6 | Staging deploy pipeline | `.github/workflows/deploy-staging.yml`, `apps/api/Dockerfile` |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass (including new Sentry plugin test)
- [ ] `pnpm type-check` — no errors
- [ ] `cd infra/terraform/staging && terraform validate` — Success

## Deployment / Environment Notes

```bash
# First-time Terraform apply (run after AWS credentials configured)
cd infra/terraform/staging
terraform init
terraform plan -var="api_image_tag=latest" -var="db_password=<secret>"
terraform apply -var="api_image_tag=latest" -var="db_password=<secret>"
```

Add to `.env.example` (copy to `.env` locally):
```
SENTRY_DSN=
DD_API_KEY=
DD_SITE=datadoghq.com
```
