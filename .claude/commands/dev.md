Start the full WBMSG local development stack.

Execute in order:
1. `docker compose up -d` — start Postgres 16, Redis 7, Meilisearch (safe to run if already up)
2. `pnpm dev` — start all apps via Turborepo in parallel (this is a long-running process)

Once running, the apps are available at:
- Web:             http://localhost:3000
- API:             http://localhost:4000
- API health:      http://localhost:4000/health
- Meilisearch:     http://localhost:7700
