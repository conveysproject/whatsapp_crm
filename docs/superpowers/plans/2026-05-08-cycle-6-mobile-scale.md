# Cycle 6 — Mobile + Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Expo mobile app (push notifications, inbox, campaign management), add SuperAdmin capabilities (impersonation, ban/unban orgs, platform config), implement UPI QR code generation, automatic message deletion cron job, bot timing restrictions UI, and white-label custom domain routing.

**Architecture:** Schema-first: add `PlatformConfig` model → generate → SuperAdmin API routes (guarded by `role === "superAdmin"` check) → platform config API → mobile Expo screens → BullMQ cron job for message deletion. The `Organization.domain` field and branding fields were added in Cycle 1.

**Tech Stack:** Prisma (PostgreSQL), Fastify 4 ESM, Vitest, Next.js 15 App Router, Tailwind, React Query, Expo 51 / React Native 0.74, BullMQ (cron), qrcode npm package

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `apps/api/prisma/schema.prisma` | Add PlatformConfig model |
| Create | `apps/api/src/routes/admin.ts` | SuperAdmin: impersonate, ban/unban, platform-config, orgs list, manual subs |
| Create | `apps/api/src/routes/admin.test.ts` | Tests for admin routes |
| Create | `apps/api/src/routes/platform-config.ts` | Public platform config endpoint (for white-label) |
| Create | `apps/api/src/routes/platform-config.test.ts` | Tests |
| Modify | `apps/api/src/routes/billing.ts` | Add UPI QR endpoint |
| Modify | `apps/api/src/routes/billing.test.ts` | Test |
| Modify | `apps/api/src/routes/index.ts` | Register admin and platform-config routers |
| Create | `apps/api/src/workers/message-cleanup.ts` | BullMQ cron job for auto message deletion |
| Modify | `apps/web/app/(dashboard)/settings/vendor-settings/page.tsx` | Bot timing restrictions UI |
| Create | `apps/web/app/(admin)/organizations/page.tsx` | SuperAdmin orgs list |
| Create | `apps/web/app/(admin)/organizations/[id]/page.tsx` | Org detail: impersonate, ban, manual subscription |
| Create | `apps/web/app/(admin)/platform-config/page.tsx` | Platform config key-value editor |
| Modify | `apps/mobile/app/(tabs)/inbox.tsx` | Full chat functionality in mobile inbox |
| Modify | `apps/mobile/app/(tabs)/contacts.tsx` | Contact search and quick message |
| Create | `apps/mobile/app/(tabs)/campaigns.tsx` | Campaign management from mobile |
| Modify | `apps/mobile/app/_layout.tsx` | Register push notification handler |

---

## Task 1: Schema — PlatformConfig model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add PlatformConfig model**

Open `apps/api/prisma/schema.prisma`. After the `ResponseWebhookActionLog` model, add:

```prisma
model PlatformConfig {
  id        String   @id @default(uuid())
  key       String   @unique
  value     String?  @db.Text
  dataType  String   @default("string") @map("data_type")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("platform_configs")
}
```

- [ ] **Step 2: Run migration**

```bash
pnpm --filter @WBMSG/api migrate dev --name cycle6_mobile_scale
```

Expected: `The following migration(s) have been created and applied`

- [ ] **Step 3: Generate and type-check**

```bash
pnpm --filter @WBMSG/api generate && pnpm type-check
```

