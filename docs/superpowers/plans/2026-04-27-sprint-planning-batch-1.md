# Sprint Planning Batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sprint 1 (3 remaining gaps) and fully implement Sprint 2 (Auth & Multi-tenancy), producing the first working internal alpha with secure multi-tenant authentication.

**Architecture:** Sprint 1 gaps add AWS staging infrastructure via Terraform, wire Sentry/Datadog observability into the API and web app, and add a GitHub Actions deploy pipeline. Sprint 2 builds on this with Clerk JWT auth, PostgreSQL RLS-enforced multi-tenancy via Prisma, RBAC, user invitations, and the web auth + settings UI.

**Tech Stack:** Terraform ≥1.7, AWS (ECS Fargate, RDS Aurora PG16, ElastiCache Redis 7, S3), Sentry (`@sentry/node`, `@sentry/nextjs`), Datadog agent, GitHub Actions OIDC, Clerk (`@clerk/backend`, `@clerk/nextjs`), Prisma 5, Fastify 4 + ESM, Next.js 15 App Router.

---

## File Map

### Sprint 1 Gaps

| File | Action | Purpose |
|---|---|---|
| `infra/terraform/staging/main.tf` | Create | VPC, subnets, SGs, ALB |
| `infra/terraform/staging/compute.tf` | Create | ECR, ECS cluster + service + task def |
| `infra/terraform/staging/data.tf` | Create | RDS Aurora PG16 + ElastiCache Redis 7 |
| `infra/terraform/staging/storage.tf` | Create | S3 media bucket |
| `infra/terraform/staging/variables.tf` | Create | All input variables |
| `infra/terraform/staging/outputs.tf` | Create | ALB URL, DB/Redis endpoints |
| `apps/api/src/plugins/sentry.ts` | Create | Sentry Fastify plugin |
| `apps/web/sentry.client.config.ts` | Create | Sentry browser init |
| `apps/web/sentry.server.config.ts` | Create | Sentry Node init |
| `apps/web/next.config.ts` | Modify | Wrap with `withSentryConfig` |
| `docker-compose.yml` | Modify | Add `dd-agent` service |
| `.env.example` | Modify | Add `SENTRY_DSN`, `DD_API_KEY` |
| `.github/workflows/deploy-staging.yml` | Create | ECS deploy on push to `main` |

### Sprint 2 — Auth & Multi-tenancy

| File | Action | Purpose |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Create | Full multi-tenant schema (organizations, users, invitations) |
| `apps/api/src/lib/prisma.ts` | Create | Prisma client singleton |
| `apps/api/src/lib/clerk.ts` | Create | Clerk JWT verification helper |
| `apps/api/src/plugins/auth.ts` | Create | Fastify `preHandler` — validates JWT, sets `request.auth` |
| `apps/api/src/plugins/prisma.ts` | Create | Fastify Prisma plugin (decorates `fastify.prisma`) |
| `apps/api/src/types/fastify.d.ts` | Create | Augment `FastifyRequest` with `.auth` |
| `apps/api/src/routes/organizations.ts` | Create | `GET/PATCH /v1/organizations/me` |
| `apps/api/src/routes/users.ts` | Create | `GET /v1/users`, `PATCH /v1/users/:id/role`, `DELETE /v1/users/:id` |
| `apps/api/src/routes/invitations.ts` | Create | `POST /v1/invitations`, `POST /v1/invitations/:token/accept` |
| `apps/api/src/routes/index.ts` | Create | Register all route groups |
| `apps/api/src/index.ts` | Modify | Register new plugins + routes |
| `packages/shared/src/index.ts` | Modify | Add `InvitationId`, `Role`, `PlanTier` branded types |
| `apps/web/middleware.ts` | Create | Clerk `authMiddleware` for Next.js |
| `apps/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx` | Create | Clerk `<SignIn />` component |
| `apps/web/app/(auth)/sign-up/[[...sign-up]]/page.tsx` | Create | Clerk `<SignUp />` component |
| `apps/web/app/(auth)/layout.tsx` | Create | Centered auth layout |
| `apps/web/app/(dashboard)/layout.tsx` | Create | Protected shell layout |
| `apps/web/app/(dashboard)/settings/page.tsx` | Create | Org name + settings form |
| `apps/web/app/(dashboard)/settings/members/page.tsx` | Create | Member list + invite form |
| `apps/web/lib/api.ts` | Create | Typed fetch wrapper (attaches Clerk JWT to requests) |

---

## Task 1: Terraform — VPC, Networking, Security Groups

**Files:**
- Create: `infra/terraform/staging/main.tf`
- Create: `infra/terraform/staging/variables.tf`

