# Contributing to WBMSG

## Prerequisites

- Node.js 20+
- pnpm 10+ (`npm install -g pnpm`)
- Docker Desktop (for local infrastructure)
- Git

## Quick Start

```bash
git clone git@github.com:WBMSG/WBMSG.git
cd WBMSG
cp .env.example .env          # fill in your values
pnpm install
docker compose up -d          # start Postgres, Redis, Meilisearch
pnpm dev                      # starts all apps in parallel
```

Apps run at:
- Web: http://localhost:3000
- API: http://localhost:4000
- Meilisearch: http://localhost:7700

## Branch Naming

```
feat/TRUST-123-short-description
fix/TRUST-456-short-description
chore/update-dependencies
```

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api): add contacts endpoint
fix(web): resolve inbox render flicker
chore(deps): bump next to 15.1.0
```

## PR Process

1. Branch from `develop` (not `main`)
2. Keep PRs focused — one feature or fix per PR
3. All CI checks must pass before requesting review
4. Minimum 1 approval required to merge

## Code Style

- TypeScript strict mode enforced (`strict: true`)
- ESLint runs on every PR — fix all errors, address warnings
- No `console.log` in production code — use the Fastify logger or `pino`
- Prefer named exports over default exports in shared packages

## Testing

- Write tests alongside implementation (TDD preferred)
- API: Vitest for unit and integration tests
- Web: Vitest + React Testing Library (added in Sprint 5)
- Run `pnpm test` before opening a PR