Expected: `✔ Generated Prisma Client` then no type errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(prisma): cycle6 schema — PlatformConfig model"
```

---

## Task 2: SuperAdmin API Routes

**Files:**
- Create: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/routes/admin.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/admin.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  organization: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  organizationMember: {
    findFirst: vi.fn(),
  },
  manualSubscription: {
    create: vi.fn(),
  },
  platformConfig: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
};

// SuperAdmin auth
const mockAdminAuth = { userId: "sa-1", organizationId: "platform", role: "superAdmin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAdminAuth; });
  const { adminRouter } = await import("./admin.js");
  await app.register(adminRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/admin/organizations", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns all organizations", async () => {
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: "org-1", name: "Acme Corp", status: "active" },
      { id: "org-2", name: "Beta Ltd", status: "active" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(2);
  });
});

describe("POST /v1/admin/organizations/:id/ban", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets org status to banned with reason", async () => {
    mockPrisma.organization.update.mockResolvedValue({ id: "org-1", status: "banned", banReason: "TOS violation" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/organizations/org-1/ban",
      payload: { reason: "TOS violation" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "banned", banReason: "TOS violation" } })
    );
  });
});

describe("POST /v1/admin/organizations/:id/unban", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("clears org ban status", async () => {
    mockPrisma.organization.update.mockResolvedValue({ id: "org-1", status: "active", banReason: null });
    const res = await app.inject({ method: "POST", url: "/v1/admin/organizations/org-1/unban" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "active", banReason: null } })
    );
  });
});

describe("GET /v1/admin/platform-config", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns all platform config keys", async () => {
    mockPrisma.platformConfig.findMany.mockResolvedValue([
      { id: "pc-1", key: "smtp_host", value: "smtp.resend.com", dataType: "string" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/admin/platform-config" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test admin
```

Expected: `FAIL — Cannot find module './admin.js'`

- [ ] **Step 3: Create the admin route**

Create `apps/api/src/routes/admin.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";

function requireSuperAdmin(role: string, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (role !== "superAdmin") {
    reply.status(403).send({ error: "Super admin access required" });
    return false;
  }
  return true;
}

export const adminRouter: FastifyPluginAsync = async (fastify) => {
  // ── Organizations list ───────────────────────────────────────────────────
  fastify.get<{ Querystring: { status?: string; page?: string } }>("/admin/organizations", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const page = parseInt(request.query.page ?? "1", 10);
    const where = request.query.status ? { status: request.query.status } : {};
    const [data, total] = await Promise.all([
      fastify.prisma.organization.findMany({
        where,
        include: { _count: { select: { members: true, contacts: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      }),
      fastify.prisma.organization.count({ where }),
    ]);
    return reply.send({ data, total, page });
  });

  // ── Organization impersonation ───────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/admin/organizations/:id/login-as", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });
    // Return org data — frontend uses this to switch context
    return reply.send({ data: { organization: org, impersonating: true } });
  });

  // ── Ban / Unban ──────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/admin/organizations/:id/ban",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const data = await fastify.prisma.organization.update({
        where: { id: request.params.id },
        data: { status: "banned", banReason: request.body.reason },
      });
      return reply.send({ data });
    }
  );

  fastify.post<{ Params: { id: string } }>("/admin/organizations/:id/unban", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const data = await fastify.prisma.organization.update({
      where: { id: request.params.id },
      data: { status: "active", banReason: null },
    });
    return reply.send({ data });
  });

  // ── Manual subscriptions ─────────────────────────────────────────────────
  fastify.post<{ Body: { organizationId: string; planId: string; durationDays: number } }>(
    "/admin/manual-subscriptions",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const expiresAt = new Date(Date.now() + request.body.durationDays * 86400000);
      const data = await fastify.prisma.manualSubscription.create({
        data: {
          organizationId: request.body.organizationId,
          planId: request.body.planId,
          status: "active",
          expiresAt,
        },
      });
      return reply.status(201).send({ data });
    }
  );

  // ── Platform config ──────────────────────────────────────────────────────
  fastify.get("/admin/platform-config", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const data = await fastify.prisma.platformConfig.findMany({ orderBy: { key: "asc" } });
    return reply.send({ data });
  });

  fastify.put<{ Body: { configs: { key: string; value: string; dataType?: string }[] } }>(
    "/admin/platform-config",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      await Promise.all(
        request.body.configs.map((c) =>
          fastify.prisma.platformConfig.upsert({
            where: { key: c.key },
            create: { key: c.key, value: c.value, dataType: c.dataType ?? "string" },
            update: { value: c.value, dataType: c.dataType ?? "string" },
          })
        )
      );
      return reply.send({ success: true });
    }
  );
};
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test admin
```

Expected: `✓ all 4 tests pass`

- [ ] **Step 5: Register router**

```typescript
// apps/api/src/routes/index.ts
import { adminRouter } from "./admin.js";
await app.register(adminRouter, { prefix: "/v1" });
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/admin.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): SuperAdmin routes — orgs list, impersonate, ban/unban, platform config, manual subs"
```