- [ ] **Step 1: Write `infra/terraform/staging/variables.tf`**

```hcl
variable "aws_region" {
  default = "ap-south-1"
}
variable "environment" {
  default = "staging"
}
variable "api_image_tag" {
  description = "Docker image tag to deploy for the API"
}
variable "db_password" {
  description = "RDS master password"
  sensitive   = true
}
```

- [ ] **Step 2: Write `infra/terraform/staging/main.tf`**

```hcl
terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    bucket         = "WBMSG-tfstate"
    key            = "staging/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "WBMSG-tflock"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = "WBMSG", Environment = "staging", ManagedBy = "Terraform" }
  }
}

data "aws_availability_zones" "available" { state = "available" }

# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
}
resource "aws_internet_gateway" "main" { vpc_id = aws_vpc.main.id }

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet("10.0.0.0/16", 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
}
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet("10.0.0.0/16", 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; gateway_id = aws_internet_gateway.main.id }
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Security Groups
resource "aws_security_group" "alb" {
  name   = "WBMSG-staging-alb"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 80;   to_port = 80;   protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  ingress { from_port = 443;  to_port = 443;  protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}
resource "aws_security_group" "api" {
  name   = "WBMSG-staging-api"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 4000; to_port = 4000; protocol = "tcp"; security_groups = [aws_security_group.alb.id] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}
resource "aws_security_group" "rds" {
  name   = "WBMSG-staging-rds"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 5432; to_port = 5432; protocol = "tcp"; security_groups = [aws_security_group.api.id] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}
resource "aws_security_group" "redis" {
  name   = "WBMSG-staging-redis"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 6379; to_port = 6379; protocol = "tcp"; security_groups = [aws_security_group.api.id] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}

# ALB
resource "aws_lb" "api" {
  name               = "WBMSG-staging-api"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}
resource "aws_lb_target_group" "api" {
  name        = "WBMSG-staging-api"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check { path = "/health"; matcher = "200" }
}
resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"
  default_action { type = "forward"; target_group_arn = aws_lb_target_group.api.arn }
}
```

- [ ] **Step 3: Validate**

```bash
cd infra/terraform/staging
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add infra/terraform/staging/main.tf infra/terraform/staging/variables.tf
git commit -m "infra(terraform): add staging VPC, subnets, SGs, and ALB"
```

---

## Task 2: Terraform — Compute (ECR + ECS)

**Files:**
- Create: `infra/terraform/staging/compute.tf`

- [ ] **Step 1: Write `infra/terraform/staging/compute.tf`**

```hcl
# ECR
resource "aws_ecr_repository" "api" {
  name                 = "WBMSG/api"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "WBMSG-staging"
  setting { name = "containerInsights"; value = "enabled" }
}

# IAM for ECS task execution
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals { type = "Service"; identifiers = ["ecs-tasks.amazonaws.com"] }
  }
}
resource "aws_iam_role" "ecs_execution" {
  name               = "WBMSG-staging-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}
resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Definition
resource "aws_ecs_task_definition" "api" {
  family                   = "WBMSG-staging-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([{
    name  = "api"
    image = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
    portMappings = [{ containerPort = 4000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV",     value = "staging" },
      { name = "API_PORT",     value = "4000" },
      { name = "CORS_ORIGIN",  value = "https://staging.WBMSG.com" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/WBMSG-staging-api"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/WBMSG-staging-api"
  retention_in_days = 7
}

# ECS Service
resource "aws_ecs_service" "api" {
  name            = "WBMSG-staging-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.api.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }
}
```

- [ ] **Step 2: Validate**

```bash
cd infra/terraform/staging
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

```bash
git add infra/terraform/staging/compute.tf
git commit -m "infra(terraform): add ECR, ECS cluster, task definition, and service"
```

---

## Task 3: Terraform — Data & Storage

**Files:**
- Create: `infra/terraform/staging/data.tf`
- Create: `infra/terraform/staging/storage.tf`
- Create: `infra/terraform/staging/outputs.tf`

- [ ] **Step 1: Write `infra/terraform/staging/data.tf`**

```hcl
# RDS Aurora PostgreSQL 16
resource "aws_db_subnet_group" "main" {
  name       = "WBMSG-staging"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_rds_cluster" "main" {
  cluster_identifier      = "WBMSG-staging"
  engine                  = "aurora-postgresql"
  engine_version          = "16.1"
  database_name           = "WBMSG"
  master_username         = "WBMSG"
  master_password         = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  skip_final_snapshot     = true
  storage_encrypted       = true
}

