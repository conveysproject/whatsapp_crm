# WBMSG

> WhatsApp-first CRM for Indian SMBs — transparent pricing, AI-augmented, built for 1–50 person teams.

Indian MSMEs have 535M WhatsApp users and no CRM that treats WhatsApp as a first-class channel. WBMSG closes that gap with a purpose-built platform that combines a real inbox, contact management, campaign automation, and AI-powered replies — with white-label sub-account support for agencies.

**Project code:** TRUST-2026 · **GA target:** March 2027 · **Status:** Sprint 1 complete (bootstrapping)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15 (App Router) + React 18 + Tailwind CSS |
| API | Fastify 4 + Node.js 20 + TypeScript (ESM) |
| Mobile | React Native + Expo 51 |
| Database | PostgreSQL 16 (Aurora) + Prisma ORM |
| Cache / Queue | Redis 7 + BullMQ |
| Search | Meilisearch |
| Auth | Clerk |
| Billing | Stripe |
| WhatsApp | Meta WhatsApp Cloud API |
| AI / LLM | Anthropic Claude API |
| Infra | AWS (ECS, RDS, ElastiCache, S3) + Terraform |
| CI/CD | GitHub Actions |
| Monorepo | Turborepo + pnpm workspaces |

---

## Repository Structure

```
apps/
  api/        Fastify REST API — Node 20, ESM, TypeScript
  web/        Next.js 15 App Router
  mobile/     React Native + Expo 51
packages/
  shared/     Branded domain types, API response types, constants
  tsconfig/   Shared TypeScript base configs
  eslint-config/  Shared ESLint 8 config
docs/         Project specifications converted to Markdown
infra/
  terraform/  AWS infrastructure (Terraform IaC stub)
```

---

## Quick Start

**Prerequisites:** Node.js 20+, pnpm 10+, Docker Desktop

```bash
# Clone
git clone https://github.com/conveysproject/whatsapp_crm.git
cd whatsapp_crm

# Install dependencies
pnpm install

# Start local infrastructure (Postgres 16, Redis 7, Meilisearch)
docker compose up -d

# Copy env and fill in values
cp .env.example .env

# Start all apps in parallel
pnpm dev
```

| App | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:4000 |
| API health check | http://localhost:4000/health |
| Meilisearch | http://localhost:7700 |

---

## Development

```bash
pnpm type-check          # TypeScript check all packages
pnpm lint                # ESLint all packages
pnpm test                # Run all tests (Vitest)
pnpm build               # Build all packages

# Scoped commands
pnpm --filter @WBMSG/api test
pnpm --filter @WBMSG/web dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit conventions, and PR process.

---

## Product Modules

| # | Module | Sprint Range |
|---|---|---|
| M1 | Auth & Multi-Tenancy | S1–S3 |
| M2 | Contact & Lead Management | S2–S6 |
| M3 | WhatsApp Inbox & Conversations | S4–S10 |
| M4 | Template & Campaign Manager | S7–S12 |
| M5 | AI Agents & Automation Builder | S9–S16 |
| M6 | Analytics & Reporting | S11–S18 |
| M7 | Billing & Subscription | S13–S17 |
| M8 | Agency / Sub-Account Mode | S15–S20 |
| M9 | Marketplace & Integrations | S18–S24 |

---

## Documentation

All project specifications are in [`docs/`](docs/). Start with [`docs/PROJECT_REFERENCE.md`](docs/PROJECT_REFERENCE.md) for a full overview — tech stack, database schema, API conventions, sprint roadmap, and links to every detailed spec.

---

## License

Proprietary — All rights reserved. © 2026 WBMSG.