---

## Task 3: UPI QR Code Generation

**Files:**
- Modify: `apps/api/src/routes/billing.ts`
- Modify: `apps/api/src/routes/billing.test.ts`

- [ ] **Step 1: Install qrcode package**

```bash
pnpm --filter @WBMSG/api add qrcode
pnpm --filter @WBMSG/api add -D @types/qrcode
```

Expected: `+ qrcode@x.x.x` and `+ @types/qrcode@x.x.x`

- [ ] **Step 2: Write failing test** — add to `billing.test.ts`:

```typescript
describe("GET /v1/billing/upi-qr", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns a PNG image buffer for UPI QR", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/billing/upi-qr?amount=99900&planId=plan-standard",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
pnpm --filter @WBMSG/api test billing
```

- [ ] **Step 4: Add UPI QR route to billing.ts**

At the bottom of the `billingRouter` function in `apps/api/src/routes/billing.ts`, add:

```typescript
  // ── UPI QR code generation ────────────────────────────────────────────────
  fastify.get<{ Querystring: { amount?: string; planId?: string } }>("/billing/upi-qr", async (request, reply) => {
    const QRCode = await import("qrcode");
    const upiId = process.env.UPI_ID ?? "";
    const amount = ((parseInt(request.query.amount ?? "0", 10)) / 100).toFixed(2);
    const label = `TrustCRM ${request.query.planId ?? "Subscription"}`;
    const upiUrl = `upi://pay?pa=${upiId}&pn=TrustCRM&am=${amount}&cu=INR&tn=${encodeURIComponent(label)}`;
    const buffer = await QRCode.toBuffer(upiUrl, { type: "png", width: 300, margin: 2 });
    reply.header("Content-Type", "image/png");
    reply.header("Content-Disposition", "inline; filename=upi-qr.png");
    return reply.send(buffer);
  });
```

- [ ] **Step 5: Run test — expect PASS**

```bash
pnpm --filter @WBMSG/api test billing
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts
git commit -m "feat(api): UPI QR code generation endpoint"
```

---

## Task 4: Message Auto-Deletion BullMQ Cron Job

**Files:**
- Create: `apps/api/src/workers/message-cleanup.ts`

- [ ] **Step 1: Write the cleanup worker**

Create `apps/api/src/workers/message-cleanup.ts`:

```typescript
import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

export const messageCleanupQueue = new Queue("message-cleanup", { connection: redis });

export function startMessageCleanupWorker() {
  const worker = new Worker(
    "message-cleanup",
    async () => {
      // Find all orgs with auto-deletion enabled
      const settings = await prisma.vendorSetting.findMany({
        where: { key: "enable_automatic_message_deletion", value: "true" },
      });

      for (const setting of settings) {
        const daysSetting = await prisma.vendorSetting.findFirst({
          where: { organizationId: setting.organizationId, key: "delete_whatsapp_message_days" },
        });
        const days = parseInt(daysSetting?.value ?? "90", 10);
        const cutoff = new Date(Date.now() - days * 86400000);

        const result = await prisma.message.deleteMany({
          where: {
            organizationId: setting.organizationId,
            createdAt: { lt: cutoff },
          },
        });

        if (result.count > 0) {
          console.log(`[message-cleanup] org=${setting.organizationId} deleted=${result.count} messages older than ${days} days`);
        }
      }
    },
    { connection: redis }
  );

  return worker;
}

export async function scheduleMessageCleanupCron() {
  await messageCleanupQueue.add(
    "daily-cleanup",
    {},
    {
      repeat: { pattern: "0 2 * * *" }, // 2am daily
      jobId: "message-cleanup-cron",
    }
  );
}
```

- [ ] **Step 2: Register worker and cron schedule in API entry**

Find `apps/api/src/index.ts`. Add after existing worker registrations:

```typescript
import { startMessageCleanupWorker, scheduleMessageCleanupCron } from "./workers/message-cleanup.js";

// After server starts:
startMessageCleanupWorker();
await scheduleMessageCleanupCron();
```

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/message-cleanup.ts apps/api/src/index.ts
git commit -m "feat(api): BullMQ cron job for automatic message deletion per org settings"
```