resource "aws_rds_cluster_instance" "main" {
  count               = 1
  identifier          = "WBMSG-staging-${count.index}"
  cluster_identifier  = aws_rds_cluster.main.id
  instance_class      = "db.t3.medium"
  engine              = aws_rds_cluster.main.engine
  engine_version      = aws_rds_cluster.main.engine_version
}

# ElastiCache Redis 7
resource "aws_elasticache_subnet_group" "main" {
  name       = "WBMSG-staging"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "WBMSG-staging"
  description          = "WBMSG staging Redis"
  node_type            = "cache.t3.micro"
  num_cache_clusters   = 1
  engine_version       = "7.0"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
```

- [ ] **Step 2: Write `infra/terraform/staging/storage.tf`**

```hcl
resource "aws_s3_bucket" "media" {
  bucket = "WBMSG-staging-media"
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

- [ ] **Step 3: Write `infra/terraform/staging/outputs.tf`**

```hcl
output "alb_dns_name" {
  description = "Staging API ALB DNS — point staging.WBMSG.com CNAME here"
  value       = aws_lb.api.dns_name
}
output "ecr_api_url" {
  description = "ECR repository URL for CI/CD"
  value       = aws_ecr_repository.api.repository_url
}
output "db_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.main.endpoint
  sensitive   = true
}
output "redis_endpoint" {
  description = "ElastiCache primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}
output "s3_media_bucket" {
  value = aws_s3_bucket.media.bucket
}
```

- [ ] **Step 4: Validate all Terraform**

```bash
cd infra/terraform/staging
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/terraform/staging/data.tf infra/terraform/staging/storage.tf infra/terraform/staging/outputs.tf
git commit -m "infra(terraform): add RDS Aurora, ElastiCache Redis, S3, and outputs"
```

---

## Task 4: Observability — Sentry (API)

**Files:**
- Create: `apps/api/src/plugins/sentry.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install Sentry in API**

```bash
pnpm --filter @WBMSG/api add @sentry/node
```

- [ ] **Step 2: Write failing test for Sentry plugin registration**

Create `apps/api/src/plugins/sentry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

describe("sentry plugin", () => {
  it("registers without error when SENTRY_DSN is set", async () => {
    process.env.SENTRY_DSN = "https://test@sentry.io/123";
    const { sentryPlugin } = await import("./sentry.js");
    const app = Fastify({ logger: false });
    await expect(app.register(sentryPlugin)).resolves.not.toThrow();
    await app.close();
  });

  it("skips init when SENTRY_DSN is not set", async () => {
    delete process.env.SENTRY_DSN;
    const Sentry = await import("@sentry/node");
    const { sentryPlugin } = await import("./sentry.js");
    const app = Fastify({ logger: false });
    await app.register(sentryPlugin);
    expect(Sentry.init).not.toHaveBeenCalled();
    await app.close();
  });
});
```

- [ ] **Step 3: Run test to confirm failure**

```bash
pnpm --filter @WBMSG/api test src/plugins/sentry.test.ts
```

Expected: FAIL — `Cannot find module './sentry.js'`

- [ ] **Step 4: Write `apps/api/src/plugins/sentry.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import * as Sentry from "@sentry/node";

export const sentryPlugin: FastifyPluginAsync = async (fastify) => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  });

  fastify.setErrorHandler((error, _request, reply) => {
    Sentry.captureException(error);
    reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });
};
```

- [ ] **Step 5: Run test to confirm pass**

```bash
pnpm --filter @WBMSG/api test src/plugins/sentry.test.ts
```

Expected: PASS

- [ ] **Step 6: Register in `apps/api/src/index.ts`**

Add after the existing plugin registrations:

```typescript
import { sentryPlugin } from "./plugins/sentry.js";
// inside start():
await server.register(sentryPlugin);
```

- [ ] **Step 7: Add to `.env.example`**

```bash
# Observability
SENTRY_DSN=
DD_API_KEY=
DD_SITE=datadoghq.com
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/plugins/sentry.ts apps/api/src/plugins/sentry.test.ts apps/api/src/index.ts apps/api/package.json .env.example
git commit -m "feat(api): add Sentry error tracking plugin"
```

---

## Task 5: Observability — Sentry (Web) + Datadog

**Files:**
- Create: `apps/web/sentry.client.config.ts`
- Create: `apps/web/sentry.server.config.ts`
- Modify: `apps/web/next.config.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Install Sentry in web**

```bash
pnpm --filter @WBMSG/web add @sentry/nextjs
```

- [ ] **Step 2: Write `apps/web/sentry.client.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

- [ ] **Step 3: Write `apps/web/sentry.server.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

