# README Design Spec — 2026-06-17

## Approach
Product-first (Option A): bold tagline → screenshot placeholder → badges → sections.
Audience: all (developers, contributors, stakeholders, investors, internal team).
Tone: professional, developer-friendly, and bold.

## Validated Tech Stack (from package.json + Railway + Vercel)

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| API        | Fastify 4, Node.js, TypeScript, Socket.io       |
| Web        | Next.js 15 (App Router), React 18, Tailwind CSS |
| Mobile     | React Native 0.74.1 + Expo ~51                  |
| Database   | PostgreSQL 16 + Prisma 7                        |
| Cache      | Redis 7                                         |
| Auth       | Clerk                                           |
| Queue      | BullMQ                                          |
| Storage    | Cloudflare R2 (S3-compatible via AWS SDK)       |
| AI         | OpenAI (gpt-4o-mini, live)                      |
| Payments   | Stripe (coded, M7 not yet live)                 |
| Monitoring | Sentry (coded, inactive in production)          |
| Deploy     | Railway (API) · Vercel (Web)                    |
| Node.js    | 24.x (production)                               |

## Project Structure (validated from codebase)

```
apps/
  api/      Fastify REST API (port 4000)
  web/      Next.js web app (port 3000)
  mobile/   React Native + Expo
  conveys/  Marketing site
packages/
  shared/        Domain types, API response types, constants
  tsconfig/      Shared TypeScript configs
  eslint-config/ Shared ESLint config
services/
  ml/            ML service (Python)
scripts/         Utility scripts
```

## Module Status

| # | Module                       | Status      |
|---|------------------------------|-------------|
| M1 | Auth & Multi-Tenancy        | Live        |
| M2 | Contact & Lead Management   | In Progress |
| M3 | WhatsApp Inbox              | In Progress |
| M4 | Template & Campaign Manager | In Progress |
| M5 | AI Agents & Automation      | Planned     |
| M6 | Analytics & Reporting       | Planned     |
| M7 | Billing & Subscription      | Planned     |
| M8 | Agency / Sub-Account Mode   | Planned     |
| M9 | Marketplace & Integrations  | Planned     |

## Environment Variables (validated from .env.example + Railway + Vercel)

### API (Railway)
| Variable              | Description                        |
|-----------------------|------------------------------------|
| `DATABASE_URL`        | PostgreSQL connection string       |
| `REDIS_URL`           | Redis connection string            |
| `CLERK_SECRET_KEY`    | Clerk auth secret                  |
| `CLERK_WEBHOOK_SECRET`| Clerk webhook secret               |
| `OPENAI_API_KEY`      | OpenAI API key                     |
| `WA_ACCESS_TOKEN`     | WhatsApp Business API token        |
| `WA_PHONE_NUMBER_ID`  | WhatsApp phone number ID           |
| `WA_VERIFY_TOKEN`     | WhatsApp webhook verify token      |
| `WA_WEBHOOK_SECRET`   | WhatsApp webhook secret            |
| `META_APP_ID`         | Meta app ID                        |
| `META_APP_SECRET`     | Meta app secret                    |
| `R2_BUCKET_NAME`      | Cloudflare R2 bucket name          |
| `R2_ENDPOINT`         | Cloudflare R2 endpoint             |
| `R2_ACCESS_KEY_ID`    | Cloudflare R2 access key           |
| `R2_SECRET_ACCESS_KEY`| Cloudflare R2 secret key           |
| `API_PORT`            | API port (4000)                    |
| `CORS_ORIGIN`         | Allowed CORS origin                |

### Web (Vercel)
| Variable                          | Description                    |
|-----------------------------------|--------------------------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key             |
| `CLERK_SECRET_KEY`                | Clerk secret key               |
| `CLERK_WEBHOOK_SECRET`            | Clerk webhook secret           |
| `NEXT_PUBLIC_API_URL`             | API base URL                   |
| `NEXT_PUBLIC_META_APP_ID`         | Meta app ID (public)           |
| `NEXT_PUBLIC_META_REDIRECT_URI`   | Meta OAuth redirect URI        |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`   | Clerk sign-in path             |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`   | Clerk sign-up path             |

## Deployment

| App    | Platform | URL                               |
|--------|----------|-----------------------------------|
| API    | Railway  | wbmsg-production.up.railway.app   |
| Web    | Vercel   | wbmsg.com                         |

## Contributing Rules (from CLAUDE.md)
- Branch from `develop`: `feat/WBMSG-123-description`
- Conventional Commits: `feat(scope):` / `fix(scope):`
- Run `pnpm test` and `pnpm lint` before PR
- 1 approval + all CI checks required

## License
Placeholder: © 2026 WBMSG. All rights reserved.

## Prerequisites (validated)
- Node.js 20+ (engines field) / 24.x in production
- pnpm 9+ (10.33.2 in use)
- Docker (Postgres 16, Redis 7)
