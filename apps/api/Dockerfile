FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# ── Prune to API-only workspace ───────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @WBMSG/api --docker

# ── Install all deps ──────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ── Build + create workspace-free prod deployment ─────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @WBMSG/shared build
RUN pnpm --filter @WBMSG/api run generate
RUN pnpm --filter @WBMSG/api build
# pnpm deploy produces a flat node_modules with no pnpm-workspace.yaml
RUN pnpm --filter @WBMSG/api deploy --prod --legacy /prod

# ── Production image (flat pnpm-deploy structure, no workspace) ───────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Flat node_modules — no workspace, no pnpm context at runtime
COPY --from=builder /prod/node_modules ./node_modules
COPY --from=builder /prod/package.json ./package.json

# Compiled output replaces source
COPY --from=builder /app/apps/api/dist ./dist

# Prisma schema, migrations, and JS config (no tsx needed)
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/prisma.config.js ./

# Regenerate Prisma client against the clean flat node_modules
RUN ./node_modules/.bin/prisma generate

COPY --from=pruner /app/out/full/apps/api/start.sh ./
RUN chmod +x ./start.sh

EXPOSE 4000
CMD ["sh", "start.sh"]