- [ ] **Step 4: Update `apps/web/next.config.ts`**

Read the current file, then replace its content:

```typescript
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: true,
  disableLogger: true,
});
```

- [ ] **Step 5: Add Datadog agent to `docker-compose.yml`**

Read the current `docker-compose.yml` and add this service:

```yaml
  dd-agent:
    image: gcr.io/datadoghq/agent:7
    environment:
      - DD_API_KEY=${DD_API_KEY:-placeholder}
      - DD_SITE=${DD_SITE:-datadoghq.com}
      - DD_DOGSTATSD_NON_LOCAL_TRAFFIC=true
      - DD_APM_ENABLED=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc/:/host/proc/:ro
      - /sys/fs/cgroup/:/host/sys/fs/cgroup:ro
    ports:
      - "8126:8126"
    profiles:
      - observability
```

Use the `profiles` key so the agent only starts when explicitly requested (`docker compose --profile observability up`), keeping the default dev environment lightweight.

- [ ] **Step 6: Type-check web**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/sentry.client.config.ts apps/web/sentry.server.config.ts apps/web/next.config.ts apps/web/package.json docker-compose.yml
git commit -m "feat(web,infra): add Sentry to web app and Datadog agent to Docker Compose"
```

---

## Task 6: Staging Deploy Pipeline

**Files:**
- Create: `.github/workflows/deploy-staging.yml`

- [ ] **Step 1: Write `.github/workflows/deploy-staging.yml`**

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy-api:
    name: Build & Deploy API
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_STAGING_DEPLOY_ROLE_ARN }}
          aws-region: ap-south-1

      - name: Login to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build API
        run: pnpm --filter @WBMSG/api build

      - name: Build & push Docker image
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/WBMSG/api:$IMAGE_TAG -f apps/api/Dockerfile .
          docker push $ECR_REGISTRY/WBMSG/api:$IMAGE_TAG

      - name: Deploy to ECS
        env:
          IMAGE_TAG: ${{ github.sha }}
        run: |
          aws ecs update-service \
            --cluster WBMSG-staging \
            --service WBMSG-staging-api \
            --force-new-deployment \
            --region ap-south-1

      - name: Wait for deployment
        run: |
          aws ecs wait services-stable \
            --cluster WBMSG-staging \
            --services WBMSG-staging-api \
            --region ap-south-1

      - name: Verify health endpoint
        run: |
          ALB_URL=$(aws elbv2 describe-load-balancers \
            --names WBMSG-staging-api \
            --query 'LoadBalancers[0].DNSName' \
            --output text)
          curl --fail http://$ALB_URL/health
```

> **Pre-requisite:** Create an IAM role `WBMSG-staging-deploy` with OIDC trust for `repo:WBMSG/WhatsApp_CRM:ref:refs/heads/main` and permissions for ECR push + ECS update-service. Add its ARN as `AWS_STAGING_DEPLOY_ROLE_ARN` in GitHub Secrets. Also create `apps/api/Dockerfile` (see Step 2).

- [ ] **Step 2: Write `apps/api/Dockerfile`**

```dockerfile
FROM node:20-slim AS base
RUN npm install -g pnpm@10.33.2
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @WBMSG/shared build
RUN pnpm --filter @WBMSG/api build

FROM node:20-slim AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-staging.yml apps/api/Dockerfile
git commit -m "ci: add staging deploy pipeline with ECS and OIDC auth"
```

**Sprint 1 Definition of Done checklist:**
- [ ] `terraform validate` passes in `infra/terraform/staging/`
- [ ] `pnpm test` passes (all existing + new Sentry tests)
- [ ] `pnpm type-check` passes across all packages
- [ ] Deploy workflow file is valid YAML (check with `yamllint`)

---

## Task 7: Sprint 2 — Install Dependencies

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Install API dependencies**

```bash
pnpm --filter @WBMSG/api add @prisma/client @clerk/backend
pnpm --filter @WBMSG/api add -D prisma
```

- [ ] **Step 2: Install web dependencies**

```bash
pnpm --filter @WBMSG/web add @clerk/nextjs
```

- [ ] **Step 3: Initialise Prisma**

```bash
cd apps/api
pnpm exec prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env.example`. Verify `prisma/schema.prisma` exists.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/prisma apps/web/package.json pnpm-lock.yaml .env.example
git commit -m "chore(deps): install Prisma, Clerk backend, and Clerk Next.js"
```

---

## Task 8: Sprint 2 — Prisma Schema + Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/lib/prisma.ts`

