.DEFAULT_GOAL := help

# ── Setup ──────────────────────────────────────────────────────────────────────
setup: ## First-time local dev setup (checks prereqs, .env, Docker, Prisma)
	@bash scripts/setup.sh

# ── Dependencies ───────────────────────────────────────────────────────────────
install: ## Install all workspace dependencies
	pnpm install

# ── Development ────────────────────────────────────────────────────────────────
dev: ## Start all apps (web + api + mobile)
	pnpm dev

dev-api: ## Start API only (Fastify, port 4000)
	pnpm --filter @trustcrm/api dev

dev-web: ## Start web only (Next.js, port 3000)
	pnpm --filter @trustcrm/web dev

dev-mobile: ## Start Expo dev server
	pnpm --filter @trustcrm/mobile dev

# ── Build ──────────────────────────────────────────────────────────────────────
build: ## Build all apps
	pnpm build

build-api: ## Build API only
	pnpm --filter @trustcrm/api build

build-web: ## Build web only
	pnpm --filter @trustcrm/web build

# ── Quality ────────────────────────────────────────────────────────────────────
lint: ## Lint all packages
	pnpm lint

type-check: ## Type-check all packages
	pnpm type-check

test: ## Run all tests
	pnpm test

test-api: ## Run API tests only
	pnpm --filter @trustcrm/api test

test-watch: ## Run API tests in watch mode
	pnpm --filter @trustcrm/api exec vitest

check: lint type-check test ## Lint + type-check + test

# ── Database ───────────────────────────────────────────────────────────────────
db-migrate: ## Run Prisma migrations (dev)
	pnpm --filter @trustcrm/api exec prisma migrate dev

db-migrate-prod: ## Deploy migrations (production)
	pnpm --filter @trustcrm/api exec prisma migrate deploy

db-generate: ## Regenerate Prisma client
	pnpm --filter @trustcrm/api exec prisma generate

db-studio: ## Open Prisma Studio
	pnpm --filter @trustcrm/api exec prisma studio

db-reset: ## Reset dev database (destructive)
	pnpm --filter @trustcrm/api exec prisma migrate reset

# ── Docker ─────────────────────────────────────────────────────────────────────
up: ## Start Postgres, Redis, Meilisearch
	docker compose up -d postgres redis meilisearch

down: ## Stop all services
	docker compose down

logs: ## Tail all service logs
	docker compose logs -f

ps: ## Show running services
	docker compose ps

# ── Cleanup ────────────────────────────────────────────────────────────────────
kill-ports: ## Kill any processes holding ports 3000 / 4000
	@for port in 3000 4000; do \
		pid=$$(netstat -ano 2>/dev/null | grep ":$$port " | grep LISTENING | awk '{print $$5}' | head -1); \
		if [ -n "$$pid" ]; then \
			echo "Killing PID $$pid on port $$port"; \
			taskkill //F //PID $$pid 2>/dev/null || kill -9 $$pid 2>/dev/null || true; \
		fi; \
	done

clean: ## Remove build artefacts and node_modules
	pnpm clean

# ── Help ───────────────────────────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: setup install dev dev-api dev-web dev-mobile \
        build build-api build-web \
        lint type-check test test-api test-watch check \
        db-migrate db-migrate-prod db-generate db-studio db-reset \
        up down logs ps \
        kill-ports clean help
