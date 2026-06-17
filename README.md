# WBMSG

> WhatsApp-first CRM for SMBs — built to convert conversations into customers.

<!-- Add a screenshot or demo GIF here -->

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Node.js](https://img.shields.io/badge/Node.js-24.x-green)
![License](https://img.shields.io/badge/license-proprietary-red)

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| API        | Fastify 4, Node.js, TypeScript, Socket.io       |
| Web        | Next.js 15 (App Router), React 18, Tailwind CSS |
| Mobile     | React Native 0.74.1 + Expo 51                   |
| Database   | PostgreSQL 16 + Prisma 7                        |
| Cache      | Redis 7                                         |
| Auth       | Clerk                                           |
| Queue      | BullMQ                                          |
| Storage    | Cloudflare R2                                   |
| AI         | OpenAI (gpt-4o-mini)                            |
| Payments   | Stripe                                          |
| Monitoring | Sentry                                          |
| Deploy     | Railway (API) · Vercel (Web)                    |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local PostgreSQL, Redis)

### Local Setup

```bash
git clone <repo-url>
cd WhatsApp_CRM
pnpm install
cp .env.example .env        # fill in your keys
docker compose up -d        # start local services
pnpm dev                    # start all apps
```

Apps will be available at:
- Web → http://localhost:3000
- API → http://localhost:4000

---

## Project Structure

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
  ml/       ML service (Python / FastAPI)
scripts/    Utility scripts
```

---

## Modules

| # | Module                        | Status      |
|---|-------------------------------|-------------|
| M1 | Auth & Multi-Tenancy         | Live        |
| M2 | Contact & Lead Management    | In Progress |
| M3 | WhatsApp Inbox               | In Progress |
| M4 | Template & Campaign Manager  | In Progress |
| M5 | AI Agents & Automation       | Planned     |
| M6 | Analytics & Reporting        | Planned     |
| M7 | Billing & Subscription       | Planned     |
| M8 | Agency / Sub-Account Mode    | Planned     |
| M9 | Marketplace & Integrations   | Planned     |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

### API

| Variable               | Description                      |
|------------------------|----------------------------------|
| `DATABASE_URL`         | PostgreSQL connection string     |
| `REDIS_URL`            | Redis connection string          |
| `CLERK_SECRET_KEY`     | Clerk auth secret                |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook secret             |
| `OPENAI_API_KEY`       | OpenAI API key                   |
| `WA_ACCESS_TOKEN`      | WhatsApp Business API token      |
| `WA_PHONE_NUMBER_ID`   | WhatsApp phone number ID         |
| `WA_VERIFY_TOKEN`      | WhatsApp webhook verify token    |
| `WA_WEBHOOK_SECRET`    | WhatsApp webhook secret          |
| `META_APP_ID`          | Meta app ID                      |
| `META_APP_SECRET`      | Meta app secret                  |
| `R2_BUCKET_NAME`       | Cloudflare R2 bucket name        |
| `R2_ENDPOINT`          | Cloudflare R2 endpoint           |
| `R2_ACCESS_KEY_ID`     | Cloudflare R2 access key         |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key         |
| `API_PORT`             | API port (default: 4000)         |
| `CORS_ORIGIN`          | Allowed CORS origin              |

### Web

| Variable                            | Description                  |
|-------------------------------------|------------------------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key             |
| `CLERK_SECRET_KEY`                  | Clerk secret key             |
| `CLERK_WEBHOOK_SECRET`              | Clerk webhook secret         |
| `NEXT_PUBLIC_API_URL`               | API base URL                 |
| `NEXT_PUBLIC_META_APP_ID`           | Meta app ID (public)         |
| `NEXT_PUBLIC_META_REDIRECT_URI`     | Meta OAuth redirect URI      |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`     | Clerk sign-in path           |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`     | Clerk sign-up path           |

---

## Deployment

| App | Platform | URL                             |
|-----|----------|---------------------------------|
| API | Railway  | wbmsg-production.up.railway.app |
| Web | Vercel   | wbmsg.com                       |

---

## Contributing

1. Branch from `develop` — `feat/WBMSG-123-description` or `fix/WBMSG-456-description`
2. Follow Conventional Commits — `feat(scope):` / `fix(scope):` / `chore(scope):`
3. Run `pnpm test` and `pnpm lint` before opening a PR
4. 1 approval + all CI checks required to merge

---

## License

© 2026 WBMSG. All rights reserved.