- [ ] **Step 1: Write `apps/api/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PlanTier {
  starter
  growth
  scale
  enterprise
}

enum Role {
  admin
  manager
  agent
  viewer
}

enum InvitationStatus {
  pending
  accepted
  expired
}

model Organization {
  id                        String    @id @default(uuid())
  name                      String
  planTier                  PlanTier  @default(starter) @map("plan_tier")
  whatsappBusinessAccountId String?   @map("whatsapp_business_account_id")
  phoneNumberId             String?   @map("phone_number_id")
  settings                  Json      @default("{}")
  createdAt                 DateTime  @default(now()) @map("created_at")
  updatedAt                 DateTime  @updatedAt @map("updated_at")

  users       User[]
  invitations Invitation[]

  @@map("organizations")
}

model User {
  id             String       @id
  organizationId String       @map("organization_id")
  email          String
  fullName       String       @map("full_name")
  role           Role         @default(agent)
  isActive       Boolean      @default(true) @map("is_active")
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("users")
}

model Invitation {
  id             String           @id @default(uuid())
  organizationId String           @map("organization_id")
  email          String
  role           Role             @default(agent)
  token          String           @unique @default(uuid())
  status         InvitationStatus @default(pending)
  expiresAt      DateTime         @map("expires_at")
  createdAt      DateTime         @default(now()) @map("created_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([token])
  @@map("invitations")
}
```

- [ ] **Step 2: Run migration against local DB**

Ensure `docker compose up -d` is running, then:

```bash
cd apps/api
DATABASE_URL="postgresql://WBMSG:WBMSG@localhost:5432/WBMSG?schema=public" \
  pnpm exec prisma migrate dev --name init_auth
```

Expected: migration file created in `prisma/migrations/`, Prisma client generated.

- [ ] **Step 3: Write `apps/api/src/lib/prisma.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src/lib/prisma.ts
git commit -m "feat(api): add Prisma schema for organizations, users, invitations + initial migration"
```

---

## Task 9: Sprint 2 — Fastify Type Augmentation + Auth Plugin

**Files:**
- Create: `apps/api/src/types/fastify.d.ts`
- Create: `apps/api/src/lib/clerk.ts`
- Create: `apps/api/src/plugins/auth.ts`
- Create: `apps/api/src/plugins/prisma.ts`

- [ ] **Step 1: Write `apps/api/src/types/fastify.d.ts`**

```typescript
import type { FastifyRequest } from "fastify";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "admin" | "manager" | "agent" | "viewer";
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}
```

- [ ] **Step 2: Write failing test for Clerk verification**

Create `apps/api/src/lib/clerk.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    verifyToken: vi.fn(),
  })),
}));

describe("verifyClerkToken", () => {
  it("throws for missing Authorization header", async () => {
    const { verifyClerkToken } = await import("./clerk.js");
    await expect(verifyClerkToken(undefined)).rejects.toThrow("Missing Authorization header");
  });

  it("throws for non-Bearer token", async () => {
    const { verifyClerkToken } = await import("./clerk.js");
    await expect(verifyClerkToken("Basic abc")).rejects.toThrow("Invalid Authorization header format");
  });
});
```

- [ ] **Step 3: Run test to confirm failure**

```bash
pnpm --filter @WBMSG/api test src/lib/clerk.test.ts
```

Expected: FAIL — `Cannot find module './clerk.js'`

- [ ] **Step 4: Write `apps/api/src/lib/clerk.ts`**

```typescript
import { createClerkClient } from "@clerk/backend";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "",
});

export async function verifyClerkToken(authHeader: string | undefined): Promise<{
  userId: string;
  organizationId: string;
}> {
  if (!authHeader) throw new Error("Missing Authorization header");
  if (!authHeader.startsWith("Bearer ")) throw new Error("Invalid Authorization header format");

  const token = authHeader.slice(7);
  const payload = await clerk.verifyToken(token);

  const organizationId = payload.org_id;
  if (!organizationId) throw new Error("Token has no organization scope");

  return { userId: payload.sub, organizationId };
}
```

- [ ] **Step 5: Run test to confirm pass**

```bash
pnpm --filter @WBMSG/api test src/lib/clerk.test.ts
```

Expected: PASS

- [ ] **Step 6: Write `apps/api/src/plugins/prisma.ts`**

```typescript
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("prisma", prisma);
  fastify.addHook("onClose", async () => { await prisma.$disconnect(); });
};

export default fp(prismaPlugin);
```

Install `fastify-plugin`:

```bash
pnpm --filter @WBMSG/api add fastify-plugin
```

- [ ] **Step 7: Write `apps/api/src/plugins/auth.ts`**

