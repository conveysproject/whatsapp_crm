# WBMSG Sprint 1: Project Bootstrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Turborepo monorepo with apps/web (Next.js 15), apps/api (Fastify), apps/mobile (Expo stub), and packages/shared; wire up Docker Compose for local dev (Postgres, Redis, Meilisearch); and configure GitHub Actions CI so any engineer can clone and be productive in under 30 minutes.

**Architecture:** Turborepo monorepo with pnpm workspaces manages three apps and three shared packages. The API serves a `/health` endpoint via Fastify. Docker Compose provides all local infrastructure dependencies without requiring anything beyond Docker and Node 20.

**Tech Stack:** pnpm 9, Turborepo 2, Node.js 20, TypeScript 5, Next.js 15, Fastify 4, React Native + Expo 51, Docker Compose, GitHub Actions

---

## File Structure

```
WBMSG/
├── apps/
│   ├── api/                        # Fastify REST API (Node 20 + TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts            # Server entry point
│   │   │   └── routes/
│   │   │       └── health.ts       # GET /health
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                        # Next.js 15 App Router (TypeScript)
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── mobile/                     # React Native + Expo 51 (stub)
│       ├── App.tsx
│       ├── app.json
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared/                     # Shared TypeScript types and utilities
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── eslint-config/              # Shared ESLint config
│   │   ├── index.js
│   │   └── package.json
│   └── tsconfig/                   # Shared TypeScript base configs
│       ├── base.json
│       ├── nextjs.json
│       ├── react-native.json
│       └── package.json
├── infra/
│   └── terraform/                  # AWS staging IaC (placeholder)
│       └── README.md
├── .github/
│   ├── workflows/
│   │   └── ci.yml                  # Lint + type-check + test on every PR
│   └── PULL_REQUEST_TEMPLATE.md
├── docker-compose.yml              # Postgres 16, Redis 7, Meilisearch
├── turbo.json                      # Pipeline definitions
├── package.json                    # Root workspace package.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
└── CONTRIBUTING.md
```

---

## Task 1: Repository & Monorepo Foundation

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Initialize git repository**

```bash
git init WBMSG
cd WBMSG
git checkout -b main
```

- [ ] **Step 2: Create root package.json**

```json
{
  "name": "WBMSG",
  "version": "0.0.1",
  "private": true,
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "test": "turbo test",
    "clean": "turbo clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
.next/
dist/
.expo/

# Environment
.env
.env.local
.env.production

# Turbo
.turbo/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/settings.json
.idea/

# Test coverage
coverage/

# Terraform state
*.tfstate
*.tfstate.backup
.terraform/
```

- [ ] **Step 6: Create .env.example**

```bash
# PostgreSQL
DATABASE_URL=postgresql://WBMSG:WBMSG@localhost:5432/WBMSG_dev

# Redis
REDIS_URL=redis://localhost:6379

# Meilisearch
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_MASTER_KEY=dev-master-key

# Clerk (Auth)
CLERK_SECRET_KEY=sk_test_REPLACE_ME
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME

# App
API_PORT=4000
NODE_ENV=development
```

- [ ] **Step 7: Install dependencies and verify pnpm is available**

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

Expected: `node_modules/.pnpm` directory created, lockfile generated.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .env.example
git commit -m "chore: initialize Turborepo monorepo"
```

---

## Task 2: Shared TypeScript Config Package

**Files:**
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`
- Create: `packages/tsconfig/nextjs.json`
- Create: `packages/tsconfig/react-native.json`

- [ ] **Step 1: Create packages/tsconfig/package.json**

```json
{
  "name": "@WBMSG/tsconfig",
  "version": "0.0.1",
  "private": true,
  "files": ["base.json", "nextjs.json", "react-native.json"]
}
```

- [ ] **Step 2: Create packages/tsconfig/base.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Default",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "incremental": true
  },
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create packages/tsconfig/nextjs.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Next.js",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 4: Create packages/tsconfig/react-native.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "React Native",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "jsx": "react-native",
    "allowJs": true,
    "moduleResolution": "node"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/tsconfig/
