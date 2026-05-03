FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# ── Prune to API-only workspace ───────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @WBMSG/api --docker

# ── Install dependencies (pruned workspace only) ──────────────────────────────
FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ── Build shared + api ────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @WBMSG/shared build
RUN pnpm --filter @WBMSG/api run generate
RUN pnpm --filter @WBMSG/api build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/prisma.config.js ./apps/api/
RUN pnpm --filter @WBMSG/api run generate

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=pruner /app/out/full/apps/api/start.sh ./apps/api/start.sh
RUN chmod +x ./apps/api/start.sh

WORKDIR /app/apps/api
EXPOSE 4000

CMD ["sh", "start.sh"]