```typescript
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { verifyClerkToken } from "../lib/clerk.js";

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const routeConfig = request.routeOptions?.config as Record<string, unknown> | undefined;
    if (routeConfig?.["public"]) return;

    try {
      const { userId, organizationId } = await verifyClerkToken(
        request.headers.authorization
      );

      const user = await fastify.prisma.user.findFirst({
        where: { id: userId, organizationId, isActive: true },
        select: { role: true },
      });

      if (!user) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "User not found in organization" } });
      }

      request.auth = { userId, organizationId, role: user.role };
    } catch {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid or missing token" } });
    }
  });
};

export default fp(authPlugin);
```

- [ ] **Step 8: Write auth plugin integration test**

Create `apps/api/src/plugins/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

vi.mock("../lib/clerk.js", () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: "user_123",
    organizationId: "org_123",
  }),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue({ role: "admin" }),
    },
    $disconnect: vi.fn(),
  },
}));

describe("auth plugin", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/protected", async (req) => ({ userId: req.auth.userId }));
    app.get("/public", { config: { public: true } }, async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(() => app.close());

  it("sets request.auth on valid token", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer valid" } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).userId).toBe("user_123");
  });

  it("skips auth for public routes", async () => {
    const res = await app.inject({ method: "GET", url: "/public" });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 9: Run tests**

```bash
pnpm --filter @WBMSG/api test src/plugins/auth.test.ts
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/types apps/api/src/lib/clerk.ts apps/api/src/lib/clerk.test.ts apps/api/src/plugins/auth.ts apps/api/src/plugins/auth.test.ts apps/api/src/plugins/prisma.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add Clerk JWT verification, Prisma plugin, and auth preHandler"
```

---

## Task 10: Sprint 2 — API Routes (Organizations + Users + Invitations)

**Files:**
- Create: `apps/api/src/routes/organizations.ts`
- Create: `apps/api/src/routes/users.ts`
- Create: `apps/api/src/routes/invitations.ts`
- Create: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests for organization routes**

Create `apps/api/src/routes/organizations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

const mockOrg = {
  id: "org_123",
  name: "Acme Corp",
  planTier: "starter",
  settings: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(mockOrg),
      update: vi.fn().mockResolvedValue({ ...mockOrg, name: "Updated Corp" }),
    },
    $disconnect: vi.fn(),
  },
}));

describe("organizations routes", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    const prismaPlugin = (await import("../plugins/prisma.js")).default;
    const { organizationRoutes } = await import("./organizations.js");
    await app.register(prismaPlugin);
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_123", organizationId: "org_123", role: "admin" };
    });
    await app.register(organizationRoutes, { prefix: "/v1" });
    await app.ready();
  });
  afterAll(() => app.close());

  it("GET /v1/organizations/me returns current org", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/organizations/me" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("org_123");
  });

  it("PATCH /v1/organizations/me updates org name", async () => {
    const res = await app.inject({
      method: "PATCH", url: "/v1/organizations/me",
      payload: { name: "Updated Corp" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.name).toBe("Updated Corp");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm --filter @WBMSG/api test src/routes/organizations.test.ts
```

Expected: FAIL — `Cannot find module './organizations.js'`

- [ ] **Step 3: Write `apps/api/src/routes/organizations.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/organizations/me", async (request) => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: request.auth.organizationId },
    });
    return { data: org };
  });

  fastify.patch<{ Body: { name?: string; settings?: Record<string, unknown> } }>(
    "/organizations/me",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
            settings: { type: "object" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const org = await prisma.organization.update({
        where: { id: request.auth.organizationId },
        data: request.body,
      });
      return { data: org };
    }
  );
};
```

- [ ] **Step 4: Write `apps/api/src/routes/users.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { Role } from "@prisma/client";

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/users", async (request) => {
    const users = await prisma.user.findMany({
      where: { organizationId: request.auth.organizationId, isActive: true },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return { data: users };
  });

  fastify.patch<{ Params: { id: string }; Body: { role: Role } }>(
    "/users/:id/role",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        body: { type: "object", properties: { role: { type: "string", enum: ["admin", "manager", "agent", "viewer"] } }, required: ["role"] },
      },
    },
    async (request, reply) => {
      if (request.auth.role !== "admin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can change roles" } });
      }
      const user = await prisma.user.update({
        where: { id: request.params.id, organizationId: request.auth.organizationId },
        data: { role: request.body.role },
        select: { id: true, email: true, role: true },
      });
      return { data: user };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/users/:id",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
    },
    async (request, reply) => {
      if (request.auth.role !== "admin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can remove users" } });
      }
      await prisma.user.update({
        where: { id: request.params.id, organizationId: request.auth.organizationId },
        data: { isActive: false },
      });
      return reply.status(204).send();
    }
  );
};
```

- [ ] **Step 5: Write `apps/api/src/routes/invitations.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { Role } from "@prisma/client";

