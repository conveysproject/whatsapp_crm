#!/usr/bin/env bash
# One-command local dev setup for WBMSG.
# Usage: bash scripts/setup.sh   OR   make setup

set -euo pipefail

# ── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▸ $*${RESET}"; }
success() { echo -e "${GREEN}✔ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
error()   { echo -e "${RED}✖ $*${RESET}"; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Banner ─────────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
echo "  ████████╗██████╗ ██╗   ██╗███████╗████████╗ ██████╗██████╗ ███╗   ███╗"
echo "     ██╔══╝██╔══██╗██║   ██║██╔════╝╚══██╔══╝██╔════╝██╔══██╗████╗ ████║"
echo "     ██║   ██████╔╝██║   ██║███████╗   ██║   ██║     ██████╔╝██╔████╔██║"
echo "     ██║   ██╔══██╗██║   ██║╚════██║   ██║   ██║     ██╔══██╗██║╚██╔╝██║"
echo "     ██║   ██║  ██║╚██████╔╝███████║   ██║   ╚██████╗██║  ██║██║ ╚═╝ ██║"
echo "     ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝    ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝"
echo -e "${RESET}"
echo -e "  ${BOLD}Local Dev Setup${RESET} — WhatsApp-First CRM for SMBs\n"

# ── 1. Prerequisites ───────────────────────────────────────────────────────────
header "1/6  Checking prerequisites"

# Node >= 20
if ! command -v node &>/dev/null; then
  error "Node.js not found. Install Node 20+ from https://nodejs.org"
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VER" -lt 20 ]; then
  error "Node.js 20+ required (found v$(node -v)). Upgrade at https://nodejs.org"
fi
success "Node.js v$(node -v)"

# pnpm
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — installing via npm..."
  npm install -g pnpm@10.33.2
fi
success "pnpm $(pnpm -v)"

# Docker
if ! command -v docker &>/dev/null; then
  error "Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop"
fi
if ! docker info &>/dev/null; then
  error "Docker daemon is not running. Start Docker Desktop and try again."
fi
success "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'running')"

# ── 2. Environment file ────────────────────────────────────────────────────────
header "2/6  Environment (.env)"

if [ ! -f .env ]; then
  cp .env.example .env
  success "Created .env from .env.example"
else
  success ".env already exists — skipping"
fi

# Warn about keys that still need real values
MISSING_KEYS=()
while IFS= read -r line; do
  [[ "$line" =~ ^# ]] && continue
  [[ -z "$line" ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  if [[ "$val" == *"REPLACE_ME"* ]]; then
    MISSING_KEYS+=("$key")
  fi
done < .env

if [ ${#MISSING_KEYS[@]} -gt 0 ]; then
  warn "The following keys in .env still need real values:"
  for k in "${MISSING_KEYS[@]}"; do
    echo -e "    ${YELLOW}• $k${RESET}"
  done
  echo -e "  ${CYAN}The app will start but features needing these keys (Clerk auth, WhatsApp, Sentry) won't work until filled in.${RESET}"
fi

# Symlink root .env into apps so each tool picks up the vars it needs.
# Next.js reads from apps/web/ (not monorepo root); API uses dotenv from cwd.
for target in apps/web/.env.local apps/api/.env; do
  if [ ! -e "$target" ]; then
    ln -sf "$(pwd)/.env" "$target" 2>/dev/null || cp .env "$target"
    success "Linked .env → $target"
  else
    success "$target already exists — skipping"
  fi
done

# ── 3. Install dependencies ────────────────────────────────────────────────────
header "3/6  Installing dependencies"
info "Running pnpm install..."
pnpm install --frozen-lockfile
success "Dependencies installed"

# ── 4. Start Docker services ───────────────────────────────────────────────────
header "4/6  Starting Docker services (Postgres · Redis · Meilisearch)"
info "Starting containers..."
docker compose up -d postgres redis meilisearch
success "Containers started"

# Wait helper: retries until command succeeds or timeout
wait_for() {
  local name="$1"; local cmd="$2"; local max=30; local i=0
  info "Waiting for $name to be ready..."
  until eval "$cmd" &>/dev/null; do
    i=$((i+1))
    if [ $i -ge $max ]; then error "$name did not become healthy after ${max}s. Check: docker compose logs $name"; fi
    sleep 1
  done
  success "$name is ready"
}

wait_for "Postgres"      "docker exec WBMSG_postgres pg_isready -U WBMSG -d WBMSG_dev -q"
wait_for "Redis"         "docker exec WBMSG_redis redis-cli ping"
wait_for "Meilisearch"   "curl -sf http://localhost:7700/health"

# ── 5. Prisma ─────────────────────────────────────────────────────────────────
header "5/6  Prisma — generate client + run migrations"
# Load root .env so Prisma picks up DATABASE_URL (monorepo: .env lives at root)
set -a && source .env && set +a
info "Generating Prisma client..."
pnpm --filter @WBMSG/api exec prisma generate
success "Prisma client generated"

info "Applying database migrations..."
pnpm --filter @WBMSG/api exec prisma migrate deploy
success "Migrations applied"

# ── 6. Done ───────────────────────────────────────────────────────────────────
header "6/6  All done!"
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   Local environment is ready!                ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  ${BOLD}Services running:${RESET}"
echo -e "    Postgres     → localhost:5432  (WBMSG / WBMSG)"
echo -e "    Redis        → localhost:6379"
echo -e "    Meilisearch  → http://localhost:7700  (key: dev-master-key)"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "    ${CYAN}make dev${RESET}       — start all apps (api + web)"
echo -e "    ${CYAN}make dev-api${RESET}   — start API only  (port 4000)"
echo -e "    ${CYAN}make dev-web${RESET}   — start web only  (port 3000)"
echo -e "    ${CYAN}make db-studio${RESET} — open Prisma Studio"
echo ""
if [ ${#MISSING_KEYS[@]} -gt 0 ]; then
  warn "Remember to fill in the missing .env keys before testing auth / WhatsApp features."
fi