---

## Task 5: Web — Bot Timing Restrictions in Vendor Settings

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/vendor-settings/page.tsx` (or create if missing)

- [ ] **Step 1: Add bot timing restrictions section**

Find or create `apps/web/app/(dashboard)/settings/vendor-settings/page.tsx`:

```tsx
// apps/web/app/(dashboard)/settings/vendor-settings/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function VendorSettingsPage() {
  const qc = useQueryClient();

  const { data: settings } = useQuery<{ data: Record<string, string> }>({
    queryKey: ["vendor-settings"],
    queryFn: () => fetch("/api/v1/vendor-settings").then((r) => r.json()),
  });

  const [botTimingEnabled, setBotTimingEnabled] = useState(false);
  const [botStart, setBotStart] = useState("09:00");
  const [botEnd, setBotEnd] = useState("18:00");
  const [botTimezone, setBotTimezone] = useState("Asia/Kolkata");
  const [autoDelete, setAutoDelete] = useState(false);
  const [deleteDays, setDeleteDays] = useState("90");
  const [apiAccessToken, setApiAccessToken] = useState("");

  useEffect(() => {
    if (!settings?.data) return;
    setBotTimingEnabled(settings.data.enable_bot_timing_restrictions === "true");
    setBotStart(settings.data.bot_start_timing ?? "09:00");
    setBotEnd(settings.data.bot_end_timing ?? "18:00");
    setBotTimezone(settings.data.bot_timing_timezone ?? "Asia/Kolkata");
    setAutoDelete(settings.data.enable_automatic_message_deletion === "true");
    setDeleteDays(settings.data.delete_whatsapp_message_days ?? "90");
    setApiAccessToken(settings.data.vendor_api_access_token ?? "");
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      fetch("/api/v1/vendor-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: [
            { key: "enable_bot_timing_restrictions", value: String(botTimingEnabled), dataType: "boolean" },
            { key: "bot_start_timing", value: botStart, dataType: "string" },
            { key: "bot_end_timing", value: botEnd, dataType: "string" },
            { key: "bot_timing_timezone", value: botTimezone, dataType: "string" },
            { key: "enable_automatic_message_deletion", value: String(autoDelete), dataType: "boolean" },
            { key: "delete_whatsapp_message_days", value: deleteDays, dataType: "integer" },
            { key: "vendor_api_access_token", value: apiAccessToken, dataType: "string" },
          ],
        }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-settings"] }),
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Advanced Settings</h1>

      {/* Bot Timing Restrictions */}
      <section className="border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Bot Timing Restrictions</h2>
            <p className="text-sm text-gray-500">Only run bots during business hours.</p>
          </div>
          <button
            type="button"
            onClick={() => setBotTimingEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${botTimingEnabled ? "bg-green-500" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${botTimingEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
        {botTimingEnabled && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Start Time</label>
              <input type="time" value={botStart} onChange={(e) => setBotStart(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">End Time</label>
              <input type="time" value={botEnd} onChange={(e) => setBotEnd(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Timezone</label>
              <select value={botTimezone} onChange={(e) => setBotTimezone(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm">
                <option value="Asia/Kolkata">IST (India)</option>
                <option value="Asia/Dubai">GST (Dubai)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">EST (New York)</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Auto Message Deletion */}
      <section className="border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Automatic Message Deletion</h2>
            <p className="text-sm text-gray-500">Delete messages older than N days to save storage.</p>
          </div>
          <button
            type="button"
            onClick={() => setAutoDelete((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoDelete ? "bg-green-500" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoDelete ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
        {autoDelete && (
          <div>
            <label className="block text-xs font-medium mb-1">Delete messages older than (days)</label>
            <input type="number" min="7" max="365" value={deleteDays} onChange={(e) => setDeleteDays(e.target.value)} className="w-32 border rounded px-3 py-1.5 text-sm" />
          </div>
        )}
      </section>

      {/* API Access Token */}
      <section className="border rounded-lg p-5 space-y-3">
        <h2 className="font-medium">API Access Token</h2>
        <p className="text-sm text-gray-500">Use this token to access TrustCRM API programmatically.</p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={apiAccessToken || "Generate a token to get started"}
            className="flex-1 border rounded px-3 py-1.5 text-sm bg-gray-50 font-mono text-xs"
          />
          <button
            onClick={() => {
              const token = crypto.randomUUID().replace(/-/g, "");
              setApiAccessToken(token);
            }}
            className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50"
          >
            Regenerate
          </button>
        </div>
      </section>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="px-6 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
      >
        {save.isPending ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/settings/vendor-settings/
git commit -m "feat(web): bot timing restrictions and auto message deletion settings"
```

---

## Task 6: Web — SuperAdmin Pages

**Files:**
- Create: `apps/web/app/(admin)/organizations/page.tsx`
- Create: `apps/web/app/(admin)/organizations/[id]/page.tsx`
- Create: `apps/web/app/(admin)/platform-config/page.tsx`

- [ ] **Step 1: Create organizations list page**

```tsx
// apps/web/app/(admin)/organizations/page.tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Org {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  _count: { members: number; contacts: number };
}

export default function AdminOrgsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data } = useQuery<{ data: Org[]; total: number }>({
    queryKey: ["admin-orgs"],
    queryFn: () => fetch("/api/v1/admin/organizations").then((r) => r.json()),
  });

  const ban = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      fetch(`/api/v1/admin/organizations/${id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });

  const unban = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/admin/organizations/${id}/unban`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });

  const impersonate = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/admin/organizations/${id}/login-as`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      // Store impersonation context and redirect
      localStorage.setItem("impersonate_org", JSON.stringify(data.data.organization));
      window.location.href = "/";
    },
  });

  const orgs = (data?.data ?? []).filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  const statusColor: Record<string, string> = { active: "text-green-600", banned: "text-red-600", inactive: "text-gray-400" };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <p className="text-sm text-gray-500">{data?.total ?? 0} total</p>
      </div>

      <input
        className="w-full max-w-sm border rounded px-3 py-2 text-sm"
        placeholder="Search by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="border rounded-lg divide-y">
        {orgs.map((org) => (
          <div key={org.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-sm">{org.name}</p>
              <p className="text-xs text-gray-500">{org._count.members} members · {org._count.contacts} contacts · {new Date(org.createdAt).toLocaleDateString("en-IN")}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium capitalize ${statusColor[org.status] ?? "text-gray-500"}`}>{org.status}</span>
              <button
                onClick={() => impersonate.mutate(org.id)}
                className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
              >
                Login As
              </button>
              {org.status === "banned" ? (
                <button onClick={() => unban.mutate(org.id)} className="text-xs px-2 py-1 border border-green-300 text-green-700 rounded hover:bg-green-50">Unban</button>
              ) : (
                <button
                  onClick={() => {
                    const reason = prompt("Ban reason:");
                    if (reason) ban.mutate({ id: org.id, reason });
                  }}
                  className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                >
                  Ban
                </button>
              )}
              <a href={`/admin/organizations/${org.id}`} className="text-xs text-blue-600 hover:underline">Details</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create platform config page**

```tsx
// apps/web/app/(admin)/platform-config/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ConfigEntry {
  id: string;
  key: string;
  value: string | null;
  dataType: string;
}

export default function PlatformConfigPage() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const { data } = useQuery<{ data: ConfigEntry[] }>({
    queryKey: ["platform-config"],
    queryFn: () => fetch("/api/v1/admin/platform-config").then((r) => r.json()),
  });

  useEffect(() => {
    if (!data?.data) return;
    const initial: Record<string, string> = {};
    data.data.forEach((c) => { initial[c.key] = c.value ?? ""; });
    setEdits(initial);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      fetch("/api/v1/admin/platform-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: Object.entries(edits).map(([key, value]) => ({ key, value })) }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-config"] }),
  });

  const CONFIG_GROUPS: Record<string, string[]> = {
    "SMTP": ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from_name", "smtp_from_email"],
    "Stripe": ["stripe_key", "stripe_secret", "stripe_webhook_secret"],
    "Razorpay": ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"],
    "UPI": ["upi_id", "upi_merchant_name"],
    "Branding": ["platform_name", "platform_logo", "support_email"],
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Platform Configuration</h1>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="px-4 py-2 bg-green-600 text-white text-sm rounded disabled:opacity-50">
          {save.isPending ? "Saving..." : "Save All"}
        </button>
      </div>

      {Object.entries(CONFIG_GROUPS).map(([group, keys]) => (
        <section key={group} className="border rounded-lg p-5 space-y-4">
          <h2 className="font-medium">{group}</h2>
          <div className="space-y-3">
            {keys.map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium mb-1 font-mono">{key}</label>
                <input
                  type={key.includes("secret") || key.includes("password") ? "password" : "text"}
                  className="w-full border rounded px-3 py-1.5 text-sm font-mono"
                  value={edits[key] ?? ""}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`Enter ${key}...`}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Custom / other keys */}
      <section className="border rounded-lg p-5 space-y-4">
        <h2 className="font-medium">All Config Keys</h2>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {(data?.data ?? []).map((entry) => (
            <div key={entry.id} className="flex items-center gap-3">
              <code className="text-xs text-gray-500 w-48 flex-shrink-0 truncate">{entry.key}</code>
              <input
                type="text"
                className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                value={edits[entry.key] ?? ""}
                onChange={(e) => setEdits((prev) => ({ ...prev, [entry.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(admin\)/
git commit -m "feat(web): SuperAdmin pages — org list with ban/impersonate, platform config editor"
```

---

## Task 7: Mobile — Push Notifications + Inbox

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/(tabs)/inbox.tsx`

- [ ] **Step 1: Register push notification handler in mobile app root**

Find `apps/mobile/app/_layout.tsx`. Add push notification registration:

```tsx
import * as Notifications from "expo-notifications";
import { useEffect } from "react";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    async function registerForPush() {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return;
      const token = await Notifications.getExpoPushTokenAsync();
      await fetch(`${process.env.EXPO_PUBLIC_API_URL}/v1/users/push-token`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.data, platform: "expo" }),
      });
    }
    registerForPush();
  }, []);

  // ... rest of layout unchanged
}
```

- [ ] **Step 2: Mobile inbox — full chat functionality**

In `apps/mobile/app/(tabs)/inbox.tsx`, ensure the conversation list and message thread work. Add if message input is missing:

```tsx
import { useState } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API = process.env.EXPO_PUBLIC_API_URL;

interface Conversation {
  id: string;
  contact: { firstName: string | null; lastName: string | null; phone: string };
  lastMessage: { body: string; createdAt: string } | null;
}

interface Message {
  id: string;
  body: string;
  direction: string;
  createdAt: string;
}

export default function InboxScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const qc = useQueryClient();

  const { data: convos } = useQuery<{ data: Conversation[] }>({
    queryKey: ["conversations"],
    queryFn: () => fetch(`${API}/v1/conversations`).then((r) => r.json()),
  });

  const { data: messages } = useQuery<{ data: Message[] }>({
    queryKey: ["messages", selectedId],
    queryFn: () => fetch(`${API}/v1/messages?conversationId=${selectedId}`).then((r) => r.json()),
    enabled: !!selectedId,
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: (body: string) =>
      fetch(`${API}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, body, direction: "outbound" }),
      }).then((r) => r.json()),
    onSuccess: () => {
      setMessageText("");
      qc.invalidateQueries({ queryKey: ["messages", selectedId] });
    },
  });

  if (!selectedId) {
    return (
      <FlatList
        data={convos?.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => setSelectedId(item.id)}>
            <Text style={styles.name}>{[item.contact.firstName, item.contact.lastName].filter(Boolean).join(" ") || item.contact.phone}</Text>
            <Text style={styles.preview} numberOfLines={1}>{item.lastMessage?.body ?? ""}</Text>
          </TouchableOpacity>
        )}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity onPress={() => setSelectedId(null)} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <FlatList
        data={messages?.data ?? []}
        keyExtractor={(item) => item.id}
        inverted
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.direction === "outbound" ? styles.outbound : styles.inbound]}>
            <Text style={styles.bubbleText}>{item.body}</Text>
          </View>
        )}
        style={{ flex: 1 }}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
          multiline
        />
        <TouchableOpacity onPress={() => messageText && send.mutate(messageText)} style={styles.sendBtn}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { padding: 16, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  name: { fontWeight: "600", fontSize: 15 },
  preview: { color: "#666", fontSize: 13, marginTop: 2 },
  back: { padding: 16, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  backText: { color: "#16a34a", fontWeight: "600" },
  bubble: { maxWidth: "75%", margin: 8, padding: 10, borderRadius: 12 },
  outbound: { alignSelf: "flex-end", backgroundColor: "#dcfce7" },
  inbound: { alignSelf: "flex-start", backgroundColor: "#f3f4f6" },
  bubbleText: { fontSize: 14 },
  composer: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderColor: "#e5e7eb", alignItems: "flex-end" },
  input: { flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { marginLeft: 8, backgroundColor: "#16a34a", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  sendText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
```

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/
git commit -m "feat(mobile): push notifications + full inbox chat functionality"
```

---

## Task 8: Mobile — Campaign Management Screen

**Files:**
- Create: `apps/mobile/app/(tabs)/campaigns.tsx`

- [ ] **Step 1: Create campaigns screen**

```tsx
// apps/mobile/app/(tabs)/campaigns.tsx
import { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API = process.env.EXPO_PUBLIC_API_URL;

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  _count?: { recipients: number };
}

const STATUS_COLOR: Record<string, string> = {
  draft: "#9ca3af",
  scheduled: "#3b82f6",
  running: "#f59e0b",
  completed: "#16a34a",
  failed: "#ef4444",
  aborted: "#6b7280",
};

export default function CampaignsScreen() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery<{ data: Campaign[] }>({
    queryKey: ["campaigns-mobile"],
    queryFn: () => fetch(`${API}/v1/campaigns`).then((r) => r.json()),
  });

  const abort = useMutation({
    mutationFn: (id: string) => fetch(`${API}/v1/campaigns/${id}/abort`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns-mobile"] }),
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <Text style={styles.header}>Campaigns</Text>
      <FlatList
        data={data?.data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.name}</Text>
              <View style={[styles.badge, { backgroundColor: `${STATUS_COLOR[item.status]}20` }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] ?? "#6b7280" }]}>{item.status}</Text>
              </View>
            </View>
            {item.scheduledAt && (
              <Text style={styles.meta}>Scheduled: {new Date(item.scheduledAt).toLocaleString("en-IN")}</Text>
            )}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => {}}>
                <Text style={styles.actionText}>Logs</Text>
              </TouchableOpacity>
              {item.status === "running" && (
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: "#ef4444" }]}
                  onPress={() => abort.mutate(item.id)}
                >
                  <Text style={[styles.actionText, { color: "#ef4444" }]}>Abort</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No campaigns yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 22, fontWeight: "700", padding: 16, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  card: { padding: 16, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "600", fontSize: 15, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  meta: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 6 },
  actionText: { fontSize: 12, color: "#374151" },
  empty: { textAlign: "center", color: "#9ca3af", padding: 40 },
});
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/mobile/app/\(tabs\)/campaigns.tsx
git commit -m "feat(mobile): campaign management screen with abort action"
```

---

## Task 9: Full test run + type-check

- [ ] **Step 1: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass

- [ ] **Step 2: Full type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(cycle6): Mobile + Scale — SuperAdmin, PlatformConfig, UPI QR, message cleanup cron, bot timing, Expo mobile"
```

---

## Cycle 6 Acceptance Criteria

- [ ] SuperAdmin opens `/admin/organizations`, sees all orgs, bans one with a reason — org status shows "banned"
- [ ] SuperAdmin clicks "Login As" on an org — frontend switches context to that org (impersonation)
- [ ] Platform config page lets SuperAdmin set Razorpay keys without redeployment
- [ ] UPI QR endpoint returns a scannable PNG QR for the UPI ID in env
- [ ] Message cleanup cron runs at 2am; orgs with `enable_automatic_message_deletion = true` have old messages removed
- [ ] Bot timing: set start 09:00 / end 18:00 IST — bot sessions outside that window are skipped
- [ ] Mobile app receives push notification for new message; inbox shows full conversation with working message send
- [ ] Campaign list in mobile shows status badges; running campaign has Abort button
- [ ] All API tests pass: `pnpm --filter @WBMSG/api test`