export const invitationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { email: string; role: Role } }>(
    "/invitations",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "role"],
          properties: {
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "manager", "agent", "viewer"] },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.auth.role !== "admin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can invite members" } });
      }
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const invitation = await prisma.invitation.create({
        data: {
          organizationId: request.auth.organizationId,
          email: request.body.email,
          role: request.body.role,
          expiresAt,
        },
        select: { id: true, email: true, role: true, token: true, expiresAt: true },
      });
      return reply.status(201).send({ data: invitation });
    }
  );

  fastify.post<{ Params: { token: string }; Body: { clerkUserId: string; fullName: string } }>(
    "/invitations/:token/accept",
    {
      config: { public: true },
      schema: {
        params: { type: "object", properties: { token: { type: "string" } }, required: ["token"] },
        body: {
          type: "object",
          required: ["clerkUserId", "fullName"],
          properties: {
            clerkUserId: { type: "string" },
            fullName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const invitation = await prisma.invitation.findUnique({
        where: { token: request.params.token, status: "pending" },
      });

      if (!invitation || invitation.expiresAt < new Date()) {
        return reply.status(400).send({ error: { code: "INVALID_TOKEN", message: "Invitation is invalid or expired" } });
      }

      await prisma.$transaction([
        prisma.user.create({
          data: {
            id: request.body.clerkUserId,
            organizationId: invitation.organizationId,
            email: invitation.email,
            fullName: request.body.fullName,
            role: invitation.role,
          },
        }),
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "accepted" },
        }),
      ]);

      return reply.status(201).send({ data: { organizationId: invitation.organizationId } });
    }
  );
};
```

- [ ] **Step 6: Write `apps/api/src/routes/index.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { organizationRoutes } from "./organizations.js";
import { userRoutes } from "./users.js";
import { invitationRoutes } from "./invitations.js";
import { healthRoute } from "./health.js";

export const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoute);
  await fastify.register(organizationRoutes, { prefix: "/v1" });
  await fastify.register(userRoutes, { prefix: "/v1" });
  await fastify.register(invitationRoutes, { prefix: "/v1" });
};
```

- [ ] **Step 7: Update `apps/api/src/index.ts`** to use the new route registry

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { sentryPlugin } from "./plugins/sentry.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import { routes } from "./routes/index.js";

const PORT = Number(process.env.API_PORT ?? 4000);
const HOST = process.env.API_HOST ?? "0.0.0.0";

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
  },
});

async function start() {
  await server.register(sentryPlugin);
  await server.register(helmet);
  await server.register(cors, { origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" });
  await server.register(prismaPlugin);
  await server.register(authPlugin);
  await server.register(routes);
  await server.listen({ port: PORT, host: HOST });
  server.log.info(`API running on http://${HOST}:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 8: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All PASS (health + sentry + auth + organizations)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes apps/api/src/index.ts
git commit -m "feat(api): add organizations, users, and invitations routes with RBAC"
```

---

## Task 11: Sprint 2 — Update Shared Types

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Update `packages/shared/src/index.ts`**

```typescript
// Shared domain types for WBMSG

export type OrganizationId = string & { readonly __brand: "OrganizationId" };
export type UserId = string & { readonly __brand: "UserId" };
export type InvitationId = string & { readonly __brand: "InvitationId" };

export type Role = "admin" | "manager" | "agent" | "viewer";
export type PlanTier = "starter" | "growth" | "scale" | "enterprise";

export interface ApiResponse<T> {
  data: T;
  meta?: {
    timestamp?: string;
    nextCursor?: string;
    hasMore?: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const API_VERSION = "v1" as const;
```

- [ ] **Step 2: Build and type-check**

```bash
pnpm --filter @WBMSG/shared build
pnpm type-check
```

Expected: no errors across all packages

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add InvitationId, Role, PlanTier types and expand ApiResponse"
```

---

## Task 12: Sprint 2 — Web Auth Pages + Middleware

**Files:**
- Create: `apps/web/middleware.ts`
- Create: `apps/web/app/(auth)/layout.tsx`
- Create: `apps/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- Create: `apps/web/app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Add Clerk environment variables to `.env.example`**

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/inbox
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
```

- [ ] **Step 2: Write `apps/web/middleware.ts`**

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/invitations/(.*)/accept",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
```

- [ ] **Step 3: Wrap root layout with `ClerkProvider`**

Update `apps/web/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "WBMSG",
  description: "WhatsApp-first CRM for growing businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Write `apps/web/app/(auth)/layout.tsx`**

```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      {children}
    </main>
  );
}
```

- [ ] **Step 5: Write `apps/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx`**

```typescript
import { SignIn } from "@clerk/nextjs";

