FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# ── Prune to mobile-only workspace ────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @WBMSG/mobile --docker

# ── Install dependencies (pruned workspace only) ──────────────────────────────
FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ── Build shared + export static bundle ──────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/mobile/node_modules ./apps/mobile/node_modules
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @WBMSG/shared build
RUN pnpm --filter @WBMSG/mobile type-check

# ── CI/type-check image (no runtime server for native apps) ──────────────────
FROM builder AS runner
WORKDIR /app/apps/mobile
CMD ["pnpm", "type-check"]