git commit -m "chore: add shared tsconfig package"
```

---

## Task 3: Shared ESLint Config Package

**Files:**
- Create: `packages/eslint-config/package.json`
- Create: `packages/eslint-config/index.js`

- [ ] **Step 1: Create packages/eslint-config/package.json**

```json
{
  "name": "@WBMSG/eslint-config",
  "version": "0.0.1",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.0.0"
  }
}
```

- [ ] **Step 2: Create packages/eslint-config/index.js**

```js
/** @type {import("eslint").Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports" }
    ],
  },
  ignorePatterns: ["dist/", ".next/", "node_modules/"],
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/eslint-config/
git commit -m "chore: add shared eslint-config package"
```

---

## Task 4: Shared Types Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "@WBMSG/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "@WBMSG/tsconfig": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create packages/shared/tsconfig.json**

```json
{
  "extends": "@WBMSG/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/shared/src/index.ts**

```typescript
// Shared domain types for WBMSG
// Expand these as features are built in Sprint 2+

export type OrganizationId = string & { readonly __brand: "OrganizationId" };
export type UserId = string & { readonly __brand: "UserId" };

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const API_VERSION = "v1" as const;
```

- [ ] **Step 4: Run type-check to confirm the package compiles**

```bash
cd packages/shared && pnpm type-check
```

Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add shared types package with branded ID types"
```

---

## Task 5: API App (Fastify)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/routes/health.ts`

- [ ] **Step 1: Create apps/api/package.json**

```json
{
  "name": "@WBMSG/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && tsc-alias",
    "start": "node dist/index.js",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@WBMSG/shared": "workspace:*",
    "fastify": "^4.27.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@WBMSG/eslint-config": "workspace:*",
    "@WBMSG/tsconfig": "workspace:*",
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create apps/api/tsconfig.json**

```json
{
  "extends": "@WBMSG/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "CommonJS",
    "moduleResolution": "node"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create apps/api/src/routes/health.ts**

```typescript
import type { FastifyPluginAsync } from "fastify";

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.0.1",
    });
  });
};
```

- [ ] **Step 4: Create apps/api/src/index.ts**

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { healthRoute } from "./routes/health.js";

const PORT = Number(process.env.API_PORT ?? 4000);
const HOST = process.env.API_HOST ?? "0.0.0.0";

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

async function start() {
  await server.register(helmet);
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  });

  await server.register(healthRoute);

  await server.listen({ port: PORT, host: HOST });
  server.log.info(`API running on http://${HOST}:${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Install API dependencies**

```bash
cd apps/api && pnpm install
```

- [ ] **Step 6: Run the API in dev mode and verify health endpoint**

```bash
cd apps/api && pnpm dev
```

In a second terminal:

```bash
curl http://localhost:4000/health
```

Expected output:
```json
{"status":"ok","timestamp":"2026-04-27T...","version":"0.0.1"}
```

- [ ] **Step 7: Write a unit test for the health route**

Create `apps/api/src/routes/health.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { healthRoute } from "./health.js";

describe("GET /health", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(healthRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with status ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd apps/api && pnpm test
```

Expected: `1 test passed`

- [ ] **Step 9: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add Fastify app with /health endpoint and unit test"
```

---

## Task 6: Web App (Next.js 15)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "@WBMSG/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf .next"
  },
  "dependencies": {
    "@WBMSG/shared": "workspace:*",
    "next": "15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@WBMSG/eslint-config": "workspace:*",
    "@WBMSG/tsconfig": "workspace:*",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

- [ ] **Step 2: Create apps/web/tsconfig.json**

```json
{
  "extends": "@WBMSG/tsconfig/nextjs.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create apps/web/next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@WBMSG/shared"],
};

export default nextConfig;
```

- [ ] **Step 4: Create apps/web/app/layout.tsx**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WBMSG",
  description: "WhatsApp-first CRM for SMBs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create apps/web/app/page.tsx**

```tsx
export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>WBMSG</h1>
      <p>WhatsApp-first CRM for SMBs. Sprint 1 — monorepo bootstrapped.</p>
    </main>
  );
}
```

- [ ] **Step 6: Install web dependencies**

```bash
cd apps/web && pnpm install
```

- [ ] **Step 7: Run the web app and verify it loads**

```bash
cd apps/web && pnpm dev
```

Open `http://localhost:3000` — expect to see "WBMSG" heading.

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add Next.js 15 App Router web shell"
```

---

## Task 7: Mobile App Stub (React Native + Expo)

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/App.tsx`

- [ ] **Step 1: Create apps/mobile/package.json**

```json
{
  "name": "@WBMSG/mobile",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "build:ios": "expo build:ios",
    "build:android": "expo build:android",
    "type-check": "tsc --noEmit",
    "lint": "eslint App.tsx --ext .tsx,.ts"
  },
  "dependencies": {
    "@WBMSG/shared": "workspace:*",
    "expo": "~51.0.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.1"
  },
  "devDependencies": {
    "@WBMSG/tsconfig": "workspace:*",
    "@types/react": "~18.2.45",
    "typescript": "^5.1.3"
  }
}
```

- [ ] **Step 2: Create apps/mobile/app.json**

```json
{
  "expo": {
    "name": "WBMSG",
    "slug": "WBMSG",
    "version": "1.0.0",
    "orientation": "portrait",
    "platforms": ["ios", "android"],
    "ios": { "supportsTablet": true },
    "android": { "adaptiveIcon": { "backgroundColor": "#ffffff" } }
  }
}
```

- [ ] **Step 3: Create apps/mobile/tsconfig.json**

```json
{
  "extends": "@WBMSG/tsconfig/react-native.json",
  "compilerOptions": {
    "strict": true
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- [ ] **Step 4: Create apps/mobile/App.tsx**

```tsx
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { API_VERSION } from "@WBMSG/shared";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>WBMSG</Text>
      <Text>API {API_VERSION} — mobile stub</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/
git commit -m "chore(mobile): add React Native + Expo stub app"
```

---

## Task 8: Docker Compose (Local Infrastructure)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: WBMSG_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: WBMSG
      POSTGRES_PASSWORD: WBMSG
      POSTGRES_DB: WBMSG_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U WBMSG -d WBMSG_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: WBMSG_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  meilisearch:
    image: getmeili/meilisearch:v1.8
    container_name: WBMSG_meilisearch
    restart: unless-stopped
    environment:
      MEILI_MASTER_KEY: dev-master-key
      MEILI_ENV: development
    ports:
      - "7700:7700"
    volumes:
      - meilisearch_data:/meili_data
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--spider", "http://localhost:7700/health"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
  meilisearch_data:
```

- [ ] **Step 2: Start containers and verify all are healthy**

```bash
docker compose up -d
docker compose ps
```

Expected: All 3 containers show status `Up` with health `healthy`.

- [ ] **Step 3: Verify Postgres is reachable**

```bash
docker compose exec postgres psql -U WBMSG -d WBMSG_dev -c "SELECT version();"
```

Expected: Shows `PostgreSQL 16.x ...`

- [ ] **Step 4: Verify Redis is reachable**

```bash
docker compose exec redis redis-cli ping
```

Expected: `PONG`

- [ ] **Step 5: Verify Meilisearch is reachable**

```bash
curl http://localhost:7700/health
```

Expected: `{"status":"available"}`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add Docker Compose for local dev (Postgres 16, Redis 7, Meilisearch)"
```

---

## Task 9: GitHub Actions CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: Create .github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-type-check:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm type-check

      - name: Lint
        run: pnpm lint

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build shared packages
        run: pnpm --filter @WBMSG/shared build

      - name: Run tests
        run: pnpm test

  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [lint-and-type-check]
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm build
```

- [ ] **Step 2: Create .github/PULL_REQUEST_TEMPLATE.md**

```markdown
## Summary

<!-- 1-3 bullet points: what this PR does and why -->

-
-

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Chore / infrastructure
- [ ] Documentation

## Testing

- [ ] Unit tests added / updated
- [ ] Manually tested locally
- [ ] Docker Compose services verified (if infra change)

## Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm type-check` passes
- [ ] `pnpm test` passes
- [ ] No `.env` secrets committed
- [ ] Relevant documentation updated (if API contract changed)

## Linked Issues

<!-- Closes #xxx -->
```

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions pipeline (lint, type-check, test, build)"
```

---

## Task 10: Contributing Guide

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `infra/terraform/README.md`

- [ ] **Step 1: Create CONTRIBUTING.md**

```markdown
# Contributing to WBMSG

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
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
```

- [ ] **Step 2: Create infra/terraform/README.md**

```markdown
# WBMSG Infrastructure (Terraform)

AWS staging environment provisioned via Terraform.

## Resources

- VPC with public/private subnets across 2 AZs
- ECS Fargate cluster (API service)
- RDS PostgreSQL 16 (Aurora Serverless v2 in production)
- ElastiCache Redis 7
- S3 bucket for media/exports
- Application Load Balancer (HTTPS)

## Setup

1. Install [Terraform CLI](https://developer.hashicorp.com/terraform/install) >= 1.8
2. Configure AWS credentials: `aws configure`
3. Initialize: `terraform init`
4. Plan: `terraform plan -var-file=staging.tfvars`
5. Apply: `terraform apply -var-file=staging.tfvars`

> **Note:** Terraform state is stored in S3 backend. Backend config in `backend.tf` (not committed). Get the config from 1Password vault: "WBMSG Infra".

## Environments

| Environment | Branch  | AWS Account |
|-------------|---------|-------------|
| Staging     | develop | WBMSG-staging |
| Production  | main    | WBMSG-prod |
```

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md infra/
git commit -m "docs: add contributing guide and infra README"
```

---

## Task 11: Verify Definition of Done

- [ ] **Step 1: Clean clone simulation — install from scratch**

```bash
# In a temp directory
cd /tmp
git clone <your-repo-url> WBMSG-test
cd WBMSG-test
pnpm install
```

Expected: completes without errors.

- [ ] **Step 2: Start infrastructure**

```bash
docker compose up -d
```

Expected: all 3 containers healthy within 30 seconds.

- [ ] **Step 3: Run all checks**

```bash
pnpm type-check
pnpm lint
pnpm test
```

Expected: all exit 0.

- [ ] **Step 4: Start all apps**

```bash
pnpm dev
```

Expected:
- `http://localhost:3000` — WBMSG web app loads
- `http://localhost:4000/health` — returns `{"status":"ok",...}`

- [ ] **Step 5: Time the above from `git clone` to running apps**

Target: under 30 minutes including Docker image pulls. If over, identify the bottleneck and fix before closing Sprint 1.

- [ ] **Step 6: Final commit and tag**

```bash
git tag sprint-1-complete
git push origin main --tags
```

---

## Self-Review Against Sprint 1 Spec

| Deliverable | Task(s) | Status |
|---|---|---|
| Monorepo structure (Turborepo) with apps/web, apps/api, apps/mobile, packages/shared | Tasks 1–7 | Covered |
| GitHub Actions CI: lint, type-check, unit tests on every PR | Task 9 | Covered |
| Local dev environment via Docker Compose (Postgres, Redis, Meilisearch) | Task 8 | Covered |
| Engineering handbook: contribution guidelines, branch naming, PR templates | Tasks 9–10 | Covered |
| Onboarding: any engineer productive in <30 minutes | Task 11 | Verified |
| Terraform IaC for AWS staging | `infra/terraform/README.md` stub | Stub only — full IaC requires AWS account setup outside this plan |
| Sentry, Datadog, PagerDuty account provisioning | Not in this plan | Operational task — done manually by DevOps lead |

> **Note on Terraform and observability tooling:** These require AWS console access and third-party account creation. They are not automatable via this plan without credentials. The DevOps lead should provision these in parallel with this plan's execution and add the resulting env vars to `.env.example`.