export default function SignInPage(): JSX.Element {
  return <SignIn />;
}
```

- [ ] **Step 6: Write `apps/web/app/(auth)/sign-up/[[...sign-up]]/page.tsx`**

```typescript
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage(): JSX.Element {
  return <SignUp />;
}
```

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/middleware.ts apps/web/app .env.example
git commit -m "feat(web): add Clerk auth pages and middleware protection"
```

---

## Task 13: Sprint 2 — Settings Pages + API Client

**Files:**
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/app/(dashboard)/layout.tsx`
- Create: `apps/web/app/(dashboard)/settings/page.tsx`
- Create: `apps/web/app/(dashboard)/settings/members/page.tsx`

- [ ] **Step 1: Write `apps/web/lib/api.ts`**

```typescript
import { auth } from "@clerk/nextjs/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();

  const response = await fetch(`${API_BASE}/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message ?? "API request failed");
  }

  return response.json() as Promise<T>;
}
```

- [ ] **Step 2: Write `apps/web/app/(dashboard)/layout.tsx`**

```typescript
import { UserButton } from "@clerk/nextjs";

export default function DashboardLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-gray-900">WBMSG</span>
        <UserButton afterSignOutUrl="/sign-in" />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Write `apps/web/app/(dashboard)/settings/page.tsx`**

```typescript
import { apiClient } from "../../../lib/api";
import type { ApiResponse } from "@WBMSG/shared";

interface Organization {
  id: string;
  name: string;
  planTier: string;
}

export default async function SettingsPage(): Promise<JSX.Element> {
  const { data: org } = await apiClient<ApiResponse<Organization>>("/organizations/me");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Organization Settings</h1>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Organization name</dt>
            <dd className="mt-1 text-sm text-gray-900">{org.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Plan</dt>
            <dd className="mt-1 text-sm text-gray-900 capitalize">{org.planTier}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `apps/web/app/(dashboard)/settings/members/page.tsx`**

```typescript
import { apiClient } from "../../../../lib/api";
import type { ApiResponse, Role } from "@WBMSG/shared";

interface Member {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export default async function MembersPage(): Promise<JSX.Element> {
  const { data: members } = await apiClient<ApiResponse<Member[]>>("/users");

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Team Members</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 text-gray-900">{m.fullName}</td>
                <td className="px-4 py-3 text-gray-600">{m.email}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add `NEXT_PUBLIC_API_URL` to `.env.example`**

```bash
# API
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors

- [ ] **Step 7: Run all tests**

```bash
pnpm test
```

Expected: All PASS

- [ ] **Step 8: Final type-check + lint**

```bash
pnpm type-check && pnpm lint
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib apps/web/app/(dashboard) .env.example
git commit -m "feat(web): add dashboard layout, settings page, and members page"
```

---

## Sprint 2 Definition of Done Checklist

- [ ] New user signs up via Clerk, creates org, invites a teammate — invitation accepted successfully
- [ ] `GET /v1/organizations/me` returns org scoped to the authenticated user's org only
- [ ] Attempt to access another org's data returns 401 or 403
- [ ] Removing a user (soft-delete) prevents their JWT from authorizing API calls within 60 seconds (Clerk session revocation)
- [ ] `pnpm test` — all pass
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors
- [ ] Settings page shows org name and member list for authenticated user

---

## Batches 2–5 (Planned, to be detailed in separate plan documents)

| Batch | Sprints | Key deliverables | Plan file |
|---|---|---|---|
| 2 | 3–6 | WhatsApp Cloud API, Core DB & API skeleton, Web App shell, Inbox MVP | `2026-05-11-sprint-planning-batch-2.md` |
| 3 | 7–12 | Contacts, Lifecycle stages, Templates, Campaigns, Deals, Routing | `2026-06-08-sprint-planning-batch-3.md` |
| 4 | 13–18 | Voice transcription, AI Smart Replies, Intent detection, Flow builder, Chatbots, Predictive analytics | `2026-07-06-sprint-planning-batch-4.md` |
| 5 | 19–24 | Trust Score, Mobile app, Integrations, Analytics, Compliance, GA launch | `2026-08-03-sprint-planning-batch-5.md` |
